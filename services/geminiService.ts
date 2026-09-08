
import { GoogleGenAI, Type } from "@google/genai";

export class GeminiService {
  private ai: GoogleGenAI;
  private modelName = 'gemini-3.7-flash';

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  }

  async verifyKey() {
    try {
      const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents: "Check system. Reply 'OK'.",
        config: { maxOutputTokens: 5 }
      });
      return !!response.text;
    } catch (error: any) {
      if (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED')) {
        throw new Error('QUOTA_EXHAUSTED');
      }
      throw new Error('INVALID_KEY');
    }
  }

  async generateInitialSetup(summary: string, style: string, mode: string, visualStyle: string): Promise<{topic: string, background: string}> {
    const isDifferent = mode !== 'similar';
    const prompt = `Bạn là chuyên gia hàng đầu về sáng tạo và remix video AI (phương pháp Bán Content chuyên nghiệp).

NGUYÊN TẮC CỐT LÕI BẮT BUỘC:
1. GIỮ NGUYÊN 100% PHONG CÁCH VIDEO GỐC:
   - Kế thừa toàn bộ bản sắc nghệ thuật từ Phong cách gốc: Tone giọng, nhịp điệu (nhanh/chậm/hồi hộp/sâu lắng), gam màu, ánh sáng, góc máy quay, bầu không khí và cảm xúc chủ đạo.
2. THAY ĐỔI / ĐỔI MỚI NỘI DUNG (CONTENT):
   - ${isDifferent 
       ? 'ĐỔI MỚI NỘI DUNG HOÀN TOÀN: Sáng tạo một chủ đề mới, cốt truyện mới, tình huống mới 100% (tránh bản quyền và không trùng lặp câu chuyện cũ), nhưng phải đặt trọn vẹn trong cùng phong cách gốc.' 
       : 'TẠO NỘI DUNG MỚI TƯƠNG TỰ: Cùng trục đề tài nhưng viết mới toàn bộ kịch bản, khai thác góc nhìn mới mẻ hơn, hấp dẫn hơn, giữ nguyên 100% phong cách gốc.'}

THÔNG TIN ĐẦU VÀO:
- Tóm tắt nội dung gốc: "${summary}"
- Phân tích phong cách gốc: "${style}"
- Visual Style lựa chọn: "${visualStyle}"
- Chế độ: ${isDifferent ? 'Đổi mới nội dung hoàn toàn (Khác biệt chủ đề, giữ trọn phong cách)' : 'Nội dung tương tự nâng cao (Giữ phong cách)'}

NHIỆM VỤ:
1. "topic": Đề xuất 1 câu Tiêu đề / Chủ đề mới muốn làm (cực kỳ hấp dẫn, gây tò mò, chuẩn viral, nội dung mới nhưng toát lên đúng phong cách gốc).
2. "background": Mô tả 1-2 câu Bối cảnh / Nền tảng không gian và bầu không khí của video mới (thể hiện rõ nét phong cách nghệ thuật, ánh sáng, màu sắc kế thừa từ video gốc).

Trả về định dạng JSON: { "topic": "string", "background": "string" }`;

    const response = await this.ai.models.generateContent({
      model: this.modelName,
      contents: prompt,
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            topic: { type: Type.STRING },
            background: { type: Type.STRING }
          },
          required: ["topic", "background"]
        }
      }
    });

    try {
      return JSON.parse(response.text || '{}');
    } catch (e) {
      return { topic: "Lỗi tạo chủ đề", background: "Lỗi tạo bối cảnh" };
    }
  }

  async generateTopic(summary: string, style: string, mode: string): Promise<string> {
    const isDifferent = mode !== 'similar';
    const prompt = `Bạn là chuyên gia sáng tạo kịch bản video AI.
NGUYÊN TẮC: BẮT BUỘC GIỮ NGUYÊN PHONG CÁCH CỦA VIDEO GỐC - ĐỔI MỚI NỘI DUNG.

Thông tin gốc:
- Nội dung gốc: "${summary}"
- Phong cách gốc: "${style}"
- Chế độ: ${isDifferent ? 'Đổi mới nội dung hoàn toàn (Chủ đề mới 100% tránh bản quyền, kế thừa phong cách)' : 'Tương tự nâng cao (Góc nhìn mới mẻ, giữ phong cách)'}

Yêu cầu:
- Đề xuất đúng 1 câu tiêu đề / chủ đề video mới chuẩn viral, thu hút người xem.
- Chủ đề mới phải mang trọn vẹn tinh thần, nhịp điệu và phong cách: "${style}".
- Chỉ trả về duy nhất 1 câu văn bản thuần túy, không thêm dấu gạch đầu dòng hay giải thích.`;
    const response = await this.ai.models.generateContent({ model: this.modelName, contents: prompt });
    return response.text?.trim() || '';
  }

  async generateBackground(topic: string, visualStyle: string, styleAnalysis: string): Promise<string> {
    const prompt = `Bạn là đạo diễn hình ảnh video AI.
Dựa trên Chủ đề mới: "${topic}", Visual Style: "${visualStyle}" và Phân tích phong cách gốc: "${styleAnalysis}".

NGUYÊN TẮC: Giữ nguyên phong cách của video gốc (ánh sáng, tông màu, không gian, nhịp điệu, cảm xúc) để dựng nên bối cảnh cho nội dung mới.
Hãy mô tả ngắn gọn 1-2 câu bối cảnh / không gian / nền tảng chi tiết của video này. Trả về văn bản thuần túy.`;
    const response = await this.ai.models.generateContent({ model: this.modelName, contents: prompt });
    return response.text?.trim() || '';
  }

  async generateTimeline(topic: string, background: string, durationSec: number, styleAnalysis: string): Promise<string> {
    const prompt = `Bạn là biên kịch video AI chuyên nghiệp. Hãy xây dựng DÀN Ý CHI TIẾT cho video mới.

NGUYÊN TẮC VÀNG:
1. NỘI DUNG MỚI: Bám sát chủ đề "${topic}" và bối cảnh "${background}".
2. GIỮ NGUYÊN PHONG CÁCH VIDEO GỐC: Áp dụng triệt để phong cách phân tích gốc: "${styleAnalysis}" vào:
   - Nhịp điệu phân cảnh (pacing, chuyển cảnh nhanh/chậm).
   - Thiết kế hình ảnh, ánh sáng, góc máy (camera angles).
   - Âm thanh: Nhạc nền (BGM), hiệu ứng âm thanh (SFX), nhịp điệu kế thừa.
   - Giọng điệu lời dẫn (Voice/Script): Đúng sắc thái cảm xúc, phong thái dẫn dắt như phong cách gốc.

THÔNG TIN ĐẦU VÀO:
- Chủ đề mới: "${topic}"
- Tổng thời lượng: ${durationSec} giây (phân chia đều các phân đoạn 8s).
- Bối cảnh: "${background}"
- Phong cách gốc cần giữ nguyên: "${styleAnalysis}"

YÊU CẦU FORMAT OUTPUT (BẮT BUỘC CHÍNH XÁC):
1. Dòng đầu tiên: "DÀN Ý CHI TIẾT: ${topic.toUpperCase()} (${durationSec} GIÂY)"
2. Chia thành các PHẦN rõ ràng (PHẦN 1, PHẦN 2... PHẦN CUỐI).
3. Mỗi phần có cấu trúc:
   PHẦN [X]: [Tên phần kịch tính / cuốn hút] (Phút [M:SS] - Phút [M:SS])
   1) Bối cảnh & Không gian: ...
   2) Hình ảnh & Góc máy: 
      - Cảnh 1 (0:00 - 0:08): [Mô tả góc máy, ánh sáng, hành động theo phong cách gốc]
      - Cảnh 2 (0:08 - 0:16): ...
   3) Âm thanh & Nhạc nền: [Mô tả âm nhạc, SFX, nhịp điệu kế thừa từ phong cách gốc]
   4) Nội dung lời dẫn / Voice: [Lời thoại mang đúng ngữ điệu và sắc thái của phong cách gốc]

LƯU Ý: Tổng thời gian phải khớp chính xác từ 0:00 đến ${durationSec}s.`;

    const response = await this.ai.models.generateContent({ model: this.modelName, contents: prompt });
    return response.text || '';
  }

  async generatePrompts(
    timeline: string, 
    background: string, 
    visualStyle: string, 
    aspectRatio: string, 
    N: number, 
    voiceLang: string,
    styleAnalysis: string = ''
  ): Promise<any[]> {
    const prompt = `Bạn là chuyên gia Prompt Engineering cho các mô hình Video AI (Midjourney, Runway Gen-3, Luma Dream Machine, Kling, Sora, Veo, Pika) và chuyên gia thu âm lồng tiếng (Voiceover).

NGUYÊN TẮC BẮT BUỘC: 
- NỘI DUNG MỚI: Bám sát từng cảnh trong Dàn ý Timeline.
- GIỮ NGUYÊN PHONG CÁCH GỐC: Kế thừa 100% phong cách gốc ("${styleAnalysis}") cho cả Prompt Hình ảnh (màu sắc, góc máy, ánh sáng, grading, độ tương phản) và Giọng đọc Voice (ngữ điệu, cảm xúc, văn phong).

DỮ LIỆU ĐẦU VÀO:
- Dàn ý Timeline: ${timeline}
- Bối cảnh chung: ${background}
- Visual Style: ${visualStyle}
- Tỷ lệ khung hình: ${aspectRatio}
- Ngôn ngữ Voice: ${voiceLang}
- Số phân đoạn 8 giây (N): ${N}
- Phong cách phân tích gốc: ${styleAnalysis}

NHIỆM VỤ: Tạo mảng JSON chứa đúng ${N} phần tử tương ứng với ${N} phân đoạn (mỗi đoạn 8 giây), định dạng:
{ "stt": number, "prompt": string, "voice": string }

QUY TẮC PROMPT HÌNH ẢNH (BẰNG TIẾNG ANH):
1. BẮT ĐẦU: Bắt buộc mở đầu bằng "[${visualStyle}] ...".
2. MÔ TẢ: Mô tả cực kỳ sống động và điện ảnh (cinematic cinematography, camera movement, lighting, color tone, mood, ultra-detailed textures) thể hiện đúng tinh thần phong cách gốc ("${styleAnalysis}") ứng với nội dung cảnh đó.
3. KHÔNG ĐƯỢC CHỨA từ đánh số như "Scene 1", "Clip 1", "Shot 1".
4. KẾT THÚC: Bắt buộc thêm đuôi: "--ar ${aspectRatio} Negative: blurry, low quality, jitter, distorted face, watermark, text artifacts, oversaturated" ở cuối mỗi prompt.

QUY TẮC LỜI DẪN VOICE:
1. Ngôn ngữ: Bắt buộc sử dụng ${voiceLang}.
2. Phong cách hành văn: Phải giữ đúng ngữ điệu, nhịp thở, độ kịch tính, sự lôi cuốn hoặc lắng đọng theo đúng phong cách gốc ("${styleAnalysis}").
3. KHÔNG ĐƯỢC CHỨA từ như "Voice 1", "Lời dẫn 1", "MC:".
4. ĐỘ DÀI CHUẨN 8 GIÂY:
   - Nếu là Tiếng Việt: Bắt buộc khoảng 20-25 từ (đọc vừa khít trong 8 giây với tốc độ chuẩn).
   - Nếu là Tiếng Anh: Bắt buộc khoảng 22-28 từ.
   - Các ngôn ngữ khác: Độ dài tương ứng chuẩn 8 giây phát âm.
5. Nội dung lời dẫn phải khớp nhịp nhàng với cảnh quay tương ứng.

Trả về JSON array đúng ${N} object: [{ "stt": 1, "prompt": "...", "voice": "..." }, ...]`;

    const response = await this.ai.models.generateContent({
      model: this.modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              stt: { type: Type.NUMBER },
              prompt: { type: Type.STRING },
              voice: { type: Type.STRING }
            },
            required: ["stt", "prompt", "voice"]
          }
        }
      }
    });
    return JSON.parse(response.text || '[]');
  }
}
