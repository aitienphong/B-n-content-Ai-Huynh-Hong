import express from 'express';
import cors from 'cors';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { db, initDatabase } from './server/db';
import { sendTrialActivationEmail, sendPaymentSuccessEmail, sendTestEmail, getEmailSettings } from './server/email';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SQLite database
initDatabase();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Helper to get SePay settings
function getSepaySettings() {
  const settings = db.prepare('SELECT * FROM sepay_settings WHERE id = ?').get('default') as any;
  if (!settings) {
    return {
      bank_name: 'MBBank',
      bank_code: 'MB',
      account_number: '0988888888',
      account_holder: 'HUYNH HONG',
      api_key: process.env.SEPAY_API_KEY || '',
      webhook_secret: process.env.SEPAY_WEBHOOK_SECRET || '',
      order_prefix: 'AFF',
      payment_content_template: '{order_code}',
      webhook_url: '/api/sepay-webhook',
      is_active: 1
    };
  }
  return settings;
}

// Helper to get Trial settings
function getTrialSettings() {
  const settings = db.prepare('SELECT * FROM trial_settings WHERE id = ?').get('default') as any;
  if (!settings) {
    return {
      is_active: 1,
      trial_hours: 24,
      button_title: 'Dùng thử miễn phí',
      description: 'Trải nghiệm 24 giờ sử dụng trọn bộ tính năng video AI đỉnh cao.',
      terms: 'Mỗi email và số điện thoại chỉ được tham gia dùng thử 1 lần.',
      app_redirect_url: '',
      max_per_email: 1,
      max_per_phone: 1
    };
  }
  return settings;
}

// Admin passcode middleware
function verifyAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const passcode = req.headers['x-admin-passcode'] || req.query.passcode;
  const configuredPasscode = process.env.ADMIN_PASSCODE || '123456';
  if (passcode !== configuredPasscode) {
    return res.status(401).json({ error: 'Mã xác thực Quản trị viên (ADMIN_PASSCODE) không chính xác.' });
  }
  next();
}

// Helper: Check active subscription by email or phone
function checkUserSubscription(identifier: string) {
  if (!identifier) return null;
  const sub = db.prepare(`
    SELECT * FROM subscriptions 
    WHERE (customer_email = ? OR customer_phone = ?)
      AND status = 'active'
    ORDER BY created_at DESC 
    LIMIT 1
  `).get(identifier, identifier) as any;

  if (!sub) return null;

  // Check if expired
  const now = new Date().getTime();
  const expireTime = new Date(sub.expired_at).getTime();

  if (expireTime < now) {
    db.prepare('UPDATE subscriptions SET status = ? WHERE id = ?').run('expired', sub.id);
    return null;
  }

  return sub;
}

// ================= API ROUTES =================

