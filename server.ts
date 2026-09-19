import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { execSync } from "child_process";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "./server/db";
import { generateDeterministicCampaignFallback } from "./server/fallbackCampaign";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb", verify: (req: any, _res, buffer) => { req.rawBody = buffer.toString("utf8"); } }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.static(path.join(process.cwd(), "public")));

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

const ACCESS_COOKIE = "u48_tool_access";
const provisioningSecret = () => (process.env.U48_PROVISION_SECRET || "").trim();
function signToken(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${createHmac("sha256", provisioningSecret()).update(encoded).digest("base64url")}`;
}
function verifyToken(token: string, purpose: "claim" | "access" | "order_poll"): any | null {
  const [encoded, supplied] = String(token || "").split(".");
  if (provisioningSecret().length < 32 || !encoded || !supplied) return null;
  const expected = createHmac("sha256", provisioningSecret()).update(encoded).digest("base64url");
  const a = Buffer.from(supplied), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return payload.purpose === purpose && Number(payload.exp) >= Math.floor(Date.now() / 1000) ? payload : null;
  } catch { return null; }
}
function cookieValue(req: express.Request, name: string): string {
  for (const item of String(req.headers.cookie || "").split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return "";
}
function authenticatedAccess(req: express.Request) {
  const payload = verifyToken(cookieValue(req, ACCESS_COOKIE), "access");
  if (!payload?.email || !payload?.subscriptionId) return null;
  const access = db.checkActiveAccess({ email: payload.email, subscriptionId: payload.subscriptionId });
  return access.hasAccess && access.subscription?.customerEmail.toLowerCase() === String(payload.email).toLowerCase() ? access : null;
}

app.post("/api/external/provision", (req: any, res) => {
  try {
    const secret = provisioningSecret();
    if (secret.length < 32) return res.status(503).json({ error: "U48_PROVISION_SECRET chưa được cấu hình." });
    const timestamp = String(req.headers["x-u48-timestamp"] || ""), supplied = String(req.headers["x-u48-signature"] || "");
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts * 1000) > 300000) return res.status(401).json({ error: "Yêu cầu đã hết hạn." });
    const expected = createHmac("sha256", secret).update(`${timestamp}.${req.rawBody || ""}`).digest("hex");
    const a = Buffer.from(supplied), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return res.status(401).json({ error: "Chữ ký không hợp lệ." });
    const orderCode = String(req.body.order_id || "").trim();
    const customerName = String(req.body.customer_name || "").trim();
    const customerEmail = String(req.body.email || "").toLowerCase().trim();
    const customerPhone = String(req.body.phone || "").trim();
    if (!orderCode || !customerName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) return res.status(400).json({ error: "Thiếu mã đơn, họ tên hoặc email hợp lệ." });
    const subscription = db.provisionExternalLifetime({ orderCode, customerName, customerEmail, customerPhone, amount: Number(req.body.amount || 0) });
    const claim = signToken({ purpose: "claim", email: customerEmail, subscriptionId: subscription.id, orderCode, exp: Math.floor(Date.now() / 1000) + 604800 });
    const baseUrl = (process.env.APP_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
    return res.json({ success: true, activation_url: `${baseUrl}/api/access/claim?token=${encodeURIComponent(claim)}` });
  } catch (error) { console.error("[External provision]", error); return res.status(500).json({ error: "Không thể cấp quyền Tool AI." }); }
});

app.get("/api/access/claim", (req, res) => {
  const payload = verifyToken(String(req.query.token || ""), "claim");
  if (!payload) return res.status(401).send("Liên kết kích hoạt không hợp lệ hoặc đã hết hạn.");
  const access = db.checkActiveAccess({ email: payload.email, subscriptionId: payload.subscriptionId });
  if (!access.hasAccess || !access.subscription) return res.status(403).send("Tài khoản này chưa được cấp quyền.");
  const token = signToken({ purpose: "access", email: payload.email, subscriptionId: access.subscription.id, exp: Math.floor(Date.now() / 1000) + 315360000 });
  res.setHeader("Set-Cookie", `${ACCESS_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=315360000`);
  return res.redirect("/");
});

export interface ProductImageItem {
  id: string;
  base64: string;
  mimeType: string;
  name: string;
  size?: number;
}

export interface GeneratePromptRequest {
  productName: string;
  productFeatures: string;
  productImages?: ProductImageItem[];
  productImageBase64?: string;
  productImageMimeType?: string;
  productImageName?: string;
  aspectRatio?: "9:16" | "16:9" | "1:1" | "4:3";
  factoryType: string;
  presenterDescription: string;
  targetPlatform?: string;
  toneStyle?: string;
  targetAudience?: string;
  brandColorTheme?: string;
  scriptLanguage?: string;
  aiEngine?: "midjourney" | "flux" | "kling" | "runway" | "luma" | "all";
  shotCountPreference?: number;
  userEmail?: string;
  userPhone?: string;
  userDeviceId?: string;
  subscriptionId?: string;
  userGeminiKey?: string;
}

const SYSTEM_INSTRUCTION = `You are a World-Class Creative Director & AI Prompt Engineer specializing in high-converting E-Commerce Video & Visual campaigns (TikTok Shop, Shopee Live, Facebook Reels, YouTube Shorts).
Your core mission is to convert product details, manufacturing plant/warehouse environment specs, and presenter/KOC persona into a production-ready package:
1. 7 IMAGE PROMPTS (Shot 1 to 7) strictly obeying the 16 IMAGE PROMPT RULES below (for Midjourney v6.1, Flux.1, Imagen, Ideogram).
2. 7 VIDEO PROMPTS (Video Shot 1 to 7) optimized for Kling AI 1.5 / Runway Gen-3 Alpha / Luma Dream Machine (cinematic clips creating a complete high-converting 20-30s viral narrative).
3. EXACT SUBTITLE TIMECODES (.SRT format with ms accuracy) & Voiceover Script (Vietnamese & English) for all 7 shots.
4. DIRECTOR'S PRODUCTION NOTES (Character consistency rules, lighting guidelines, sound mix cues, negative prompt masterlist, conversion triggers).

═══════════════════════════════════════════════════════════════════════════════
THE 16 MANDATORY RULES FOR IMAGE PROMPTS (BỘ 16 QUY TẮC BẮT BUỘC CHO PROMPT ẢNH)
═══════════════════════════════════════════════════════════════════════════════
QUY TẮC 1 — MỘT SHOT = MỘT KHOẢNH KHẮC DUY NHẤT (ONE SINGLE FROZEN MOMENT):
- Mỗi prompt chỉ mô tả một thời điểm duy nhất có thể chụp thành một bức ảnh tĩnh hoàn chỉnh.
- TUYỆT ĐỐI CẤM các từ/cấu trúc mang tính video: "then", "then transitions to", "after that", "camera moves", "camera pans", "camera zooms", "spinning then walking", "first... then...", "transition to another scene".
- Nếu có nhiều hành động, hãy chọn KHOẢNH KHẮC HÌNH ẢNH ĐẸP NHẤT để đại diện cho SHOT đó.
- Ví dụ:
  * SAI: "She spins, walks and then poses to show the outfit."
  * ĐÚNG: "She is captured mid-pose with one foot slightly forward, gently turning her torso to showcase the silhouette of the outfit."

QUY TẮC 2 — KHÓA CHÍNH XÁC SẢN PHẨM (EXACT PRODUCT & GARMENT LOCK):
- Nếu có ảnh sản phẩm tham chiếu, coi ảnh tham chiếu là nguồn nhận dạng chính xác tuyệt đối.
- Tích hợp mệnh lệnh nhận diện: "Use the provided reference product image as the exact visual identity source. Preserve the exact garment design, silhouette, proportions, fabric texture, collar shape, sleeve construction, cuff shape, button count and placement, hemline, shorts length, waistband, pockets, stitching details and original color. Do not redesign, simplify, exaggerate, add or remove any garment detail."
- CẤM TUYỆT ĐỐI:
  * Đổi cổ áo, đổi kiểu tay áo, đổi độ rộng áo.
  * Đổi chiều dài quần, đổi vị trí túi.
  * Thêm dây rút, thêm nơ, khóa, logo, họa tiết hoặc phụ kiện không tồn tại trên ảnh gốc.
  * Biến quần short thành váy/quần dài, biến áo oversized thành áo ôm.
  * Làm chất liệu khác ảnh tham chiếu.
- Nếu sản phẩm có nhiều màu, mỗi SHOT chỉ sử dụng đúng màu được chỉ định.

QUY TẮC 3 — KHÓA NHÂN VẬT DẪN DẮT (CHARACTER & GENDER CONSISTENCY ACROSS ALL SHOTS):
- TUYỆT ĐỐI TUÂN THỦ 100% GIỚI TÍNH & ĐẶC ĐIỂM NHÂN VẬT NGƯỜI DÙNG CHỌN trong trường mô tả nhân vật:
  * NẾU LÀ NAM (Nam KOC, Reviewer nam, Nam chuyên viên, Chủ xưởng nam, Kỹ sư nam...):
    - 100% tất cả Image Prompts và Video Prompts BẮT BUỘC PHẢI LÀ NAM: "Vietnamese male presenter / handsome male KOC / stylish male reviewer, 25-28 years old, confident masculine look, short neat dark hair, well-groomed, wearing stylish menswear (polo shirt / denim shirt / modern casual)...", sử dụng đại từ "he", "his", "him".
    - TUYỆT ĐỐI CẤM tạo thành NỮ (female / woman / girl / she / her) hoặc mô tả nét nữ tính.
  * NẾU LÀ NỮ (Nữ KOC, MC nữ, Nữ chuyên gia...):
    - 100% tất cả Image Prompts và Video Prompts là NỮ: "Vietnamese female KOC, 23-26 years old, attractive natural look, neat styled dark hair, natural makeup, friendly confident smile...", sử dụng đại từ "she", "her".
  * NẾU LÀ CẶP ĐÔI (Couple Nam & Nữ):
    - Thể hiện cả 2 nhân vật Nam & Nữ ăn ý trong các shot tương tác.
  * NẾU LÀ CHỦ XƯỞNG / CHUYÊN GIA:
    - Giữ đúng giới tính và trang phục/phong thái chuyên môn (áo blouse / đồng phục xưởng / sơ mi xắn tay).
- Giữ nguyên NHẤT QUÁN: Gương mặt, tuổi, màu da, kiểu tóc, vóc dáng, trang phục xuyên suốt từ Shot 1 đến Shot cuối cùng. Tuyệt đối không thay đổi nhân vật hoặc đổi giới tính giữa các shot.

QUY TẮC 4 — KHÓA BỐI CẢNH NHÀ XƯỞNG (FACTORY CONSISTENCY ACROSS ALL 7 SHOTS):
- Tất cả 7 SHOT phải thuộc CÙNG MỘT nhà máy hiện đại:
  "A large modern manufacturing factory with clean organized production zones, industrial ceiling LED strip lights, automated production equipment, professional workstations, neatly organized materials, uniformed workers in the background, realistic industrial architecture, clean commercial manufacturing environment."
- CẤM biến thành: Showroom, cửa hàng quần áo, nhà kho cũ, xưởng thủ công nhỏ, phòng khách, studio thời trang.
- Các SHOT ở các phân khu khác nhau của CÙNG nhà máy: khu cắt vải/chuẩn bị, khu may/lắp ráp, khu KCS/QC, khu đóng gói, kho thành phẩm.

QUY TẮC 5 — BỐ CỤC PHẢI PHỤC VỤ TỪNG SHOT (7 PURPOSE-DRIVEN SHOT COMPOSITIONS):
- SHOT 1 (Hook): KOC và sản phẩm chiếm ưu thế, eye contact mạnh, góc nhìn thu hút ngay lập tức (Lens 35–50mm).
- SHOT 2 (Fabric / Product Detail): Cận cảnh macro tập trung rõ vào chất liệu, đường may, nút bấm, bề mặt vật liệu; bàn tay KOC chạm nhẹ vào sản phẩm (Lens 85–100mm macro).
- SHOT 3 (Factory Scale): Khung hình rộng thể hiện quy mô nhà xưởng/kho thành phẩm nhưng KOC và sản phẩm vẫn dễ nhận diện (Lens 24–35mm).
- SHOT 4 (Production): Chọn MỘT công đoạn sản xuất duy nhất cho ảnh (khu cắt tự động hoặc khu may công nghiệp); không chuyển cảnh giữa hai khu vực (Lens 35–50mm).
- SHOT 5 (Fit / Product Demonstration): KOC mặc/cầm sản phẩm trong một tư thế tự nhiên duy nhất giúp nhìn rõ form dáng và công năng (Lens 50–85mm).
- SHOT 6 (CTA): KOC giữ sản phẩm và thực hiện một cử chỉ chỉ xuống góc dưới màn hình, nhưng TUYỆT ĐỐI KHÔNG tạo biểu tượng giỏ hàng, chữ TikTok, chữ Shopee hoặc giao diện UI giả trong ảnh (Lens 35–50mm).
- SHOT 7 (Color Options / Scarcity): KOC trình bày các màu/combo sản phẩm gọn gàng, sản phẩm không bị chồng chéo vô lý, không mọc thêm chi tiết dị dạng (Lens 50–85mm).

QUY TẮC 6 — TƯ THẾ NGƯỜI PHẢI TỰ NHIÊN & ĐÚNG GIẢI PHẪU TAY CHÂN:
- Mỗi SHOT chỉ sử dụng một pose rõ ràng.
- Bàn tay đúng giải phẫu: "five fingers per hand, anatomically correct hands, natural finger placement, realistic grip, realistic interaction with fabric".
- CẤM: extra fingers, fused fingers, missing fingers, duplicated hands, extra arms, twisted wrists, impossible grip.
- Mô tả chính xác tay nào cầm sản phẩm và tay nào tạo cử chỉ.

QUY TẮC 7 — KHÔNG TẠO QUÁ NHIỀU BẢN SAO SẢN PHẨM & KHÔNG DỊ DẠNG:
- Trong cảnh kho hàng hoặc dây chuyền, sản phẩm ở hậu cảnh đặt tự nhiên/đóng gói gọn gàng.
- CẤM tạo hàng trăm bộ quần áo/sản phẩm treo lơ lửng, cấm duplicated garment parts hoặc malformed clothing.

QUY TẮC 8 — PHOTOREALISTIC THAY VÌ "AI LOOK":
- Ưu tiên: "photorealistic commercial fashion photography, realistic Vietnamese skin texture, physically accurate fabric folds, realistic textile fibers, natural garment drape, realistic factory environment, believable industrial lighting, correct human anatomy, subtle depth of field, professional advertising photography".
- Tránh: plastic skin, over-smoothed face, CGI-looking fabric, surreal lighting, excessive HDR, artificial body proportions, fantasy factory environment.

QUY TẮC 9 — ÁNH SÁNG CHÂN THỰC NHÀ XƯỞNG:
- Sử dụng ceiling LED factory lighting làm ánh sáng môi trường chính, kết hợp soft key light nhẹ cho KOC.
- Không tạo ánh sáng studio quá giả hoặc glow quá mạnh. Giữ màu sản phẩm chính xác.

QUY TẮC 10 — CAMERA & LENS HỢP LÝ:
- Hook / Presenter: 35–50mm. Fabric detail: 85–100mm macro. Factory scale: 24–35mm. Production: 35–50mm. Fashion fit: 50–85mm. CTA: 35–50mm. Final product/color presentation: 50–85mm.

QUY TẮC 11 — TUYỆT ĐỐI KHÔNG ĐỂ AI TỰ SINH CHỮ HOẶC GIAO DIỆN UI:
- CẤM: Caption, giá tiền, rating, số lượng bán, logo TikTok, logo Shopee, nút Add to Cart, watermark, poster, chữ vô nghĩa.
- Bắt buộc gắn Negative constraint: "No generated text, no fake typography, no watermark, no floating UI, no TikTok interface, no Shopee interface, no price label, no rating graphics."

QUY TẮC 12 — NEGATIVE CONSTRAINTS BẮT BUỘC:
- Cuối mỗi prompt ảnh, LUÔN gắn đầy đủ:
  "Negative constraints: wrong garment design, altered clothing shape, incorrect sleeve design, incorrect collar, incorrect button placement, wrong shorts length, extra pockets, missing pockets, changed fabric texture, wrong product color, duplicated garment, malformed clothing, extra limbs, extra fingers, fused fingers, distorted hands, distorted face, duplicate person, unrealistic anatomy, floating objects, fake text, watermark, logo distortion, oversaturated colors, plastic skin, CGI appearance, no generated text, no fake typography, no floating UI, no TikTok interface, no Shopee interface, no price label, no rating graphics."

QUY TẮC 13 — THÔNG SỐ ENGINE & TỈ LỆ KHUNG HÌNH:
- Trong trường promptEn của Image Prompts, không nhét lệnh Midjourney (--ar, --v) vào giữa câu văn. Mô tả tỷ lệ theo dạng câu tự nhiên "Vertical 9:16 composition" hoặc để trong midjourneyParams.

QUY TẮC 14 — ĐỊNH DẠNG ĐẦU RA (MỘT ĐOẠN VĂN DUY NHẤT):
- Mỗi promptEn của từng SHOT BẮT BUỘC phải nằm trong MỘT ĐOẠN VĂN DUY NHẤT (Single continuous line, không chứa \n hoặc enter).
- Không tách thành các dòng Bối cảnh:, Camera:, Lighting:, Negative Prompt: bên trong promptEn.

QUY TẮC 15 — KHÔNG TRỘN LỜI THOẠI VÀO PROMPT ẢNH:
- Lời thoại KOC KHÔNG ĐƯỢC đặt bên trong promptEn của ảnh. Prompt ảnh chỉ mô tả những gì nhìn thấy được bằng mắt. Lời thoại KOC được đặt riêng biệt trong suggestedVoiceoverVi và suggestedVoiceoverEn.

QUY TẮC 16 — TỰ KIỂM TRA 10 TIÊU CHÍ TRƯỚC KHI XUẤT KẾT QUẢ:
1. Có phải đúng một ảnh tĩnh duy nhất không?
2. Có nhiều hành động/thời điểm trong cùng prompt không?
3. Sản phẩm có đúng ảnh tham chiếu không?
4. Màu sản phẩm có đúng không?
5. KOC có nhất quán không?
6. Nhà xưởng có đúng ngành sản xuất không?
7. Tay/chân/tỷ lệ người có đúng giải phẫu không?
8. Prompt có tránh sinh chữ/UI giả không?
9. Có từ khóa video/chuyển cảnh không?
10. Có chi tiết dư thừa nào không cần thiết không?

CRITICAL COMMUNITY GUIDELINES & AD POLICY COMPLIANCE:
1. Tuyệt đối không cam kết hiệu quả 100%, không cam kết chữa khỏi, không cam kết hoàn tiền tuyệt đối.
2. Cấm từ mang tính tuyệt đối: "100%", "nhất" ("tốt nhất", "rẻ nhất", "số 1", "duy nhất", "hoàn hảo nhất", "đỉnh nhất", "vô địch", "tuyệt đối").
3. Thay thế bằng: "chất lượng tận xưởng", "thiết kế sắc nét", "gia công tỉ mỉ", "chuẩn xuất khẩu", "mức giá ưu đãi tại xưởng", "sẵn sàng giao nhanh", "mời bạn bấm giỏ hàng trải nghiệm".

MANDATORY KOC VOICEOVER STYLE & BENCHMARK:
- Xưng hô gần gũi ("Các bác ơi", "Chị em ơi", "Cả nhà ơi").
- Ngôn từ sống động, dí dỏm, chân thực ("ta nói nó mê xỉu", "ngon sướng cái nách", "chuẩn năm sao trong một nốt nhạc", "thảnh thơi làm đẹp").
- Kêu gọi hành động (CTA) duyên dáng, thôi thúc bấm giỏ hàng trải nghiệm.`;

// Utility functions to enforce single-paragraph formatting and Community Guidelines
function cleanToSingleLine(text: string | undefined | null): string {
  if (!text) return "";
  return String(text).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function sanitizePolicyViolations(text: string | undefined | null): string {
  if (!text) return "";
  let cleaned = cleanToSingleLine(text);

  // Replace prohibited superlative words and absolute commitments
  cleaned = cleaned
    .replace(/\b100%\b/g, "toàn diện")
    .replace(/duy nhất/gi, "đặc biệt")
    .replace(/tốt nhất/gi, "chất lượng cao")
    .replace(/rẻ nhất/gi, "giá tận xưởng ưu đãi")
    .replace(/số 1/gi, "hàng đầu")
    .replace(/hoàn hảo nhất/gi, "tinh tế")
    .replace(/đỉnh nhất/gi, "vượt trội")
    .replace(/cam kết/gi, "khẳng định uy tín")
    .replace(/tuyệt đối/gi, "chuẩn xác")
    .replace(/vĩnh viễn/gi, "bền lâu")
    .replace(/trị dứt điểm/gi, "hỗ trợ chăm sóc");

  return cleaned;
}

const MANDATORY_IMAGE_NEGATIVE_CONSTRAINTS = "Negative constraints: wrong garment design, altered clothing shape, incorrect sleeve design, incorrect collar, incorrect button placement, wrong shorts length, extra pockets, missing pockets, changed fabric texture, wrong product color, duplicated garment, malformed clothing, extra limbs, extra fingers, fused fingers, distorted hands, distorted face, duplicate person, unrealistic anatomy, floating objects, fake text, watermark, logo distortion, oversaturated colors, plastic skin, CGI appearance, no generated text, no fake typography, no floating UI, no TikTok interface, no Shopee interface, no price label, no rating graphics.";

const STRICT_PRODUCT_LOCK_CLAUSE = "STRICT PRODUCT CONSISTENCY: Preserve the exact original product design throughout the entire video. No redesign, no shape change, no proportion change, no geometry deformation, no morphing, no warping, no added or removed parts. Keep the exact body shape, dimensions, door, handle, touchscreen, buttons, logo placement, materials, colors and accessories consistent with the reference product. Camera movement may change perspective only; the physical product itself must never change.";

const MANDATORY_NEGATIVE_CONSTRAINTS = "Negative constraints: product deformation, product morphing, changing product shape, inconsistent geometry, incorrect proportions, extra buttons, missing buttons, changing touchscreen position, distorted door, distorted handle, duplicated parts, missing parts, floating components, changing logo, wrong logo position, changing color, changing material, unrealistic mechanical transformation.";

function formatImagePromptWith16Rules(originalPrompt: string | undefined | null): string {
  let prompt = cleanToSingleLine(originalPrompt);
  if (!prompt) return "";

  // Remove video motion words if present
  prompt = prompt
    .replace(/\bthen transitions to\b/gi, "captured while")
    .replace(/\bspinning then walking\b/gi, "standing gracefully and")
    .replace(/\bfirst\.\.\. then\.\.\./gi, "")
    .replace(/\btransition to another scene\b/gi, "")
    .replace(/\bcamera moves\b/gi, "cinematic perspective")
    .replace(/\bcamera zooms\b/gi, "detailed perspective")
    .replace(/\bcamera pans\b/gi, "composed view");

  // Ensure negative constraints exist
  if (!prompt.includes("Negative constraints:")) {
    prompt = `${prompt}. ${MANDATORY_IMAGE_NEGATIVE_CONSTRAINTS}`;
  }

  return cleanToSingleLine(prompt);
}

function formatVideoPromptWithLocks(originalPrompt: string | undefined | null): string {
  let prompt = cleanToSingleLine(originalPrompt);
  if (!prompt) return "";

  // Ensure strict product consistency clause exists
  if (!prompt.includes("STRICT PRODUCT CONSISTENCY")) {
    prompt = `${prompt}. ${STRICT_PRODUCT_LOCK_CLAUSE}`;
  }

  // Ensure negative constraints exist
  if (!prompt.includes("Negative constraints:")) {
    prompt = `${prompt}. ${MANDATORY_NEGATIVE_CONSTRAINTS}`;
  }

  return cleanToSingleLine(prompt);
}

function sanitizeCampaignResult(data: any): any {
  if (!data) return data;

  if (Array.isArray(data.imagePrompts)) {
    data.imagePrompts = data.imagePrompts.map((img: any) => ({
      ...img,
      promptEn: formatImagePromptWith16Rules(img.promptEn),
      descriptionVi: sanitizePolicyViolations(img.descriptionVi),
      suggestedVoiceoverVi: sanitizePolicyViolations(img.suggestedVoiceoverVi),
      suggestedVoiceoverEn: cleanToSingleLine(img.suggestedVoiceoverEn),
      cameraLens: cleanToSingleLine(img.cameraLens),
      lightingSetup: cleanToSingleLine(img.lightingSetup),
      midjourneyParams: cleanToSingleLine(img.midjourneyParams),
      fluxParams: cleanToSingleLine(img.fluxParams),
    }));
  }

  if (Array.isArray(data.videoPrompts)) {
    data.videoPrompts = data.videoPrompts.map((vid: any) => ({
      ...vid,
      promptEn: formatVideoPromptWithLocks(vid.promptEn),
      descriptionVi: sanitizePolicyViolations(vid.descriptionVi),
      suggestedActionCueVi: sanitizePolicyViolations(vid.suggestedActionCueVi),
      voiceoverVi: sanitizePolicyViolations(vid.voiceoverVi),
      voiceoverEn: cleanToSingleLine(vid.voiceoverEn),
      cameraMovementEn: cleanToSingleLine(vid.cameraMovementEn),
      soundEffectPrompt: cleanToSingleLine(vid.soundEffectPrompt),
      klingSettings: cleanToSingleLine(vid.klingSettings),
      runwaySettings: cleanToSingleLine(vid.runwaySettings),
      lumaSettings: cleanToSingleLine(vid.lumaSettings),
    }));
  }

  if (Array.isArray(data.subtitles)) {
    data.subtitles = data.subtitles.map((sub: any) => ({
      ...sub,
      textVi: sanitizePolicyViolations(sub.textVi),
      textEn: cleanToSingleLine(sub.textEn),
    }));
  }

  if (data.creativeConceptTitle) {
    data.creativeConceptTitle = sanitizePolicyViolations(data.creativeConceptTitle);
  }
  if (data.creativeSummaryVi) {
    data.creativeSummaryVi = sanitizePolicyViolations(data.creativeSummaryVi);
  }

  return data;
}

// Helper for generating content with automatic retry and model fallback
async function generateWithRetryAndFallback(
  aiClient: GoogleGenAI,
  requestPayload: {
    contents: any;
    config: any;
  }
) {
  // Ordered by speed, quota reliability and capabilities
  const models = [
    "gemini-3.5-flash-lite", // Extremely fast (~1s), reliable quota, native JSON support
    "gemini-3.5-flash",      // High intelligence fallback
    "gemini-2.5-flash",      // Fast text model
    "gemini-3.8-flash",      // Official modern flash model
  ];
  let lastError: any = null;

  for (const model of models) {
    // Model-specific config adjustments
    const modelConfig: any = { ...requestPayload.config };

    // Only gemini-2.5-flash accepts thinkingBudget: 0 without throwing 400 Invalid Argument
    if (model === "gemini-2.5-flash") {
      modelConfig.thinkingConfig = {
        thinkingBudget: 0,
        ...(requestPayload.config?.thinkingConfig || {}),
      };
    } else {
      delete modelConfig.thinkingConfig;
    }

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[AI Request] Trying model ${model} (attempt ${attempt}/2)...`);
        const response = await aiClient.models.generateContent({
          model,
          contents: requestPayload.contents,
          config: modelConfig,
        });

        if (response && response.text) {
          return response;
        }
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);
        const errStatus = err?.status || err?.code;
        console.warn(`[AI Request] Model ${model} attempt ${attempt} failed:`, errMsg);

        const isTransient =
          errStatus === 503 ||
          errStatus === 429 ||
          errStatus === "UNAVAILABLE" ||
          errMsg.includes("503") ||
          errMsg.includes("429") ||
          errMsg.includes("high demand") ||
          errMsg.includes("UNAVAILABLE") ||
          errMsg.includes("temporarily") ||
          errMsg.includes("Resource has been exhausted") ||
          errMsg.includes("overloaded");

        if (isTransient && attempt < 2) {
          const delayMs = 400 + Math.floor(Math.random() * 300);
          console.log(`[AI Request] Retrying in ${delayMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        // If not transient or max attempt reached on this model, switch immediately to next model
        break;
      }
    }
  }

  throw lastError || new Error("Hệ thống AI hiện đang bận do lượng truy cập cao. Vui lòng thử lại.");
}

// API endpoint to generate full set
app.post("/api/generate-prompts", async (req, res) => {
  try {
    const data: GeneratePromptRequest = req.body;
    const access = authenticatedAccess(req);
    if (!access) return res.status(403).json({ error: "Email này chưa được cấp quyền. Vui lòng mở link kích hoạt trong email thanh toán." });

    if (!data.productName || !data.factoryType || !data.presenterDescription) {
      return res.status(400).json({
        error: "Vui lòng cung cấp đủ: Tên sản phẩm, Loại nhà xưởng, và Mô tả người dẫn dắt.",
      });
    }

    // Chế độ miễn phí: tạo toàn bộ chiến dịch bằng engine cục bộ.
    // Không gọi Gemini/Vertex, không cần API key và không phát sinh chi phí.
    const freeCampaign = generateDeterministicCampaignFallback(data);
    return res.json({ success: true, data: sanitizeCampaignResult(freeCampaign) });

    const chosenRatio = data.aspectRatio || "9:16";
    const chosenLanguage = data.scriptLanguage || "tiếng Việt";
    
    // Collect all uploaded product images (supporting multi-images or single legacy base64)
    const imagesToProcess: Array<{ base64: string; mimeType: string; name?: string }> = [];
    if (Array.isArray(data.productImages) && data.productImages.length > 0) {
      data.productImages.forEach((img: any) => {
        if (img?.base64) {
          imagesToProcess.push({
            base64: img.base64,
            mimeType: img.mimeType || "image/jpeg",
            name: img.name,
          });
        }
      });
    } else if (data.productImageBase64) {
      imagesToProcess.push({
        base64: data.productImageBase64,
        mimeType: data.productImageMimeType || "image/jpeg",
        name: data.productImageName,
      });
    }

    const hasImages = imagesToProcess.length > 0;
    const imageCountText = imagesToProcess.length > 1 
      ? `bộ ${imagesToProcess.length} ảnh sản phẩm thực tế (chụp đa góc: chính diện, góc nghiêng, tem nhãn, mặt sau, chi tiết phụ kiện)` 
      : `ảnh sản phẩm thực tế`;

    const targetShotCount = Math.max(3, Math.min(25, Number(data.shotCountPreference) || 7));

    const userPrompt = `
Dưới đây là thông tin dự án sản phẩm và nhà xưởng từ người dùng:

1. Tên sản phẩm & Đặc điểm chính:
${data.productName}
Chi tiết đặc điểm: ${data.productFeatures || "Bao bì bắt mắt, chuẩn chất lượng cao, tem nhãn sắc nét."}
${hasImages ? `⚠️ ĐẶC BIỆT: Người dùng ĐÃ TẢI LÊN ${imageCountText.toUpperCase()}. Hãy quan sát thật kỹ và phân tích sâu TẤT CẢ các ảnh đính kèm (hình dáng thân máy/chai/lọ/hộp, logo thương hiệu, bảng điều khiển, nút bấm, tay cầm, nắp, nhãn mác, màu sắc, chất liệu bóng/mờ/thủy tinh/kim loại/nhựa) để mô tả sản phẩm trong TẤT CẢ các Prompt tiếng Anh (Midjourney, Flux, Kling AI, Runway) đạt độ chính xác 100% nguyên vẹn như sản phẩm thực tế!` : ""}

2. Loại nhà máy/xưởng sản xuất:
${data.factoryType || "Nhà máy xưởng sản xuất hiện đại quy mô lớn, dây chuyền máy móc công nghệ cao tự động, kệ hàng pallet cao tầng, công nhân mặc đồng phục làm việc nhộn nhịp, khu kiểm định chất lượng và đóng gói thành phẩm chuyên nghiệp tạo uy tín vững chắc."}

3. Mô tả nhân vật dẫn dắt (Presenter/KOC):
${data.presenterDescription}
⚠️ ĐẶC BIỆT LƯU Ý VỀ GIỚI TÍNH & NHÂN VẬT (BẮT BUỘC TUÂN THỦ 100%):
- Đọc kỹ mô tả nhân vật trên:
  + Nếu là NAM (chứa các từ "Nam", "Reviewer nam", "Chàng trai", "Kỹ sư", "Chủ xưởng", "Founder nam"...): 100% tất cả Prompt Ảnh (Image Prompts) và Prompt Video (Video Prompts) PHẢI LÀ NAM ("Vietnamese male presenter / handsome male KOC / stylish male reviewer", đại từ "he", "his", "him", ngoại hình nam tính, tóc nam, trang phục nam). TUYỆT ĐỐI KHÔNG ĐƯỢC DÙNG "female", "woman", "girl", "she", "her".
  + Nếu là NỮ: 100% là Nữ ("female KOC", "she", "her").
  + Nếu là CẶP ĐÔI: Thể hiện cả cặp đôi nam nữ phối hợp ăn ý.
  + Nếu là CHUYÊN GIA / CHỦ XƯỞNG: Thể hiện đúng giới tính và phong thái chuyên môn như mô tả.
- Khóa đúng nhận diện nhân vật (gương mặt, trang phục, giới tính) nhất quán 100% từ Shot 1 đến Shot cuối cùng.

4. Thông tin bổ sung & Cấu hình ngôn ngữ:
- 🗣️ NGÔN NGỮ LỜI THOẠI & PHỤ ĐỀ YÊU CẦU: ${chosenLanguage}. 
  (LƯU Ý QUAN TRỌNG: Tất cả lời thoại KOC (suggestedVoiceoverVi, voiceoverVi) và nội dung phụ đề SRT (subtitles.textVi) BẮT BUỘC phải được viết bằng ${chosenLanguage} chuẩn xác, tự nhiên, truyền cảm và kích thích chuyển đổi cao theo đúng ngữ cảnh văn hóa ngôn ngữ này).
- Tỉ lệ khung hình yêu cầu: ${chosenRatio} (Hãy áp dụng tham số --ar ${chosenRatio} cho Midjourney và --aspect-ratio ${chosenRatio} cho Flux)
- Nền tảng mục tiêu: ${data.targetPlatform || "TikTok Shop / Shopee / Facebook Reels"}
- Phong cách / Tone: ${data.toneStyle || "Tự tin, uy tín tận xưởng, kích thích chốt đơn"}
- Đối tượng khách hàng: ${data.targetAudience || "Người tiêu dùng trực tuyến tìm nguồn hàng chất lượng tận xưởng"}
- Màu sắc chủ đạo: ${data.brandColorTheme || "Tự nhiên, sắc nét, công nghiệp hiện đại"}
- SỐ LƯỢNG SHOTS YÊU CẦU: CHÍNH XÁC ${targetShotCount} SHOTS (từ Shot 1 đến Shot ${targetShotCount}).

Hãy tạo chuẩn xác:
1. Bộ ${targetShotCount} Prompt Ảnh (Image Prompts) Midjourney v6.1 / Flux tỉ lệ ${chosenRatio} (Shot 1 đến Shot ${targetShotCount}, khắc họa chính xác sản phẩm ${hasImages ? `từ ${imagesToProcess.length} ảnh thực tế đính kèm` : ""}).
2. Bộ ${targetShotCount} Prompt Video (Video Prompts) Kling AI 1.5 / Runway Gen-3 tương ứng từng shot (1 đến ${targetShotCount}) với đầy đủ thông số camera movement, SFX, kịch bản lời thoại bằng ${chosenLanguage}, thời lượng.
3. Kịch bản phụ đề SRT bằng ${chosenLanguage} phân bổ thời gian chuẩn xác cho cả ${targetShotCount} shot từ 00:00:00,000 đến kết thúc video.
4. Các nốt sản xuất của Giám Đốc Sáng Tạo (Director Production Notes) bao gồm: hướng dẫn giữ nhân vật nhất quán (Character consistency), nốt ánh sáng, âm thanh, danh sách negative prompt, mẹo tối ưu chuyển đổi.`;

    const contents: any[] = [];
    if (hasImages) {
      for (const img of imagesToProcess) {
        const cleanBase64 = img.base64.replace(/^data:image\/[a-z0-9-+.]+;base64,/, "");
        contents.push({
          inlineData: {
            data: cleanBase64,
            mimeType: img.mimeType || "image/jpeg",
          },
        });
      }
      contents.push({ text: userPrompt });
    } else {
      contents.push(userPrompt);
    }

    // Support user's own Gemini API key if provided in request during valid subscription/trial
    const activeAi = data.userGeminiKey?.trim()
      ? new GoogleGenAI({
          apiKey: data.userGeminiKey.trim(),
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build",
            },
          },
        })
      : ai;

    let sanitizedData: any = null;

    try {
      const response = await generateWithRetryAndFallback(activeAi, {
        contents: contents,
        config: {
          systemInstruction: `${SYSTEM_INSTRUCTION}

BẮT BUỘC: Trả về một chuỗi JSON thuần túy (không bọc trong markdown code fence) theo đúng schema:
{
  "creativeConceptTitle": "Tên chiến dịch tiếng Việt",
  "creativeSummaryVi": "Tổng quan định hướng visual & thông điệp",
  "keyVisualTheme": "Tone màu & ánh sáng",
  "imagePrompts": [
    {
      "shotNumber": 1,
      "shotNameVi": "Tên shot tiếng Việt",
      "shotStage": "Hook",
      "descriptionVi": "Mô tả cảnh",
      "promptEn": "Prompt tiếng Anh 1 dòng duy nhất",
      "midjourneyParams": "--ar ${chosenRatio} --v 6.1",
      "fluxParams": "--aspect-ratio ${chosenRatio}",
      "cameraLens": "35mm f/1.8",
      "lightingSetup": "Soft commercial lighting",
      "suggestedVoiceoverVi": "Lời thoại KOC",
      "suggestedVoiceoverEn": "English voiceover",
      "durationRecommendation": "3s",
      "negativePrompt": "Negative constraints",
      "actorExpressionVi": "Biểu cảm"
    }
  ],
  "videoPrompts": [
    {
      "videoNumber": 1,
      "titleVi": "Tiêu đề shot video",
      "motionType": "Slow push in",
      "shotCategory": "hook",
      "descriptionVi": "Mô tả chuyển động",
      "promptEn": "Prompt video tiếng Anh 1 dòng duy nhất",
      "cameraMovementEn": "Smooth push-in",
      "recommendedDuration": "4s",
      "soundEffectPrompt": "Ambient factory hum",
      "klingSettings": "Camera: push in",
      "runwaySettings": "Motion: 5",
      "lumaSettings": "Loop: false",
      "suggestedActionCueVi": "Hành động KOC",
      "voiceoverVi": "Lời thoại video",
      "voiceoverEn": "English voiceover",
      "timecodeStart": "00:00:00,000",
      "timecodeEnd": "00:00:04,000"
    }
  ],
  "subtitles": [
    {
      "id": 1,
      "startTime": "00:00:00,000",
      "endTime": "00:00:04,000",
      "textVi": "Nội dung phụ đề",
      "speaker": "KOC"
    }
  ],
  "directorNotes": {
    "characterConsistencyGuideVi": "Hướng dẫn nhân vật",
    "lightingAndAestheticsVi": "Hướng dẫn ánh sáng",
    "soundDesignAndAudioMixVi": "Hướng dẫn âm thanh",
    "negativePromptsList": ["Negative constraints..."],
    "viralHookStrategiesVi": ["Chiến lược viral hook"],
    "conversionOptimizationTipsVi": ["Mẹo chốt đơn"]
  },
  "productionTipsVi": ["Mẹo sản xuất 1", "Mẹo sản xuất 2", "Mẹo sản xuất 3"]
}`,
          responseMimeType: "application/json",
        },
      });

      let resultText = response.text || "";
      if (!resultText) {
        throw new Error("Không nhận được dữ liệu từ AI.");
      }

      resultText = resultText.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
      const firstBrace = resultText.indexOf("{");
      const lastBrace = resultText.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        resultText = resultText.substring(firstBrace, lastBrace + 1);
      }

      let parsed: any = null;
      try {
        parsed = JSON.parse(resultText);
      } catch (parseErr) {
        console.warn("[AI JSON] Initial parse failed, attempting trailing comma cleanup...", parseErr);
        const cleaned = resultText.replace(/,\s*([\]}])/g, "$1").replace(/[\u0000-\u001F]+/g, " ");
        parsed = JSON.parse(cleaned);
      }

      sanitizedData = sanitizeCampaignResult(parsed);
    } catch (aiError: any) {
      console.warn("[AI Generation Fallback] Primary AI failed, using deterministic production generator:", aiError?.message || aiError);
      const fallbackResult = generateDeterministicCampaignFallback(data);
      sanitizedData = sanitizeCampaignResult(fallbackResult);
    }

    return res.json({ success: true, data: sanitizedData });
  } catch (error: any) {
    console.error("Error in generate-prompts endpoint:", error);
    try {
      const emergencyFallback = generateDeterministicCampaignFallback(req.body);
      return res.json({ success: true, data: sanitizeCampaignResult(emergencyFallback) });
    } catch (finalErr: any) {
      let userFriendlyMsg = error.message || "Đã xảy ra lỗi khi tạo bộ prompt.";
      return res.status(500).json({ error: userFriendlyMsg });
    }
  }
});

// Refine single shot endpoint
app.post("/api/refine-single-prompt", async (req, res) => {
  try {
    const { type, shotData, userFeedback, productContext } = req.body;

    const updatedShot: any = { ...(shotData || {}) };
    const feedback = cleanToSingleLine(userFeedback || "Tối ưu cảnh quay rõ ràng, tự nhiên và thuyết phục hơn");
    const productName = cleanToSingleLine(productContext?.productName || "sản phẩm");
    const factoryType = cleanToSingleLine(productContext?.factoryType || "xưởng sản xuất");
    if (updatedShot.promptEn) {
      updatedShot.promptEn = cleanToSingleLine(`${updatedShot.promptEn} Refine direction: ${feedback}. Preserve the exact identity of ${productName}, authentic ${factoryType}, natural commercial lighting, realistic anatomy, no text, no watermark.`);
    }
    if (updatedShot.descriptionVi) {
      updatedShot.descriptionVi = sanitizePolicyViolations(`${updatedShot.descriptionVi} Điều chỉnh: ${feedback}.`);
    }
    if (type === "video" && updatedShot.suggestedActionCueVi) {
      updatedShot.suggestedActionCueVi = sanitizePolicyViolations(`${updatedShot.suggestedActionCueVi}. ${feedback}`);
    }
    return res.json({ success: true, updatedShot });

    const prompt = `
Dưới đây là shot hiện tại:
${JSON.stringify(shotData, null, 2)}

Ngữ cảnh sản phẩm:
${JSON.stringify(productContext || {}, null, 2)}

Yêu cầu điều chỉnh của người dùng:
"${userFeedback}"

YÊU CẦU BẮT BUỘC:
1. TUÂN THỦ NGUYÊN TẮC CỘNG ĐỒNG: Tuyệt đối không cam kết, không dùng các từ tuyệt đối ("100%", "nhất", "tốt nhất", "rẻ nhất", "duy nhất", "số 1", "tuyệt đối", "vĩnh viễn").
2. ĐỊNH DẠNG PROMPT: Mỗi prompt tiếng Anh (promptEn) và mô tả BẮT BUỘC phải nằm trong 1 ĐOẠN VĂN DUY NHẤT (không xuống dòng, không enter/newline).
3. Tỷ lệ khung hình chuẩn cinematic, bối cảnh xưởng thật.

Hãy cập nhật và tối ưu lại shot này. Trả về JSON tương ứng với cấu trúc của shot.`;

    const response = await generateWithRetryAndFallback(ai, {
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    let resultText = response.text || "{}";
    resultText = resultText.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(resultText);
    
    // Sanitize refined shot
    if (parsed.promptEn) parsed.promptEn = cleanToSingleLine(parsed.promptEn);
    if (parsed.descriptionVi) parsed.descriptionVi = sanitizePolicyViolations(parsed.descriptionVi);
    if (parsed.suggestedVoiceoverVi) parsed.suggestedVoiceoverVi = sanitizePolicyViolations(parsed.suggestedVoiceoverVi);
    if (parsed.voiceoverVi) parsed.voiceoverVi = sanitizePolicyViolations(parsed.voiceoverVi);
    if (parsed.suggestedActionCueVi) parsed.suggestedActionCueVi = sanitizePolicyViolations(parsed.suggestedActionCueVi);
    if (parsed.cameraMovementEn) parsed.cameraMovementEn = cleanToSingleLine(parsed.cameraMovementEn);
    if (parsed.soundEffectPrompt) parsed.soundEffectPrompt = cleanToSingleLine(parsed.soundEffectPrompt);

    return res.json({ success: true, updatedShot: parsed });
  } catch (error: any) {
    console.error("Error refining shot:", error);
    let userFriendlyMsg = error.message || "Lỗi khi tinh chỉnh shot.";
    if (userFriendlyMsg.includes("503") || userFriendlyMsg.includes("high demand") || userFriendlyMsg.includes("UNAVAILABLE")) {
      userFriendlyMsg = "Hệ thống AI đang chịu tải tạm thời, vui lòng thử lại sau vài giây.";
    }
    return res.status(500).json({ error: userFriendlyMsg });
  }
});

// Endpoint: AI Gợi Ý Nhân Vật Dẫn Dắt (Presenter / KOC / MC)
app.post("/api/suggest-presenter", async (req, res) => {
  try {
    const { productName, factoryType, gender, productFeatures } = req.body;

    const genderText = sanitizePolicyViolations(gender || "Nữ");
    const freeSuggested = `${genderText}, khoảng 25–35 tuổi, ngoại hình sáng và thân thiện, mặc trang phục gọn gàng phù hợp bối cảnh ${sanitizePolicyViolations(factoryType || "xưởng sản xuất")}. Nhân vật có thần thái tự tin, thao tác trực tiếp với ${sanitizePolicyViolations(productName || "sản phẩm")}, giọng nói rõ ràng và nhấn mạnh ${sanitizePolicyViolations(productFeatures || "điểm nổi bật của sản phẩm")} một cách chân thực.`;
    return res.json({ success: true, suggestedPresenter: freeSuggested });

    const prompt = `Bạn là Giám đốc Sáng tạo chuyên về sản xuất video E-commerce và Livestream nguồn hàng tận xưởng (TikTok Shop / Shopee / Reels).
Dựa trên thông tin:
- Tên sản phẩm: ${productName || "Sản phẩm xưởng sản xuất"}
- Điểm nổi bật/USP: ${productFeatures || "Chất lượng cao, giá xưởng tận gốc"}
- Bối cảnh xưởng: ${factoryType || "Xưởng sản xuất hiện đại"}
- Giới tính/đối tượng dẫn dắt: ${gender || "Nữ"}

HÃY VIẾT 1 ĐOẠN MÔ TẢ NHÂN VẬT DẪN DẮT (Presenter / KOC / MC) hoàn hảo nhất:
1. Nêu rõ: Giới tính (${gender || "Nữ"}), độ tuổi phù hợp, ngoại hình/gương mặt, trang phục (phù hợp vừa quay trong xưởng vừa tôn sản phẩm), thần thái (năng động/uy tín/thân thiện/tự tin), biểu cảm và chất giọng dẫn dắt.
2. Viết súc tích 2-3 câu bằng tiếng Việt tự nhiên, chuẩn kịch bản quay video xưởng triệu view.
3. Tuyệt đối tuân thủ tiêu chuẩn cộng đồng: Không dùng từ cam kết phóng đại (100%, nhất, tốt nhất).

Trả về định dạng JSON:
{
  "suggestedPresenter": "Mô tả chi tiết nhân vật ở đây..."
}`;

    const response = await generateWithRetryAndFallback(ai, {
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    let resultText = response.text || "{}";
    resultText = resultText.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(resultText);
    const suggested = sanitizePolicyViolations(parsed.suggestedPresenter || "");

    return res.json({ success: true, suggestedPresenter: suggested });
  } catch (error: any) {
    console.error("Error suggesting presenter:", error);
    return res.status(500).json({ error: "Không thể tạo gợi ý lúc này, vui lòng thử lại." });
  }
});

// API to upload and persist avatar
app.post("/api/upload-avatar", (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Chưa có dữ liệu ảnh" });
    }
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");

    const publicDir = path.join(process.cwd(), "public");
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    fs.writeFileSync(path.join(publicDir, "BiBo BiBa English.jpg"), buffer);
    fs.writeFileSync(path.join(publicDir, "avatar.jpg"), buffer);

    const distDir = path.join(process.cwd(), "dist");
    if (fs.existsSync(distDir)) {
      fs.writeFileSync(path.join(distDir, "BiBo BiBa English.jpg"), buffer);
      fs.writeFileSync(path.join(distDir, "avatar.jpg"), buffer);
    }

    return res.json({ success: true, message: "Avatar đã được lưu thành công" });
  } catch (error: any) {
    console.error("Error saving avatar:", error);
    return res.status(500).json({ error: "Không thể lưu avatar" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SEPAY PAYMENT & PLANS ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/plans: Danh sách gói cước khả dụng
app.get("/api/plans", (req, res) => {
  try {
    const plans = db.getPlans();
    return res.json({ success: true, plans });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Lỗi lấy danh sách gói" });
  }
});

// POST /api/orders/create: Tạo đơn hàng mới
app.post("/api/orders/create", (req, res) => {
  try {
    const { planId, customerName, customerEmail, customerPhone, note, deviceId } = req.body;

    if (!customerName || !customerName.trim()) {
      return res.status(400).json({ error: "Vui lòng nhập họ và tên của bạn." });
    }
    if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) {
      return res.status(400).json({ error: "Vui lòng nhập email hợp lệ (VD: ten@gmail.com)." });
    }
    if (!customerPhone || customerPhone.trim().length < 8) {
      return res.status(400).json({ error: "Vui lòng nhập số điện thoại hợp lệ." });
    }

    const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress;

    const order = db.createOrder({
      planId: planId || "plan_lifetime",
      customerName,
      customerEmail,
      customerPhone,
      note,
      ipAddress,
      deviceId,
    });

    const sepay = db.getSePaySettings();
    const bankCode = sepay.bankCode || "MB";
    const accountNumber = sepay.accountNumber || "0988888888";
    const accountName = sepay.accountName || "NGUYEN HUYNH HONG";
    const amount = order.amount;
    const orderCode = order.orderCode;

    // SePay & VietQR dynamic QR image URLs
    const qrUrl = `https://qr.sepay.vn/img?acc=${accountNumber}&bank=${bankCode}&amount=${amount}&des=${encodeURIComponent(orderCode)}&template=compact`;
    const fallbackQrUrl = `https://api.vietqr.io/image/${bankCode}-${accountNumber}-compact2.jpg?amount=${amount}&addInfo=${encodeURIComponent(orderCode)}&accountName=${encodeURIComponent(accountName)}`;

    return res.json({
      success: true,
      order,
      pollToken: signToken({ purpose: "order_poll", orderCode: order.orderCode, orderId: order.orderId, exp: Math.floor(Date.now() / 1000) + 86400 }),
      qrUrl,
      fallbackQrUrl,
      bankInfo: {
        bankName: sepay.bankName,
        bankCode,
        accountNumber,
        accountName,
        amount,
        paymentContent: orderCode,
      },
    });
  } catch (error: any) {
    console.error("Error creating order:", error);
    return res.status(500).json({ error: error.message || "Lỗi tạo đơn hàng." });
  }
});

