import nodemailer from 'nodemailer';
import { db } from './db';

export interface EmailSettings {
  id: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  from_name: string;
  from_email: string;
  is_active: number;
  updated_at?: string;
}

export function getEmailSettings(): EmailSettings {
  const row = db.prepare('SELECT * FROM email_settings WHERE id = ?').get('default') as any;
  if (!row) {
    return {
      id: 'default',
      smtp_host: process.env.SMTP_HOST || 'smtp.gmail.com',
      smtp_port: Number(process.env.SMTP_PORT || 587),
      smtp_user: process.env.SMTP_USER || '',
      smtp_pass: process.env.SMTP_PASS || '',
      from_name: process.env.SMTP_FROM_NAME || 'AI Video Công Nghệ',
      from_email: process.env.SMTP_FROM || '',
      is_active: 1
    };
  }
  return {
    ...row,
    smtp_port: Number(row.smtp_port || 587),
    is_active: Number(row.is_active || 1)
  };
}

export interface SendTrialEmailParams {
  to: string;
  customerName: string;
  activationLink: string;
  trialHours: number;
}

export async function sendTrialActivationEmail(params: SendTrialEmailParams): Promise<{
  success: boolean;
  simulated?: boolean;
  error?: string;
}> {
  const { to, customerName, activationLink, trialHours } = params;
  const settings = getEmailSettings();
  const emailLogId = `mail_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const subject = `[Kích hoạt] Trải nghiệm miễn phí ${trialHours}h công nghệ AI Video`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); }
        .header { background: linear-gradient(135deg, #047857 0%, #0d9488 50%, #059669 100%); padding: 36px 32px; text-align: center; color: #ffffff; }
        .badge { display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 14px; border-radius: 9999px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
        .title { margin: 0; font-size: 22px; font-weight: 800; line-height: 1.3; }
        .body { padding: 32px; font-size: 15px; line-height: 1.6; color: #334155; }
        .greeting { font-size: 17px; font-weight: 700; color: #0f172a; margin-bottom: 16px; }
        .box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 14px; padding: 18px; margin: 24px 0; }
        .box-title { font-weight: 700; color: #166534; font-size: 14px; margin-bottom: 8px; }
        .box-list { margin: 0; padding-left: 20px; color: #15803d; font-size: 13px; }
        .box-list li { margin-bottom: 6px; }
        .cta-container { text-align: center; margin: 32px 0 24px 0; }
        .cta-button { display: inline-block; background: linear-gradient(135deg, #059669 0%, #0d9488 100%); color: #ffffff !important; text-decoration: none; font-weight: 800; font-size: 16px; padding: 16px 36px; border-radius: 14px; box-shadow: 0 4px 12px rgba(5, 150, 105, 0.35); text-align: center; }
        .link-text { font-size: 12px; color: #64748b; word-break: break-all; margin-top: 16px; background: #f1f5f9; padding: 12px; border-radius: 10px; border: 1px dashed #cbd5e1; }
        .footer { background: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="badge">DÙNG THỬ MIỄN PHÍ 100%</div>
          <h1 class="title">KÍCH HOẠT DÙNG THỬ AI VIDEO</h1>
          <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">Trải nghiệm ${trialHours} giờ trọn bộ tính năng sáng tạo đỉnh cao</p>
        </div>
        <div class="body">
          <div class="greeting">Xin chào ${customerName || 'bạn'},</div>
          <p>
            Cảm ơn bạn đã quan tâm đến <strong>Công nghệ AI Video Bán Content</strong>. Chúng tôi đã chuẩn bị sẵn phiên dùng thử miễn phí dành riêng cho bạn.
          </p>
          
          <div class="box">
            <div class="box-title">🎁 Quyền lợi trong gói dùng thử ${trialHours} giờ:</div>
            <ul class="box-list">
              <li>Mở khóa toàn bộ thuật toán phân tích phong cách kịch bản AI</li>
              <li>Tạo dàn ý Timeline chi tiết theo cấu trúc video triệu view</li>
              <li>Xuất bảng Prompts hình ảnh/video chuẩn xác cho các công cụ AI</li>
              <li>Hỗ trợ đa dạng tỷ lệ khung hình và ngôn ngữ lồng tiếng</li>
            </ul>
          </div>

          <p style="text-align: center; font-weight: 600; color: #0f172a;">
            Nhấn vào nút bên dưới để kích hoạt tài khoản và mở khóa tính năng ngay:
          </p>

          <div class="cta-container">
            <a href="${activationLink}" class="cta-button" target="_blank">
              👉 BẮT ĐẦU DÙNG THỬ NGAY (${trialHours}H)
            </a>
          </div>

          <p style="font-size: 13px; color: #64748b; text-align: center;">
            Nếu nút bấm trên không hoạt động, bạn hãy sao chép và dán liên kết sau vào trình duyệt:
          </p>
          <div class="link-text">
            ${activationLink}
          </div>
          
          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 20px;">
            * Lưu ý: Liên kết kích hoạt có hiệu lực trong vòng 48 giờ.
          </p>
        </div>
        <div class="footer">
          <p style="margin: 0 0 6px 0;">Hệ thống AI Video Content Automation</p>
          <p style="margin: 0;">Nếu bạn không yêu cầu dùng thử này, vui lòng bỏ qua email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // Check if SMTP is configured
  const hasSmtpConfig = settings.is_active && settings.smtp_user && settings.smtp_pass;

  if (hasSmtpConfig) {
    try {
      const transporter = nodemailer.createTransport({
        host: settings.smtp_host || 'smtp.gmail.com',
        port: Number(settings.smtp_port || 587),
        secure: Number(settings.smtp_port) === 465,
        auth: {
          user: settings.smtp_user,
          pass: settings.smtp_pass
        }
      });

      const fromAddress = settings.from_email 
        ? `"${settings.from_name || 'AI Video'}" <${settings.from_email}>`
        : `"${settings.from_name || 'AI Video'}" <${settings.smtp_user}>`;

      await transporter.sendMail({
        from: fromAddress,
        to,
        subject,
        html: htmlContent
      });

      // Log success
      db.prepare(`
        INSERT INTO sent_emails (id, to_email, subject, customer_name, activation_link, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(emailLogId, to, subject, customerName, activationLink, 'sent', now);

      return { success: true, simulated: false };
    } catch (err: any) {
      console.error('SMTP sending error:', err);

      // Log failure but fallback so user isn't stuck
      db.prepare(`
        INSERT INTO sent_emails (id, to_email, subject, customer_name, activation_link, status, error_message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(emailLogId, to, subject, customerName, activationLink, 'failed', err.message || 'SMTP Error', now);

      return { success: true, simulated: true, error: err.message };
    }
  } else {
    // Simulated delivery (when SMTP is not configured yet)
    db.prepare(`
      INSERT INTO sent_emails (id, to_email, subject, customer_name, activation_link, status, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(emailLogId, to, subject, customerName, activationLink, 'simulated', 'Chưa cấu hình SMTP máy chủ', now);

    console.log(`[Email Service] Simulated email sent to ${to}. Activation link: ${activationLink}`);
    return { success: true, simulated: true };
  }
}

export async function sendPaymentSuccessEmail(params: {
  to: string;
  customerName: string;
  planName: string;
  planDays: number;
  amount: number;
  orderCode: string;
}): Promise<{ success: boolean; simulated?: boolean; error?: string }> {
  const { to, customerName, planName, planDays, amount, orderCode } = params;
  const settings = getEmailSettings();
  const emailLogId = `mail_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const subject = `[Xác nhận] Kích hoạt thành công ${planName} - AI Video`;
  const formattedAmount = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
  const expirationText = planDays >= 36500 ? 'Vĩnh viễn không giới hạn' : `${planDays} ngày (kể từ ngày thanh toán)`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); }
        .header { background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #3b82f6 100%); padding: 36px 32px; text-align: center; color: #ffffff; }
        .badge { display: inline-block; background: rgba(255,255,255,0.25); padding: 4px 14px; border-radius: 9999px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 12px; }
        .title { font-size: 24px; font-weight: 900; margin: 0; line-height: 1.3; }
        .body { padding: 32px; }
        .greeting { font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }
        .info-card { background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 16px; padding: 20px; margin: 24px 0; }
        .info-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; border-bottom: 1px dashed #bbf7d0; }
        .info-row:last-child { border-bottom: none; }
        .info-label { color: #166534; font-weight: 600; }
        .info-val { color: #14532d; font-weight: 800; font-family: monospace; }
        .footer { background: #f8fafc; padding: 20px 32px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #f1f5f9; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="badge">Thanh toán thành công</div>
          <h1 class="title">Tài Khoản Đã Kích Hoạt</h1>
        </div>
        <div class="body">
          <div class="greeting">Xin chào ${customerName || 'Quý khách'},</div>
          <p>Hệ thống xin thông báo đơn hàng nâng cấp gói của bạn đã được thanh toán và kích hoạt thành công vào tài khoản email <strong>${to}</strong>.</p>
          
          <div class="info-card">
            <div class="info-row">
              <span class="info-label">Mã đơn hàng:</span>
              <span class="info-val">${orderCode}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Gói dịch vụ:</span>
              <span class="info-val">${planName}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Thời hạn:</span>
              <span class="info-val">${expirationText}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Số tiền:</span>
              <span class="info-val">${formattedAmount}</span>
            </div>
          </div>
          <p style="font-size: 13px; color: #64748b; text-align: center;">Bạn có thể mở ứng dụng bất cứ lúc nào để sáng tạo kịch bản và video AI không giới hạn.</p>
        </div>
        <div class="footer">
          Đây là email tự động từ hệ thống AI Video Tools.
        </div>
      </div>
    </body>
    </html>
  `;

  if (settings.is_active && settings.smtp_user && settings.smtp_pass) {
    try {
      const transporter = nodemailer.createTransport({
        host: settings.smtp_host || 'smtp.gmail.com',
        port: Number(settings.smtp_port || 587),
        secure: Number(settings.smtp_port) === 465,
        auth: {
          user: settings.smtp_user,
          pass: settings.smtp_pass
        }
      });

      const fromAddress = settings.from_email 
        ? `"${settings.from_name || 'AI Video'}" <${settings.from_email}>`
        : `"${settings.from_name || 'AI Video'}" <${settings.smtp_user}>`;

      await transporter.sendMail({
        from: fromAddress,
        to,
        subject,
        html: htmlContent
      });

      db.prepare(`
        INSERT INTO sent_emails (id, to_email, subject, customer_name, activation_link, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(emailLogId, to, subject, customerName, 'Đã kích hoạt trực tiếp', 'sent', now);

      return { success: true, simulated: false };
    } catch (err: any) {
      db.prepare(`
        INSERT INTO sent_emails (id, to_email, subject, customer_name, activation_link, status, error_message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(emailLogId, to, subject, customerName, 'Đã kích hoạt trực tiếp', 'failed', err.message || 'SMTP Error', now);
      return { success: true, simulated: true, error: err.message };
    }
  } else {
    db.prepare(`
      INSERT INTO sent_emails (id, to_email, subject, customer_name, activation_link, status, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(emailLogId, to, subject, customerName, 'Đã kích hoạt trực tiếp', 'simulated', 'Chưa cấu hình SMTP máy chủ', now);
    return { success: true, simulated: true };
  }
}

export async function sendTestEmail(toEmail: string): Promise<{ success: boolean; message: string }> {
  const settings = getEmailSettings();
  if (!settings.smtp_user || !settings.smtp_pass) {
    throw new Error('Chưa cấu hình tài khoản hoặc mật khẩu SMTP.');
  }

  const transporter = nodemailer.createTransport({
    host: settings.smtp_host || 'smtp.gmail.com',
    port: Number(settings.smtp_port || 587),
    secure: Number(settings.smtp_port) === 465,
    auth: {
      user: settings.smtp_user,
      pass: settings.smtp_pass
    }
  });

  const fromAddress = settings.from_email 
    ? `"${settings.from_name || 'AI Video'}" <${settings.from_email}>`
    : `"${settings.from_name || 'AI Video'}" <${settings.smtp_user}>`;

  await transporter.sendMail({
    from: fromAddress,
    to: toEmail,
    subject: '[Kiểm tra kết nối] Cấu hình Email SMTP thành công',
    text: `Chào bạn, đây là email kiểm tra từ hệ thống AI Video. Kết nối máy chủ SMTP (${settings.smtp_host}:${settings.smtp_port}) hoạt động hoàn hảo!`,
    html: `
      <div style="font-family: sans-serif; padding: 20px; background: #f0fdf4; border-radius: 12px; border: 1px solid #bbf7d0;">
        <h2 style="color: #166534; margin: 0 0 10px 0;">✅ Kết nối SMTP thành công!</h2>
        <p style="color: #334155; margin: 0 0 8px 0;">Máy chủ gửi mail: <strong>${settings.smtp_host}:${settings.smtp_port}</strong></p>
        <p style="color: #334155; margin: 0;">Email gửi đi: <strong>${settings.smtp_user}</strong></p>
      </div>
    `
  });

  return { success: true, message: `Đã gửi email thử nghiệm đến ${toEmail} thành công!` };
}
