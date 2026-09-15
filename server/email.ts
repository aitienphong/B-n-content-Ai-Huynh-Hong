import nodemailer from 'nodemailer';
import { query, queryOne } from './db';

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

export async function getEmailSettings(): Promise<EmailSettings> {
  try {
    const row = await queryOne<any>('SELECT * FROM email_settings WHERE id = $1', ['default']);
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
      is_active: Number(row.is_active ?? 1)
    };
  } catch (err) {
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
  const settings = await getEmailSettings();
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
        .header { background: linear-gradient(135deg, #059669 0%, #10b981 50%, #14b8a6 100%); padding: 36px 32px; text-align: center; color: #ffffff; }
        .badge { display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 14px; border-radius: 9999px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 12px; }
        .title { font-size: 24px; font-weight: 900; margin: 0; line-height: 1.3; }
        .body { padding: 32px; }
        .greeting { font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }
        .btn-wrapper { text-align: center; margin: 32px 0; }
        .btn { display: inline-block; background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: #ffffff !important; text-decoration: none; padding: 16px 36px; border-radius: 14px; font-weight: 800; font-size: 15px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4); }
        .info-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; margin: 24px 0; font-size: 13px; color: #166534; }
        .footer { background: #f8fafc; padding: 20px 32px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #f1f5f9; }
        .link-alt { word-break: break-all; font-size: 12px; color: #0284c7; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="badge">Trải nghiệm miễn phí ${trialHours} Giờ</div>
          <h1 class="title">Kích Hoạt Tài Khoản AI Video</h1>
        </div>
        <div class="body">
          <div class="greeting">Xin chào ${customerName || 'bạn'},</div>
          <p>Cảm ơn bạn đã đăng ký trải nghiệm công nghệ tạo video bán content AI. Tài khoản dùng thử <strong>${trialHours} giờ</strong> của bạn đã sẵn sàng.</p>
          <p>Vui lòng bấm vào nút bên dưới để mở khóa toàn bộ tính năng kịch bản timeline và prompt ngay lập tức:</p>
          
          <div class="btn-wrapper">
            <a href="${activationLink}" target="_blank" class="btn">Bắt Đầu Dùng Thử Ngay &rarr;</a>
          </div>

          <div class="info-box">
            <strong>Lưu ý:</strong>
            <ul style="margin: 6px 0 0 0; padding-left: 18px;">
              <li>Thời gian ${trialHours} giờ sẽ bắt đầu tính từ khi bạn bấm vào nút kích hoạt.</li>
              <li>Link kích hoạt có giá trị sử dụng trong vòng 48 giờ.</li>
            </ul>
          </div>

          <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">Nếu nút trên không hoạt động, bạn hãy sao chép và dán liên kết này vào trình duyệt web:<br>
            <a href="${activationLink}" class="link-alt">${activationLink}</a>
          </p>
        </div>
        <div class="footer">
          Đây là email tự động từ hệ thống AI Video Tools. Vui lòng không phản hồi email này.
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

      // Log success
      try {
        await query(`
          INSERT INTO sent_emails (id, to_email, subject, customer_name, activation_link, status, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [emailLogId, to, subject, customerName, activationLink, 'sent', now]);
      } catch (logErr) {
        console.warn('Failed to log sent email:', logErr);
      }

      return { success: true, simulated: false };
    } catch (err: any) {
      console.error('SMTP sending error:', err);

      try {
        await query(`
          INSERT INTO sent_emails (id, to_email, subject, customer_name, activation_link, status, error_message, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [emailLogId, to, subject, customerName, activationLink, 'failed', err.message || 'SMTP Error', now]);
      } catch (logErr) {
        console.warn('Failed to log email error:', logErr);
      }

      return { success: true, simulated: true, error: err.message };
    }
  } else {
    // Simulated delivery (when SMTP is not configured yet)
    try {
      await query(`
        INSERT INTO sent_emails (id, to_email, subject, customer_name, activation_link, status, error_message, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [emailLogId, to, subject, customerName, activationLink, 'simulated', 'Chưa cấu hình SMTP máy chủ', now]);
    } catch (logErr) {
      console.warn('Failed to log simulated email:', logErr);
    }

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
  const settings = await getEmailSettings();
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

      try {
        await query(`
          INSERT INTO sent_emails (id, to_email, subject, customer_name, activation_link, status, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [emailLogId, to, subject, customerName, 'Đã kích hoạt trực tiếp', 'sent', now]);
      } catch (logErr) {
        console.warn('Failed to log payment email:', logErr);
      }

      return { success: true, simulated: false };
    } catch (err: any) {
      try {
        await query(`
          INSERT INTO sent_emails (id, to_email, subject, customer_name, activation_link, status, error_message, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [emailLogId, to, subject, customerName, 'Đã kích hoạt trực tiếp', 'failed', err.message || 'SMTP Error', now]);
      } catch (logErr) {
        console.warn('Failed to log payment email error:', logErr);
      }
      return { success: true, simulated: true, error: err.message };
    }
  } else {
    try {
      await query(`
        INSERT INTO sent_emails (id, to_email, subject, customer_name, activation_link, status, error_message, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [emailLogId, to, subject, customerName, 'Đã kích hoạt trực tiếp', 'simulated', 'Chưa cấu hình SMTP máy chủ', now]);
    } catch (logErr) {
      console.warn('Failed to log simulated email:', logErr);
    }
    return { success: true, simulated: true };
  }
}

export async function sendTestEmail(toEmail: string): Promise<{ success: boolean; message: string }> {
  const settings = await getEmailSettings();
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