// 1. Get Public Plans
app.get('/api/plans', (req, res) => {
  try {
    const plans = db.prepare('SELECT * FROM plans WHERE is_active = 1 ORDER BY price ASC').all();
    res.json({ success: true, plans });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Get Public Payment Info & Settings
app.get('/api/payment-config', (req, res) => {
  try {
    const settings = getSepaySettings();
    const trial = getTrialSettings();
    res.json({
      success: true,
      bank_name: settings.bank_name,
      bank_code: settings.bank_code,
      account_number: settings.account_number,
      account_holder: settings.account_holder,
      order_prefix: settings.order_prefix,
      is_active: settings.is_active === 1,
      trial_active: trial.is_active === 1,
      trial_hours: trial.trial_hours,
      trial_title: trial.button_title,
      trial_description: trial.description,
      trial_app_redirect_url: trial.app_redirect_url || ''
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Create Order
app.post('/api/orders', (req, res) => {
  try {
    const plan_id = req.body.plan_id || req.body.planId;
    const customer_name = req.body.customer_name || req.body.customerName;
    const customer_email = req.body.customer_email || req.body.customerEmail;
    const customer_phone = req.body.customer_phone || req.body.customerPhone;
    const note = req.body.note;

    if (!customer_name || !customer_name.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập họ và tên của bạn.' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!customer_email || !emailRegex.test(customer_email.trim())) {
      return res.status(400).json({ error: 'Vui lòng nhập địa chỉ email hợp lệ.' });
    }
    if (!customer_phone || !customer_phone.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập số điện thoại liên hệ.' });
    }

    const plan = db.prepare('SELECT * FROM plans WHERE id = ? AND is_active = 1').get(plan_id) as any;
    if (!plan) {
      return res.status(404).json({ error: 'Gói sử dụng không tồn tại hoặc đã tạm dừng.' });
    }

    const settings = getSepaySettings();
    const prefix = settings.order_prefix || 'AFF';

    // Generate unique order code AFF + 6 digits
    const countRow = db.prepare('SELECT COUNT(*) as count FROM orders').get() as { count: number };
    const nextNum = (countRow.count + 1).toString().padStart(6, '0');
    let order_code = `${prefix}${nextNum}`;

    // Verify uniqueness
    const existing = db.prepare('SELECT order_code FROM orders WHERE order_code = ?').get(order_code);
    if (existing) {
      const timestamp = Date.now().toString().slice(-6);
      order_code = `${prefix}${timestamp}`;
    }

    const order_id = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const payment_content = order_code;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO orders (
        order_id, order_code, plan_id, plan_name, plan_days, amount,
        customer_name, customer_email, customer_phone, note, status,
        payment_content, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      order_id,
      order_code,
      plan.id,
      plan.name,
      plan.days,
      plan.price,
      customer_name.trim(),
      customer_email.trim().toLowerCase(),
      customer_phone.trim(),
      note || '',
      'pending',
      payment_content,
      now
    );

    // QR Codes
    // VietQR quick format
    const qr_url = `https://img.vietqr.io/image/${settings.bank_code}-${settings.account_number}-compact2.png?amount=${plan.price}&addInfo=${encodeURIComponent(payment_content)}&accountName=${encodeURIComponent(settings.account_holder)}`;
    const sepay_qr_url = `https://qr.sepay.vn/img?bank=${settings.bank_code}&acc=${settings.account_number}&template=compact&amount=${plan.price}&des=${encodeURIComponent(payment_content)}`;

    res.json({
      success: true,
      order: {
        order_id,
        order_code,
        plan_name: plan.name,
        plan_days: plan.days,
        amount: plan.price,
        customer_name,
        customer_email,
        customer_phone,
        status: 'pending',
        payment_content,
        created_at: now
      },
      payment_info: {
        bank_name: settings.bank_name,
        bank_code: settings.bank_code,
        account_number: settings.account_number,
        account_holder: settings.account_holder,
        amount: plan.price,
        payment_content,
        qr_url,
        sepay_qr_url
      }
    });
  } catch (err: any) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Không thể tạo đơn hàng: ' + err.message });
  }
});

// 4. Check Order Status
app.get('/api/orders/:order_code/status', (req, res) => {
  try {
    const { order_code } = req.params;
    const order = db.prepare('SELECT * FROM orders WHERE order_code = ?').get(order_code) as any;

    if (!order) {
      return res.status(404).json({ error: 'Không tìm thấy thông tin đơn hàng.' });
    }

    let subscription = null;
    if (order.status === 'paid') {
      subscription = db.prepare(`
        SELECT * FROM subscriptions 
        WHERE customer_email = ? AND status = 'active'
        ORDER BY created_at DESC LIMIT 1
      `).get(order.customer_email) as any;
    }

    res.json({
      success: true,
      status: order.status,
      paid_at: order.paid_at,
      expired_at: order.expired_at,
      order,
      subscription
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. SePay Webhook Endpoint
app.post('/api/sepay-webhook', (req, res) => {
  const logId = `wh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const rawPayload = JSON.stringify(req.body);

  try {
    const settings = getSepaySettings();

    // Verify Webhook Secret if set
    if (settings.webhook_secret && settings.webhook_secret.trim()) {
      const authHeader = req.headers['authorization'] || '';
      const sepayHeader = req.headers['sepay-secret'] || '';
      const expected = settings.webhook_secret.trim();

      const isAuthorized = 
        authHeader === `Apikey ${expected}` || 
        authHeader === `Bearer ${expected}` || 
        authHeader === expected ||
        sepayHeader === expected;

      if (!isAuthorized) {
        db.prepare(`
          INSERT INTO webhook_logs (id, received_at, raw_payload, result, error_message)
          VALUES (?, ?, ?, ?, ?)
        `).run(logId, now, rawPayload, 'unauthorized', 'Invalid or missing Webhook Secret');

        return res.status(401).json({ success: false, message: 'Unauthorized Webhook' });
      }
    }

    const {
      transferType,
      transferAmount,
      content,
      description,
      accountNumber,
      gateway,
      referenceCode,
      transactionDate
    } = req.body;

    const amount = Number(transferAmount || req.body.amount || 0);
    const paymentContent = String(content || description || '');

    // Check transaction type (Must be money IN)
    if (transferType && transferType !== 'in' && transferType !== 'IN') {
      db.prepare(`
        INSERT INTO webhook_logs (id, received_at, raw_payload, payment_content, amount, result, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(logId, now, rawPayload, paymentContent, amount, 'ignored', 'Not an IN transaction');

      return res.json({ success: true, message: 'Ignored non-credit transaction' });
    }

    // Extract Order Code using prefix regex (e.g. AFF000001)
    const prefix = settings.order_prefix || 'AFF';
    const regex = new RegExp(`(${prefix}\\d{6})`, 'i');
    const match = paymentContent.match(regex);
    const detectedCode = match ? match[1].toUpperCase() : null;

    if (!detectedCode) {
      db.prepare(`
        INSERT INTO webhook_logs (id, received_at, raw_payload, payment_content, amount, result, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(logId, now, rawPayload, paymentContent, amount, 'no_order_code', 'Không tìm thấy mã đơn hàng trong nội dung chuyển khoản');

      return res.status(200).json({ success: false, message: 'Order code not found in payment content' });
    }

    // Find Order in DB
    const order = db.prepare('SELECT * FROM orders WHERE order_code = ?').get(detectedCode) as any;
    if (!order) {
      db.prepare(`
        INSERT INTO webhook_logs (id, received_at, raw_payload, payment_content, amount, detected_order_code, result, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(logId, now, rawPayload, paymentContent, amount, detectedCode, 'order_not_found', `Mã đơn ${detectedCode} không tồn tại`);

      return res.status(200).json({ success: false, message: 'Order code does not exist' });
    }

    // Check if already paid
    if (order.status === 'paid') {
      db.prepare(`
        INSERT INTO webhook_logs (id, received_at, raw_payload, payment_content, amount, detected_order_code, result, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(logId, now, rawPayload, paymentContent, amount, detectedCode, 'already_paid', 'Đơn hàng này đã được xác nhận thanh toán trước đó');

      return res.status(200).json({ success: true, message: 'Order already paid, no action needed' });
    }

    // Validate Amount
    if (amount < order.amount) {
      db.prepare(`
        INSERT INTO webhook_logs (id, received_at, raw_payload, payment_content, amount, detected_order_code, result, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(logId, now, rawPayload, paymentContent, amount, detectedCode, 'insufficient_amount', `Số tiền chuyển (${amount}) nhỏ hơn giá trị đơn hàng (${order.amount})`);

      return res.status(200).json({ success: false, message: 'Insufficient payment amount' });
    }

    // Valid Payment! Calculate Expiration Date
    const paidAt = new Date();
    const expiredAt = new Date(paidAt.getTime() + (order.plan_days || 36500) * 24 * 60 * 60 * 1000);

    // 1. Update Order status
    db.prepare(`
      UPDATE orders 
      SET status = 'paid', paid_at = ?, expired_at = ?
      WHERE order_id = ?
    `).run(paidAt.toISOString(), expiredAt.toISOString(), order.order_id);

    // 2. Insert into Payments
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    db.prepare(`
      INSERT INTO payments (
        payment_id, order_code, amount, bank_brand_name,
        account_number, transaction_content, transaction_date, reference_code, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      paymentId,
      order.order_code,
      amount,
      gateway || settings.bank_code,
      accountNumber || settings.account_number,
      paymentContent,
      transactionDate || now,
      referenceCode || logId,
      now
    );

    // 3. Create or Update Subscription
    // Check if user has an existing active trial or paid subscription
    const existingSub = db.prepare(`
      SELECT * FROM subscriptions 
      WHERE (customer_email = ? OR customer_phone = ?)
      ORDER BY created_at DESC LIMIT 1
    `).get(order.customer_email, order.customer_phone) as any;

    const subId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    if (existingSub) {
      db.prepare(`
        UPDATE subscriptions 
        SET subscription_type = 'paid', plan_name = ?, status = 'active', started_at = ?, expired_at = ?
        WHERE id = ?
      `).run(order.plan_name, paidAt.toISOString(), expiredAt.toISOString(), existingSub.id);
    } else {
      db.prepare(`
        INSERT INTO subscriptions (
          id, customer_name, customer_email, customer_phone,
          subscription_type, plan_name, status, started_at, expired_at, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        subId,
        order.customer_name,
        order.customer_email,
        order.customer_phone,
        'paid',
        order.plan_name,
        'active',
        paidAt.toISOString(),
        expiredAt.toISOString(),
        now
      );
    }

    // 4. Log Success
    db.prepare(`
      INSERT INTO webhook_logs (id, received_at, raw_payload, payment_content, amount, detected_order_code, result)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(logId, now, rawPayload, paymentContent, amount, detectedCode, 'success');

    // Send payment confirmation email
    sendPaymentSuccessEmail({
      to: order.customer_email,
      customerName: order.customer_name,
      planName: order.plan_name,
      planDays: order.plan_days,
      amount: order.amount,
      orderCode: order.order_code
    }).catch(err => console.error('Payment email error:', err));

    return res.json({ success: true, message: 'Payment successfully confirmed and activated' });
  } catch (err: any) {
    console.error('Webhook processing error:', err);
    db.prepare(`
      INSERT INTO webhook_logs (id, received_at, raw_payload, result, error_message)
      VALUES (?, ?, ?, ?, ?)
    `).run(logId, now, rawPayload, 'exception', err.message);

    return res.status(500).json({ error: 'Internal webhook error: ' + err.message });
  }
});

// 6. Register Trial & Send Activation Link to Email
app.post('/api/trial/register', async (req, res) => {
  try {
    const customer_name = req.body.customer_name || req.body.customerName || req.body.fullName;
    const customer_email = req.body.customer_email || req.body.customerEmail || req.body.email;
    const customer_phone = req.body.customer_phone || req.body.customerPhone || req.body.phone;

    if (!customer_name || !customer_name.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập họ và tên của bạn.' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!customer_email || !emailRegex.test(customer_email.trim())) {
      return res.status(400).json({ error: 'Vui lòng nhập địa chỉ email hợp lệ.' });
    }
    if (!customer_phone || !customer_phone.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập số điện thoại liên hệ.' });
    }

    const trialSettings = getTrialSettings();
    if (trialSettings.is_active !== 1) {
      return res.status(400).json({ error: 'Chương trình dùng thử hiện chưa được bật.' });
    }

    const cleanEmail = customer_email.trim().toLowerCase();
    const cleanPhone = customer_phone.trim();

    // Check if email already used trial
    const emailUsed = db.prepare(`
      SELECT COUNT(*) as count FROM trial_logs WHERE customer_email = ?
    `).get(cleanEmail) as { count: number };
    if (emailUsed.count >= trialSettings.max_per_email) {
      return res.status(400).json({ error: 'Email này đã sử dụng hết lượt dùng thử.' });
    }

    // Check if phone already used trial
    const phoneUsed = db.prepare(`
      SELECT COUNT(*) as count FROM trial_logs WHERE customer_phone = ?
    `).get(cleanPhone) as { count: number };
    if (phoneUsed.count >= trialSettings.max_per_phone) {
      return res.status(400).json({ error: 'Số điện thoại này đã sử dụng hết lượt dùng thử.' });
    }

    // Check if user already has an active paid subscription
    const activeSub = db.prepare(`
      SELECT * FROM subscriptions 
      WHERE (customer_email = ? OR customer_phone = ?) AND status = 'active'
    `).get(cleanEmail, cleanPhone) as any;
    if (activeSub && activeSub.subscription_type === 'paid') {
      return res.status(400).json({ error: 'Bạn đã có gói trả phí đang hoạt động, không cần đăng ký dùng thử.' });
    }

    const trialHours = trialSettings.trial_hours || 24;
    const now = new Date();
    const token = crypto.randomBytes(24).toString('hex');
    const tokenExpires = new Date(now.getTime() + 48 * 60 * 60 * 1000); // link valid 48h

    // Insert pending token
    db.prepare(`
      INSERT INTO trial_tokens (
        token, customer_name, customer_email, customer_phone,
        trial_hours, status, created_at, expired_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      token,
      customer_name.trim(),
      cleanEmail,
      cleanPhone,
      trialHours,
      'pending',
      now.toISOString(),
      tokenExpires.toISOString()
    );

    // Build activation URL
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host');
    const origin = (req.headers.origin as string) || `${proto}://${host}`;
    const activationLink = `${origin}/?trial_token=${token}`;

    // Send activation email
    const emailResult = await sendTrialActivationEmail({
      to: cleanEmail,
      customerName: customer_name.trim(),
      activationLink,
      trialHours
    });

    db.prepare(`
      UPDATE trial_tokens SET email_sent = ?, email_error = ? WHERE token = ?
    `).run(
      emailResult.success && !emailResult.simulated ? 1 : 0,
      emailResult.error || null,
      token
    );

    res.json({
      success: true,
      message: `Hệ thống đã gửi link kích hoạt dùng thử đến email ${cleanEmail}.`,
      customer_name: customer_name.trim(),
      customer_email: cleanEmail,
      customer_phone: cleanPhone,
      trial_hours: trialHours,
      token,
      activation_link: activationLink,
      email_sent: emailResult.success && !emailResult.simulated,
      simulated: emailResult.simulated
    });
  } catch (err: any) {
    console.error('Trial registration error:', err);
    res.status(500).json({ error: 'Lỗi đăng ký dùng thử: ' + err.message });
  }
});

// Activate Trial by Token (Triggered when user clicks activation link in email)
app.post('/api/trial/activate-by-token', (req, res) => {
  try {
    const { token, device_id } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Mã kích hoạt không hợp lệ.' });
    }

    const tokenRecord = db.prepare('SELECT * FROM trial_tokens WHERE token = ?').get(token) as any;
    if (!tokenRecord) {
      return res.status(404).json({ error: 'Liên kết kích hoạt không tồn tại hoặc không hợp lệ.' });
    }

    // If already activated, retrieve active subscription
    if (tokenRecord.status === 'activated') {
      const existingSub = db.prepare(`
        SELECT * FROM subscriptions 
        WHERE customer_email = ? AND status = 'active'
        ORDER BY created_at DESC LIMIT 1
      `).get(tokenRecord.customer_email) as any;

      if (existingSub) {
        return res.json({
          success: true,
          alreadyActivated: true,
          subscription: existingSub,
          message: 'Tài khoản dùng thử đã được kích hoạt trước đó.'
        });
      }
    }

    // Check token expiry
    if (tokenRecord.expired_at && new Date(tokenRecord.expired_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Liên kết kích hoạt đã hết hạn sử dụng. Vui lòng đăng ký lại.' });
    }

    const trialHours = tokenRecord.trial_hours || 24;
    const now = new Date();
    const expiredAt = new Date(now.getTime() + trialHours * 60 * 60 * 1000);
    const subId = `trial_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Create Subscription
    db.prepare(`
      INSERT INTO subscriptions (
        id, customer_name, customer_email, customer_phone,
        subscription_type, plan_name, status, started_at, expired_at, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      subId,
      tokenRecord.customer_name,
      tokenRecord.customer_email,
      tokenRecord.customer_phone,
      'trial',
      `Dùng thử miễn phí (${trialHours}h)`,
      'active',
      now.toISOString(),
      expiredAt.toISOString(),
      now.toISOString()
    );

    // Record Trial Log
    db.prepare(`
      INSERT INTO trial_logs (
        id, customer_name, customer_email, customer_phone,
        device_id, ip_address, user_agent, status, started_at, expired_at, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      subId,
      tokenRecord.customer_name,
      tokenRecord.customer_email,
      tokenRecord.customer_phone,
      device_id || 'email_link',
      String(ipAddress),
      String(userAgent),
      'active',
      now.toISOString(),
      expiredAt.toISOString(),
      now.toISOString()
    );

    // Mark token as activated
    db.prepare(`
      UPDATE trial_tokens SET status = 'activated', activated_at = ? WHERE token = ?
    `).run(now.toISOString(), token);

    res.json({
      success: true,
      subscription: {
        id: subId,
        customer_name: tokenRecord.customer_name,
        customer_email: tokenRecord.customer_email,
        customer_phone: tokenRecord.customer_phone,
        subscription_type: 'trial',
        status: 'active',
        started_at: now.toISOString(),
        expired_at: expiredAt.toISOString()
      },
      message: 'Kích hoạt dùng thử thành công! Mọi tính năng AI đã sẵn sàng.'
    });
  } catch (err: any) {
    console.error('Activate token error:', err);
    res.status(500).json({ error: 'Lỗi kích hoạt dùng thử: ' + err.message });
  }
});

// Direct Web Verify Endpoint (when user clicks link directly in email browser)
app.get('/api/trial/verify', (req, res) => {
  const token = req.query.token as string;
  if (!token) {
    return res.status(400).send('Mã kích hoạt không hợp lệ.');
  }

  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host');
  const origin = `${proto}://${host}`;
  res.redirect(`${origin}/?trial_token=${encodeURIComponent(token)}&trial_verified=true`);
});

// Resend Trial Email
app.post('/api/trial/resend', async (req, res) => {
  try {
    const { token, email } = req.body;
    let record: any = null;
    if (token) {
      record = db.prepare('SELECT * FROM trial_tokens WHERE token = ?').get(token);
    } else if (email) {
      record = db.prepare('SELECT * FROM trial_tokens WHERE customer_email = ? ORDER BY created_at DESC LIMIT 1').get(email.trim().toLowerCase());
    }

    if (!record) {
      return res.status(404).json({ error: 'Không tìm thấy thông tin đăng ký dùng thử.' });
    }

    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host');
    const origin = (req.headers.origin as string) || `${proto}://${host}`;
    const activationLink = `${origin}/?trial_token=${record.token}`;

    const emailResult = await sendTrialActivationEmail({
      to: record.customer_email,
      customerName: record.customer_name,
      activationLink,
      trialHours: record.trial_hours
    });

    res.json({
      success: true,
      message: `Đã gửi lại link kích hoạt đến ${record.customer_email}`,
      activation_link: activationLink,
      simulated: emailResult.simulated
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Check Subscription Status (User Verification)
app.get('/api/subscription/check', (req, res) => {
  try {
    const identifier = String(req.query.email || req.query.phone || '').trim().toLowerCase();
    if (!identifier) {
      return res.json({ hasAccess: false, message: 'Chưa cung cấp thông tin tài khoản.' });
    }

    const sub = checkUserSubscription(identifier);
    if (!sub) {
      return res.json({
        hasAccess: false,
        message: 'Bạn chưa có gói sử dụng nào đang hoạt động hoặc đã hết hạn.'
      });
    }

    const now = Date.now();
    const expireTime = new Date(sub.expired_at).getTime();
    const remainingMs = Math.max(0, expireTime - now);
    const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
    const remainingDays = Math.floor(remainingHours / 24);

    res.json({
      hasAccess: true,
      subscription: {
        id: sub.id,
        customer_name: sub.customer_name,
        customer_email: sub.customer_email,
        customer_phone: sub.customer_phone,
        subscription_type: sub.subscription_type,
        plan_name: sub.plan_name,
        status: sub.status,
        started_at: sub.started_at,
        expired_at: sub.expired_at,
        remainingHours,
        remainingDays
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Server-Side AI Generation Endpoint (Secured by Subscription)
app.post('/api/ai/generate', async (req, res) => {
  try {
    const { email, phone, customKey, action, payload } = req.body;

    // Check user subscription
    const sub = checkUserSubscription(email || phone);
    if (!sub) {
      return res.status(403).json({
        error: 'Bạn cần mua gói hoặc đăng ký dùng thử để sử dụng công cụ này.'
      });
    }

    // Determine API Key: User's custom key OR Server's process.env.GEMINI_API_KEY
    const apiKey = customKey && customKey.trim() ? customKey.trim() : (process.env.GEMINI_API_KEY || process.env.API_KEY);
    if (!apiKey) {
      return res.status(500).json({
        error: 'Chưa cấu hình GEMINI_API_KEY trên máy chủ và bạn chưa cài đặt API Key riêng.'
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const modelName = 'gemini-2.5-flash';

    if (action === 'verifyKey') {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: "Check system. Reply 'OK'.",
        config: { maxOutputTokens: 5 }
      });
      return res.json({ success: true, text: response.text });
    }

    if (action === 'generateInitialSetup') {
      const { summary, style, mode, visualStyle } = payload;
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

      const response = await ai.models.generateContent({
        model: modelName,
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
      return res.json(JSON.parse(response.text || '{}'));
    }

    if (action === 'generateTopic') {
      const { summary, style, mode } = payload;
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

      const response = await ai.models.generateContent({ model: modelName, contents: prompt });
      return res.json({ topic: response.text?.trim() || '' });
    }

    if (action === 'generateBackground') {
      const { topic, visualStyle, styleAnalysis } = payload;
      const prompt = `Bạn là đạo diễn hình ảnh video AI.
Dựa trên Chủ đề mới: "${topic}", Visual Style: "${visualStyle}" và Phân tích phong cách gốc: "${styleAnalysis}".

NGUYÊN TẮC: Giữ nguyên phong cách của video gốc (ánh sáng, tông màu, không gian, nhịp điệu, cảm xúc) để dựng nên bối cảnh cho nội dung mới.
Hãy mô tả ngắn gọn 1-2 câu bối cảnh / không gian / nền tảng chi tiết của video này. Trả về văn bản thuần túy.`;

      const response = await ai.models.generateContent({ model: modelName, contents: prompt });
      return res.json({ background: response.text?.trim() || '' });
    }

    if (action === 'generateTimeline') {
      const { topic, background, durationSec, styleAnalysis } = payload;
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

YÊU CẦU FORMAT OUTPUT:
1. Dòng đầu tiên: "DÀN Ý CHI TIẾT: ${topic.toUpperCase()} (${durationSec} GIÂY)"
2. Chia thành các PHẦN rõ ràng (PHẦN 1, PHẦN 2... PHẦN CUỐI).
3. Mỗi phần có cấu trúc:
   PHẦN [X]: [Tên phần kịch tính / cuốn hút] (Phút [M:SS] - Phút [M:SS])
   1) Bối cảnh & Không gian: ...
   2) Hình ảnh & Góc máy: 
      - Cảnh 1 (0:00 - 0:08): [Mô tả góc máy, ánh sáng, hành động theo phong cách gốc]
      - Cảnh 2 (0:08 - 0:16): ...
   3) Âm thanh & Nhạc nền: [Mô tả âm nhạc, SFX, nhịp điệu kế thừa từ phong cách gốc]
   4) Nội dung lời dẫn / Voice: [Lời thoại mang đúng ngữ điệu và sắc thái của phong cách gốc]`;

      const response = await ai.models.generateContent({ model: modelName, contents: prompt });
      return res.json({ timeline: response.text || '' });
    }

    if (action === 'generatePrompts') {
      const { timeline, background, visualStyle, aspectRatio, N, voiceLang, styleAnalysis } = payload;
      const prompt = `Bạn là chuyên gia Prompt Engineering cho các mô hình Video AI và lồng tiếng.
NGUYÊN TẮC: Bám sát Dàn ý Timeline và kế thừa 100% phong cách gốc: "${styleAnalysis}".

THÔNG TIN:
- Timeline: ${timeline}
- Bối cảnh: ${background}
- Visual Style: ${visualStyle}
- Tỷ lệ: ${aspectRatio}
- Ngôn ngữ Voice: ${voiceLang}
- Số phân đoạn 8s (N): ${N}

Trả về JSON array đúng ${N} phần tử: [{ "stt": 1, "prompt": "...", "voice": "..." }, ...]`;

      const response = await ai.models.generateContent({
        model: modelName,
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
      return res.json(JSON.parse(response.text || '[]'));
    }

    return res.status(400).json({ error: 'Hành động không hợp lệ.' });
  } catch (err: any) {
    console.error('AI Generation Error:', err);
    res.status(500).json({ error: err.message || 'Lỗi xử lý AI' });
  }
});

// ================= ADMIN DASHBOARD ROUTES =================

// Admin Login Check
app.post('/api/admin/login', (req, res) => {
  const { passcode } = req.body;
  const configured = process.env.ADMIN_PASSCODE || '123456';
  if (passcode === configured) {
    return res.json({ success: true, message: 'Đăng nhập Quản trị viên thành công' });
  }
  return res.status(401).json({ error: 'Mã PIN Quản trị viên không chính xác.' });
});

// Admin Stats Overview
app.get('/api/admin/overview', verifyAdmin, (req, res) => {
  try {
    const totalOrders = (db.prepare('SELECT COUNT(*) as count FROM orders').get() as any).count;
    const paidOrders = (db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'paid'").get() as any).count;
    const totalRevenue = (db.prepare("SELECT SUM(amount) as sum FROM orders WHERE status = 'paid'").get() as any).sum || 0;
    const activePaidUsers = (db.prepare("SELECT COUNT(*) as count FROM subscriptions WHERE subscription_type = 'paid' AND status = 'active'").get() as any).count;
    const activeTrialUsers = (db.prepare("SELECT COUNT(*) as count FROM subscriptions WHERE subscription_type = 'trial' AND status = 'active'").get() as any).count;
    const totalWebhooks = (db.prepare('SELECT COUNT(*) as count FROM webhook_logs').get() as any).count;

    res.json({
      success: true,
      stats: {
        totalOrders,
        paidOrders,
        totalRevenue,
        activePaidUsers,
        activeTrialUsers,
        totalWebhooks
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Get/Update Plans
app.get('/api/admin/plans', verifyAdmin, (req, res) => {
  const plans = db.prepare('SELECT * FROM plans ORDER BY price ASC').all();
  res.json({ success: true, plans });
});

app.post('/api/admin/plans', verifyAdmin, (req, res) => {
  try {
    const { id, name, description, price, days, is_active, is_featured } = req.body;
    if (!id || !name || price === undefined) {
      return res.status(400).json({ error: 'Thiếu thông tin gói bắt buộc.' });
    }

    const exists = db.prepare('SELECT id FROM plans WHERE id = ?').get(id);
    if (exists) {
      db.prepare(`
        UPDATE plans 
        SET name = ?, description = ?, price = ?, days = ?, is_active = ?, is_featured = ?
        WHERE id = ?
      `).run(name, description || '', Number(price), Number(days || 36500), is_active ? 1 : 0, is_featured ? 1 : 0, id);
    } else {
      db.prepare(`
        INSERT INTO plans (id, name, description, price, days, is_active, is_featured, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, name, description || '', Number(price), Number(days || 36500), is_active ? 1 : 0, is_featured ? 1 : 0, new Date().toISOString());
    }

    res.json({ success: true, message: 'Lưu gói sử dụng thành công' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Get/Update SePay Settings
app.get('/api/admin/sepay-settings', verifyAdmin, (req, res) => {
  const settings = getSepaySettings();
  res.json({ success: true, settings });
});

app.post('/api/admin/sepay-settings', verifyAdmin, (req, res) => {
  try {
    const {
      bank_name,
      bank_code,
      account_number,
      account_holder,
      api_key,
      webhook_secret,
      order_prefix,
      payment_content_template,
      webhook_url,
      is_active
    } = req.body;

    db.prepare(`
      UPDATE sepay_settings 
      SET bank_name = ?, bank_code = ?, account_number = ?, account_holder = ?,
          api_key = ?, webhook_secret = ?, order_prefix = ?, payment_content_template = ?,
          webhook_url = ?, is_active = ?, updated_at = ?
      WHERE id = 'default'
    `).run(
      bank_name,
      bank_code,
      account_number,
      account_holder,
      api_key || '',
      webhook_secret || '',
      order_prefix || 'AFF',
      payment_content_template || '{order_code}',
      webhook_url || '/api/sepay-webhook',
      is_active ? 1 : 0,
      new Date().toISOString()
    );

    res.json({ success: true, message: 'Lưu cấu hình SePay thành công' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Test SePay Connection
app.post('/api/admin/sepay-test', verifyAdmin, (req, res) => {
  const settings = getSepaySettings();
  const errors: string[] = [];

  if (!settings.api_key || !settings.api_key.trim()) {
    errors.push('Chưa nhập SePay API Key.');
  }
  if (!settings.webhook_secret || !settings.webhook_secret.trim()) {
    errors.push('Chưa nhập Webhook Secret.');
  }
  if (!settings.account_number || !settings.bank_code) {
    errors.push('Thiếu thông tin tài khoản ngân hàng (Mã ngân hàng hoặc Số tài khoản).');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: errors.join(' ')
    });
  }

  return res.json({
    success: true,
    message: 'Kết nối SePay thành công. Webhook đã sẵn sàng nhận giao dịch.'
  });
});

// Admin Create Test Transaction (Mock payment for testing)
app.post('/api/admin/sepay-test-transaction', verifyAdmin, (req, res) => {
  try {
    const { order_code } = req.body;
    if (!order_code) {
      return res.status(400).json({ error: 'Vui lòng cung cấp mã đơn hàng cần test' });
    }

    const order = db.prepare('SELECT * FROM orders WHERE order_code = ?').get(order_code) as any;
    if (!order) {
      return res.status(404).json({ error: `Không tìm thấy đơn hàng ${order_code}` });
    }

    // Call internal webhook logic
    const paidAt = new Date();
    const expiredAt = new Date(paidAt.getTime() + (order.plan_days || 36500) * 24 * 60 * 60 * 1000);

    db.prepare(`
      UPDATE orders SET status = 'paid', paid_at = ?, expired_at = ? WHERE order_id = ?
    `).run(paidAt.toISOString(), expiredAt.toISOString(), order.order_id);

    const subId = `sub_${Date.now()}_test`;
    db.prepare(`
      INSERT INTO subscriptions (
        id, customer_name, customer_email, customer_phone,
        subscription_type, plan_name, status, started_at, expired_at, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      subId,
      order.customer_name,
      order.customer_email,
      order.customer_phone,
      'paid',
      order.plan_name,
      'active',
      paidAt.toISOString(),
      expiredAt.toISOString(),
      new Date().toISOString()
    );

    db.prepare(`
      INSERT INTO webhook_logs (id, received_at, raw_payload, payment_content, amount, detected_order_code, result)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `test_${Date.now()}`,
      new Date().toISOString(),
      JSON.stringify({ test: true, order_code }),
      `TEST ${order_code}`,
      order.amount,
      order_code,
      'test_success'
    );

    sendPaymentSuccessEmail({
      to: order.customer_email,
      customerName: order.customer_name,
      planName: order.plan_name,
      planDays: order.plan_days,
      amount: order.amount,
      orderCode: order.order_code
    }).catch(err => console.error('Payment test email error:', err));

    res.json({
      success: true,
      message: `Đã kích hoạt test thành công đơn hàng ${order_code}. Gói sử dụng đã được active!`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Get/Update Trial Settings
app.get('/api/admin/trial-settings', verifyAdmin, (req, res) => {
  const settings = getTrialSettings();
  res.json({ success: true, settings });
});

app.post('/api/admin/trial-settings', verifyAdmin, (req, res) => {
  try {
    const { is_active, trial_hours, button_title, description, terms, app_redirect_url, max_per_email, max_per_phone } = req.body;
    db.prepare(`
      UPDATE trial_settings 
      SET is_active = ?, trial_hours = ?, button_title = ?, description = ?,
          terms = ?, app_redirect_url = ?, max_per_email = ?, max_per_phone = ?, updated_at = ?
      WHERE id = 'default'
    `).run(
      is_active ? 1 : 0,
      Number(trial_hours || 24),
      button_title || 'Dùng thử miễn phí',
      description || '',
      terms || '',
      app_redirect_url || '',
      Number(max_per_email || 1),
      Number(max_per_phone || 1),
      new Date().toISOString()
    );

    res.json({ success: true, message: 'Lưu cấu hình Dùng thử thành công' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Orders List
app.get('/api/admin/orders', verifyAdmin, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  res.json({ success: true, orders });
});

// Admin Webhook Logs List
app.get('/api/admin/webhook-logs', verifyAdmin, (req, res) => {
  const logs = db.prepare('SELECT * FROM webhook_logs ORDER BY received_at DESC LIMIT 100').all();
  res.json({ success: true, logs });
});

// Admin Active Users List (Subscriptions)
app.get('/api/admin/active-users', verifyAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT * FROM subscriptions 
    ORDER BY created_at DESC
  `).all();
  res.json({ success: true, users });
});

// Admin Trial Users List
app.get('/api/admin/trial-users', verifyAdmin, (req, res) => {
  const { filter } = req.query; // 'all', 'active', 'expired', 'upgraded'
  const trials = db.prepare(`
    SELECT t.*, s.subscription_type, s.status as sub_status 
    FROM trial_logs t
    LEFT JOIN subscriptions s ON t.customer_email = s.customer_email
    ORDER BY t.created_at DESC
  `).all() as any[];

  const now = new Date().getTime();
  const processed = trials.map(t => {
    const expired = new Date(t.expired_at).getTime() < now;
    const isUpgraded = t.subscription_type === 'paid';
    let statusLabel = 'Đang dùng thử';
    if (isUpgraded) statusLabel = 'Đã nâng cấp trả phí';
    else if (expired) statusLabel = 'Đã hết hạn';

    const remainingHours = Math.max(0, Math.floor((new Date(t.expired_at).getTime() - now) / (1000 * 60 * 60)));

    return {
      ...t,
      statusLabel,
      remainingHours,
      isExpired: expired,
      isUpgraded
    };
  });

  const filtered = processed.filter(t => {
    if (filter === 'active') return !t.isExpired && !t.isUpgraded;
    if (filter === 'expired') return t.isExpired && !t.isUpgraded;
    if (filter === 'upgraded') return t.isUpgraded;
    return true;
  });

  res.json({ success: true, trialUsers: filtered });
});

// Admin Email Settings & Logs
app.get('/api/admin/email-settings', verifyAdmin, (req, res) => {
  const settings = getEmailSettings();
  res.json({ success: true, settings });
});

app.post('/api/admin/email-settings', verifyAdmin, (req, res) => {
  try {
    const { smtp_host, smtp_port, smtp_user, smtp_pass, from_name, from_email, is_active } = req.body;
    db.prepare(`
      UPDATE email_settings 
      SET smtp_host = ?, smtp_port = ?, smtp_user = ?, smtp_pass = ?,
          from_name = ?, from_email = ?, is_active = ?, updated_at = ?
      WHERE id = 'default'
    `).run(
      smtp_host || 'smtp.gmail.com',
      Number(smtp_port || 587),
      smtp_user || '',
      smtp_pass || '',
      from_name || 'AI Video Công Nghệ',
      from_email || '',
      is_active ? 1 : 0,
      new Date().toISOString()
    );

    res.json({ success: true, message: 'Lưu cấu hình Email SMTP thành công' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/email-test', verifyAdmin, async (req, res) => {
  try {
    const { test_email } = req.body;
    if (!test_email) {
      return res.status(400).json({ error: 'Vui lòng nhập email nhận thử nghiệm.' });
    }
    const result = await sendTestEmail(test_email);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/sent-emails', verifyAdmin, (req, res) => {
  const emails = db.prepare('SELECT * FROM sent_emails ORDER BY created_at DESC LIMIT 100').all();
  res.json({ success: true, emails });
});

// Admin Clear All Customers & Test Data
app.post('/api/admin/clear-test-data', verifyAdmin, (req, res) => {
  try {
    const { target } = req.body; // 'all', 'trials', 'orders'

    if (target === 'trials') {
      db.prepare("DELETE FROM subscriptions WHERE subscription_type = 'trial'").run();
      db.prepare('DELETE FROM trial_logs').run();
      db.prepare('DELETE FROM trial_tokens').run();
      db.prepare('DELETE FROM sent_emails').run();
    } else {
      // Clear all customer and transaction data
      db.prepare('DELETE FROM subscriptions').run();
      db.prepare('DELETE FROM trial_logs').run();
      db.prepare('DELETE FROM trial_tokens').run();
      db.prepare('DELETE FROM orders').run();
      db.prepare('DELETE FROM payments').run();
      db.prepare('DELETE FROM webhook_logs').run();
      db.prepare('DELETE FROM sent_emails').run();
    }

    res.json({
      success: true,
      message: 'Đã xóa toàn bộ dữ liệu khách hàng, đăng ký dùng thử và đơn hàng thành công!'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ================= VITE MIDDLEWARE & SPA =================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