// GET /api/orders/:orderCode/status: Frontend kiểm tra trạng thái đơn hàng mỗi 5 giây
app.get("/api/orders/:orderCode/status", (req, res) => {
  try {
    const { orderCode } = req.params;
    const order = db.getOrderByCode(orderCode);

    if (!order) {
      return res.status(404).json({ error: "Không tìm thấy đơn hàng này." });
    }
    const poll = verifyToken(String(req.query.token || ""), "order_poll");
    if (!poll || poll.orderCode !== order.orderCode || poll.orderId !== order.orderId) {
      return res.status(401).json({ error: "Mã kiểm tra đơn hàng không hợp lệ." });
    }

    const isPaid = order.status === "paid";
    let subscription = null;
    if (isPaid) {
      subscription = db.getSubscriptionByEmail(order.customerEmail) || null;
      if (subscription) {
        const token = signToken({ purpose: "access", email: subscription.customerEmail, subscriptionId: subscription.id, exp: Math.floor(Date.now() / 1000) + 315360000 });
        res.setHeader("Set-Cookie", `${ACCESS_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=315360000`);
      }
    }

    return res.json({
      success: true,
      orderCode: order.orderCode,
      status: order.status,
      isPaid,
      order,
      subscription,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Lỗi kiểm tra đơn hàng." });
  }
});

// POST /api/sepay-webhook: Nhận webhook từ SePay gửi về
app.post("/api/sepay-webhook", (req, res) => {
  try {
    const sepay = db.getSePaySettings();

    // Verify webhook secret if configured
    if (sepay.webhookSecret) {
      const authHeader = req.headers["authorization"] || "";
      const customSecretHeader = req.headers["x-sepay-secret"] as string;
      const expectedToken = sepay.webhookSecret.trim();

      const isAuthorized =
        authHeader.includes(expectedToken) ||
        customSecretHeader === expectedToken ||
        (req.query.secret && req.query.secret === expectedToken);

      if (!isAuthorized) {
        console.warn("[SePay Webhook] Webhook Secret không khớp.");
        db.addWebhookLog({
          content: "Webhook unauthorized attempt",
          amount: 0,
          processResult: "error",
          errorMessage: "Webhook Secret không đúng",
          rawPayload: req.body,
        });
        return res.status(401).json({ error: "Unauthorized SePay webhook" });
      }
    }

    const payload = req.body || {};
    console.log("[SePay Webhook Received]:", JSON.stringify(payload));

    const content = String(payload.content || payload.description || payload.code || "");
    const transferAmount = Number(payload.transferAmount || payload.amount || 0);
    const transferType = String(payload.transferType || "in").toLowerCase();

    // Only process money in
    if (transferType === "out") {
      db.addWebhookLog({
        content,
        amount: transferAmount,
        processResult: "ignored",
        errorMessage: "Giao dịch tiền ra (bỏ qua)",
        rawPayload: payload,
      });
      return res.json({ success: true, message: "Ignored outgoing transfer" });
    }

    // Extract Order Code using order prefix (default "AFF" + 6 digits)
    const prefix = (sepay.orderPrefix || "AFF").toUpperCase().trim();
    const regex = new RegExp(`(${prefix}\\d{6})`, "i");
    const match = content.match(regex);
    const detectedOrderCode = match ? match[1].toUpperCase() : undefined;

    if (!detectedOrderCode) {
      db.addWebhookLog({
        content,
        amount: transferAmount,
        processResult: "ignored",
        errorMessage: "Nội dung chuyển khoản không chứa mã đơn hàng",
        rawPayload: payload,
      });
      return res.json({ success: true, message: "No order code found in transfer content" });
    }

    const order = db.getOrderByCode(detectedOrderCode);
    if (!order) {
      db.addWebhookLog({
        content,
        amount: transferAmount,
        detectedOrderCode,
        processResult: "error",
        errorMessage: `Mã đơn hàng ${detectedOrderCode} không tồn tại trong hệ thống`,
        rawPayload: payload,
      });
      return res.json({ success: true, message: "Order not found" });
    }

    // If order is already paid, do not re-activate
    if (order.status === "paid") {
      db.addWebhookLog({
        content,
        amount: transferAmount,
        detectedOrderCode,
        processResult: "already_paid",
        errorMessage: "Đơn hàng đã thanh toán trước đó (tránh active trùng)",
        rawPayload: payload,
      });
      return res.json({ success: true, message: "Order already paid" });
    }

    // If insufficient amount
    if (transferAmount < order.amount) {
      order.note = `${order.note ? order.note + " | " : ""}Chuyển thiếu tiền: Đã nhận ${transferAmount}đ / Cần ${order.amount}đ`;
      db.save();
      db.addWebhookLog({
        content,
        amount: transferAmount,
        detectedOrderCode,
        processResult: "mismatch_amount",
        errorMessage: `Đúng mã đơn nhưng thiếu tiền: Nhận ${transferAmount}đ / Yêu cầu ${order.amount}đ`,
        rawPayload: payload,
      });
      return res.json({ success: true, message: "Insufficient transfer amount. Manual check required." });
    }

    // Valid payment! Mark order as paid and activate subscription
    const result = db.markOrderAsPaid(detectedOrderCode, {
      amount: transferAmount,
      bankCode: payload.gateway || sepay.bankCode,
      accountNumber: payload.accountNumber,
      transactionContent: content,
      gateway: payload.gateway || "SePay",
      referenceCode: payload.referenceCode || String(payload.id || ""),
      rawWebhookData: payload,
    });

    db.addWebhookLog({
      content,
      amount: transferAmount,
      detectedOrderCode,
      processResult: "success",
      rawPayload: payload,
    });

    console.log(`[SePay Webhook] Kích hoạt thành công đơn hàng ${detectedOrderCode} cho khách hàng ${order.customerName}`);

    return res.json({
      success: true,
      message: "Xác nhận thanh toán và kích hoạt gói thành công!",
      order: result?.order,
      subscription: result?.subscription,
    });
  } catch (error: any) {
    console.error("Error processing SePay webhook:", error);
    db.addWebhookLog({
      content: "Error in webhook processing",
      amount: 0,
      processResult: "error",
      errorMessage: error.message || "Lỗi xử lý webhook",
      rawPayload: req.body,
    });
    return res.status(500).json({ error: "Internal webhook processing error" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TRIAL (DÙNG THỬ) ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/trial/register: Đăng ký dùng thử
app.post("/api/trial/register", (req, res) => {
  try {
    const customerName = (req.body.customerName || req.body.name || "").trim();
    const customerEmail = (req.body.customerEmail || req.body.email || "").toLowerCase().trim();
    const customerPhone = (req.body.customerPhone || req.body.phone || "").trim();
    const deviceId = req.body.deviceId || "";
    const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"] as string;

    const result = db.registerTrial({
      customerName,
      customerEmail,
      customerPhone,
      deviceId,
      ipAddress,
      userAgent,
    });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    if (result.subscription) {
      const token = signToken({ purpose: "access", email: result.subscription.customerEmail, subscriptionId: result.subscription.id, exp: Math.floor(Date.now() / 1000) + 315360000 });
      res.setHeader("Set-Cookie", `${ACCESS_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=315360000`);
    }

    return res.json({
      success: true,
      subscription: result.subscription,
      message: "Kích hoạt dùng thử thành công!",
    });
  } catch (error: any) {
    console.error("Error registering trial:", error);
    return res.status(500).json({ error: error.message || "Lỗi khi đăng ký dùng thử." });
  }
});

// GET /api/trial/status: Kiểm tra trạng thái dùng thử
app.get("/api/trial/status", (req, res) => {
  try {
    const email = req.query.email as string;
    const phone = req.query.phone as string;
    const deviceId = req.query.deviceId as string;
    const subscriptionId = req.query.subscriptionId as string;

    const access = db.checkActiveAccess({ email, phone, deviceId, subscriptionId });
    const trialSettings = db.getTrialSettings();

    return res.json({
      success: true,
      access,
      trialSettings: {
        isEnabled: trialSettings.isEnabled,
        trialHours: trialSettings.trialHours,
        buttonTitle: trialSettings.buttonTitle,
        description: trialSettings.description,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Lỗi kiểm tra dùng thử" });
  }
});

// GET /api/subscription/status: Kiểm tra tổng thể quyền sử dụng
app.get("/api/subscription/status", (req, res) => {
  try {
    const access = authenticatedAccess(req);
    return res.json({ success: true, access: access || { hasAccess: false, subscriptionType: "none" } });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Lỗi kiểm tra quyền truy cập" });
  }
});

// GET /api/export-zip: Tải toàn bộ mã nguồn dưới dạng file ZIP
app.get("/api/export-zip", (req, res) => {
  try {
    const zipPath = path.join(process.cwd(), "public", "review-san-pham-tai-xuong.zip");
    execSync("python3 scripts/export_zip.py", { cwd: process.cwd() });

    res.download(zipPath, "review-san-pham-tai-xuong-huynh-hong.zip", (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: "Lỗi tải file zip" });
      }
    });
  } catch (error: any) {
    console.error("Lỗi xuất file ZIP:", error);
    res.status(500).json({ error: "Không thể tạo file ZIP: " + error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || "aitienphong";
const ADMIN_EMAIL = "aitienphong@gmail.com";

// Middleware xác thực quyền quản trị
const requireAdminAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const passcode = (req.headers["x-admin-passcode"] as string) || (req.query.passcode as string);
  const googEmail = (req.headers["x-goog-authenticated-user-email"] as string) || "";

  if (
    passcode === ADMIN_PASSCODE ||
    (googEmail && googEmail.toLowerCase().includes(ADMIN_EMAIL))
  ) {
    return next();
  }

  return res.status(401).json({ error: "Mật khẩu quản trị không chính xác." });
};

// POST /api/admin/login: Xác thực passcode quản trị
app.post("/api/admin/login", (req, res) => {
  const { passcode } = req.body;
  if (passcode === ADMIN_PASSCODE) {
    return res.json({ success: true, message: "Đăng nhập quản trị thành công." });
  }
  return res.status(401).json({ error: "Mật khẩu quản trị không chính xác." });
});

// GET /api/admin/verify: Kiểm tra trạng thái đăng nhập quản trị
app.get("/api/admin/verify", requireAdminAuth, (req, res) => {
  return res.json({ success: true, message: "Đã xác thực quản trị thành công." });
});

// GET /api/admin/dashboard-stats: Thống kê nhanh
app.get("/api/admin/dashboard-stats", requireAdminAuth, (req, res) => {
  try {
    const stats = db.getDashboardStats();
    return res.json({ success: true, stats });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET & POST /api/admin/plans: Quản lý gói
app.get("/api/admin/plans", requireAdminAuth, (req, res) => {
  return res.json({ success: true, plans: db.getAllPlans() });
});

app.post("/api/admin/plans/:id", requireAdminAuth, (req, res) => {
  const updated = db.updatePlan(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: "Không tìm thấy gói." });
  return res.json({ success: true, plan: updated });
});

// GET & POST /api/admin/sepay-settings: Quản lý cấu hình SePay
app.get("/api/admin/sepay-settings", requireAdminAuth, (req, res) => {
  const settings = db.getSePaySettings();
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
  const computedWebhookUrl = `${appUrl.replace(/\/$/, "")}/api/sepay-webhook`;

  return res.json({
    success: true,
    settings: {
      ...settings,
      webhookUrl: settings.webhookUrl || computedWebhookUrl,
    },
  });
});

app.post("/api/admin/sepay-settings", requireAdminAuth, (req, res) => {
  const updated = db.updateSePaySettings(req.body);
  return res.json({ success: true, settings: updated, message: "Đã lưu cấu hình SePay thành công." });
});

// POST /api/admin/sepay-test-connection: Kiểm tra kết nối SePay
app.post("/api/admin/sepay-test-connection", requireAdminAuth, (req, res) => {
  const sepay = db.getSePaySettings();
  const errors: string[] = [];

  if (!sepay.apiKey && !process.env.SEPAY_API_KEY) {
    errors.push("Chưa nhập SePay API Key.");
  }
  if (!sepay.webhookSecret && !process.env.SEPAY_WEBHOOK_SECRET) {
    errors.push("Chưa nhập Webhook Secret.");
  }
  if (!sepay.accountNumber || !sepay.bankCode || !sepay.accountName) {
    errors.push("Thiếu thông tin tài khoản ngân hàng (Số TK, Tên NH, Chủ TK).");
  }

  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
  const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/sepay-webhook`;

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Kết nối chưa hoàn tất: ${errors.join(" ")}`,
      diagnostics: {
        hasApiKey: Boolean(sepay.apiKey || process.env.SEPAY_API_KEY),
        hasWebhookSecret: Boolean(sepay.webhookSecret || process.env.SEPAY_WEBHOOK_SECRET),
        hasBankInfo: Boolean(sepay.accountNumber && sepay.bankCode),
        webhookUrl,
      },
    });
  }

  return res.json({
    success: true,
    message: "Kết nối SePay thành công. Webhook đã sẵn sàng nhận giao dịch.",
    diagnostics: {
      hasApiKey: true,
      hasWebhookSecret: true,
      hasBankInfo: true,
      bankName: sepay.bankName,
      accountNumber: sepay.accountNumber,
      accountName: sepay.accountName,
      webhookUrl,
    },
  });
});

// POST /api/admin/sepay-test-transaction: Tạo giao dịch giả lập test tự động active gói
app.post("/api/admin/sepay-test-transaction", requireAdminAuth, (req, res) => {
  const { orderCode, amount } = req.body;
  let targetOrder = orderCode ? db.getOrderByCode(orderCode) : db.getAllOrders().find((o) => o.status === "pending");

  if (!targetOrder) {
    // Create a dummy pending order first to test with
    targetOrder = db.createOrder({
      planId: "plan_lifetime",
      customerName: "Khách hàng Test SePay",
      customerEmail: "test.sepay@gmail.com",
      customerPhone: "0901234567",
      note: "Đơn hàng giả lập test hệ thống",
    });
  }

  const payAmount = Number(amount) || targetOrder.amount;
  const result = db.markOrderAsPaid(targetOrder.orderCode, {
    amount: payAmount,
    bankCode: "MB",
    accountNumber: "0988888888",
    transactionContent: `${targetOrder.orderCode} test chuyen khoan`,
    gateway: "SePay (Simulated Test)",
    referenceCode: `TEST_REF_${Date.now()}`,
  });

  db.addWebhookLog({
    content: `${targetOrder.orderCode} test chuyen khoan`,
    amount: payAmount,
    detectedOrderCode: targetOrder.orderCode,
    processResult: "success",
    rawPayload: { simulated: true, orderCode: targetOrder.orderCode, amount: payAmount },
  });

  return res.json({
    success: true,
    message: `Đã tạo giao dịch test thành công cho mã đơn ${targetOrder.orderCode} và kích hoạt gói sử dụng!`,
    order: result?.order,
    subscription: result?.subscription,
  });
});

// GET & POST /api/admin/trial-settings: Quản lý cài đặt dùng thử
app.get("/api/admin/trial-settings", requireAdminAuth, (req, res) => {
  return res.json({ success: true, settings: db.getTrialSettings() });
});

app.post("/api/admin/trial-settings", requireAdminAuth, (req, res) => {
  const updated = db.updateTrialSettings(req.body);
  return res.json({ success: true, settings: updated, message: "Đã lưu cấu hình dùng thử thành công." });
});

// GET /api/admin/orders: Danh sách đơn hàng
app.get("/api/admin/orders", requireAdminAuth, (req, res) => {
  return res.json({ success: true, orders: db.getAllOrders() });
});

// GET /api/admin/webhook-logs: Lịch sử webhook
app.get("/api/admin/webhook-logs", requireAdminAuth, (req, res) => {
  return res.json({ success: true, logs: db.getWebhookLogs() });
});

// GET /api/admin/active-users: Danh sách người dùng active & dùng thử
app.get("/api/admin/active-users", requireAdminAuth, (req, res) => {
  const subscriptions = db.getAllSubscriptions();
  const trialLogs = db.getTrialLogs();
  return res.json({ success: true, subscriptions, trialLogs });
});

// POST /api/admin/subscriptions/manual-update: Kích hoạt / thu hồi / gia hạn thủ công
app.post("/api/admin/subscriptions/manual-update", requireAdminAuth, (req, res) => {
  const { email, action, extraDays, planName } = req.body;
  if (!email) return res.status(400).json({ error: "Thiếu email khách hàng." });

  let sub = db.getSubscriptionByEmail(email);
  const now = new Date();

  if (action === "activate_lifetime") {
    if (sub) {
      sub.status = "active";
      sub.subscriptionType = "paid";
      sub.planName = planName || "Gói Vĩnh Viễn";
      sub.expiredAt = null;
    } else {
      sub = {
        id: `sub_${Date.now()}`,
        customerName: email.split("@")[0],
        customerEmail: email,
        customerPhone: "",
        planId: "plan_lifetime",
        planName: planName || "Gói Vĩnh Viễn",
        subscriptionType: "paid",
        status: "active",
        startedAt: now.toISOString(),
        expiredAt: null,
      };
      db.getAllSubscriptions().unshift(sub);
    }
  } else if (action === "extend_days") {
    const days = Number(extraDays) || 30;
    if (sub) {
      sub.status = "active";
      const base = sub.expiredAt ? new Date(sub.expiredAt) : now;
      const newExp = new Date(base.getTime() + days * 86400000);
      sub.expiredAt = newExp.toISOString();
    }
  } else if (action === "revoke") {
    if (sub) {
      sub.status = "revoked";
      sub.expiredAt = now.toISOString();
    }
  }

  db.save();
  return res.json({ success: true, subscription: sub, message: "Đã cập nhật trạng thái người dùng." });
});

// Vite middleware for development or static build for production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`E-commerce Creative Prompt Studio running on port ${PORT}`);
  });
}

startServer();
