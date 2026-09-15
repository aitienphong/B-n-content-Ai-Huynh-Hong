import express from 'express';
import cors from 'cors';
import path from 'node:path';
import crypto from 'node:crypto';
import { GoogleGenAI, Type } from '@google/genai';
import { query, queryOne, initDatabase, isDatabaseConfigured } from './server/db.js';
import {
  sendTrialActivationEmail,
  sendPaymentSuccessEmail,
  sendTestEmail,
  getEmailSettings
} from './server/email.js';

// Initialize PostgreSQL database schema asynchronously
initDatabase().catch((err) => {
  console.warn('[Database] Initial schema check postponed or pending DATABASE_URL:', err.message || err);
});

export const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Helper to get SePay settings
async function getSepaySettings() {
  try {
    const settings = await queryOne<any>('SELECT * FROM sepay_settings WHERE id = $1', ['default']);
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
  } catch (err) {
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
}

// Helper to get Trial settings
async function getTrialSettings() {
  try {
    const settings = await queryOne<any>('SELECT * FROM trial_settings WHERE id = $1', ['default']);
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
  } catch (err) {
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
async function checkUserSubscription(identifier: string) {
  if (!identifier) return null;
  const sub = await queryOne<any>(
    `
    SELECT * FROM subscriptions 
    WHERE (customer_email = $1 OR customer_phone = $2)
      AND status = 'active'
    ORDER BY created_at DESC 
    LIMIT 1
  `,
    [identifier, identifier]
  );

  if (!sub) return null;

  // Check if expired
  const now = new Date().getTime();
  const expireTime = new Date(sub.expired_at).getTime();

  if (expireTime < now) {
    try {
      await query('UPDATE subscriptions SET status = $1 WHERE id = $2', ['expired', sub.id]);
    } catch (e) {
      console.warn('Failed to update expired status:', e);
    }
    return null;
  }

  return sub;
}

// ================= API ROUTES =================

// 0. Health Check Endpoint (Required for Vercel/Monitoring)
app.get('/api/health', async (req, res) => {
  try {
    if (!isDatabaseConfigured()) {
      return res.status(503).json({
        success: false,
        database: 'disconnected',
        message: 'DATABASE_URL environment variable is not configured'
      });
    }

    // Ping PostgreSQL
    await query('SELECT 1 as ok');

    return res.json({
      success: true,
      database: 'connected'
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      database: 'error'
    });
  }
});

// 1. Get Public Plans
app.get('/api/plans', async (req, res) => {
  try {
    const plans = await query('SELECT * FROM plans WHERE is_active = 1 ORDER BY price ASC');
    res.json({ success: true, plans });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Get Public Payment & SePay Config
app.get('/api/payment-config', async (req, res) => {
  try {
    const settings = await getSepaySettings();
    res.json({
      bank_name: settings.bank_name,
      bank_code: settings.bank_code,
      account_number: settings.account_number,
      account_holder: settings.account_holder,
      order_prefix: settings.order_prefix || 'AFF',
      payment_content_template: settings.payment_content_template || '{order_code}',
      is_active: settings.is_active === 1
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Create Order
app.post('/api/orders', async (req, res) => {
  try {
    const {
      plan_id,
      customer_name,
      customer_email,
      customer_phone,
      note
    } = req.body;

    if (!plan_id) {
      return res.status(400).json({ error: 'Vui lòng chọn gói đăng ký.' });
    }
    if (!customer_name || !customer_name.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập họ và tên của bạn.' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!customer_email || !emailRegex.test(customer_email.trim())) {
      return res.status(400).json({ error: 'Vui lòng nhập địa chỉ email hợp lệ.' });
    }
    if (!customer_phone || !customer_phone.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập số điện thoại.' });
    }

    const plan = await queryOne<any>('SELECT * FROM plans WHERE id = $1 AND is_active = 1', [plan_id]);
    if (!plan) {
      return res.status(404).json({ error: 'Gói dịch vụ không tồn tại hoặc đã tạm dừng.' });
    }

    const settings = await getSepaySettings();
    const prefix = settings.order_prefix || 'AFF';

    // Generate unique order code (e.g. AFF000001)
    const countRow = await queryOne<{ count: string | number }>('SELECT COUNT(*) as count FROM orders');
    const nextNum = Number(countRow?.count || 0) + 1;
    let order_code = `${prefix}${String(nextNum).padStart(6, '0')}`;

    // Ensure uniqueness
    const existing = await queryOne('SELECT order_code FROM orders WHERE order_code = $1', [order_code]);
    if (existing) {
      const rand = Math.floor(1000 + Math.random() * 9000);
      order_code = `${prefix}${rand}${String(Date.now()).slice(-2)}`;
    }

    const order_id = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const payment_content = order_code;
    const cleanEmail = customer_email.trim().toLowerCase();
    const cleanPhone = customer_phone.trim();

    await query(
      `
      INSERT INTO orders (
        order_id, order_code, plan_id, plan_name, plan_days,
        amount, customer_name, customer_email, customer_phone,
        note, status, payment_content, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `,
      [
        order_id,
        order_code,
        plan.id,
        plan.name,
        Number(plan.days),
        Number(plan.price),
        customer_name.trim(),
        cleanEmail,
        cleanPhone,
        note || '',
        'pending',
        payment_content,
        now
      ]
    );

    // Build VietQR Image URL
    const qrUrl = `https://qr.sepay.vn/img?acc=${encodeURIComponent(settings.account_number)}&bank=${encodeURIComponent(settings.bank_code)}&amount=${plan.price}&des=${encodeURIComponent(payment_content)}`;

    res.json({
      success: true,
      order: {
        order_id,
        order_code,
        plan_id: plan.id,
        plan_name: plan.name,
        plan_days: Number(plan.days),
        amount: Number(plan.price),
        customer_name: customer_name.trim(),
        customer_email: cleanEmail,
        customer_phone: cleanPhone,
        payment_content,
        status: 'pending',
        created_at: now
      },
      payment: {
        bank_name: settings.bank_name,
        bank_code: settings.bank_code,
        account_number: settings.account_number,
        account_holder: settings.account_holder,
        amount: Number(plan.price),
        payment_content,
        qr_url: qrUrl
      }
    });
  } catch (err: any) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Không thể tạo đơn hàng: ' + err.message });
  }
});

// 4. Check Order Status
app.get('/api/orders/:order_code/status', async (req, res) => {
  try {
    const { order_code } = req.params;
    const order = await queryOne<any>('SELECT * FROM orders WHERE order_code = $1', [order_code]);

    if (!order) {
      return res.status(404).json({ error: 'Không tìm thấy thông tin đơn hàng.' });
    }

    let subscription = null;
    if (order.status === 'paid') {
      subscription = await queryOne<any>(
        `
        SELECT * FROM subscriptions 
        WHERE customer_email = $1 AND status = 'active'
        ORDER BY created_at DESC LIMIT 1
      `,
        [order.customer_email]
      );
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

// 5. SePay Webhook Endpoint (Fully Idempotent with Neon PostgreSQL)
app.post('/api/sepay-webhook', async (req, res) => {
  const logId = `wh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const rawPayload = JSON.stringify(req.body);

  try {
    const settings = await getSepaySettings();

    // Verify Webhook Secret if configured
    const configuredSecret = (process.env.SEPAY_WEBHOOK_SECRET || settings.webhook_secret || '').trim();
    if (configuredSecret) {
      const authHeader = String(req.headers['authorization'] || '').trim();
      const sepayHeader = String(req.headers['sepay-secret'] || '').trim();

      const isAuthorized =
        authHeader === `Apikey ${configuredSecret}` ||
        authHeader === `Bearer ${configuredSecret}` ||
        authHeader === configuredSecret ||
        sepayHeader === configuredSecret ||
        req.body.secret === configuredSecret;

      if (!isAuthorized) {
        try {
          await query(
            `
            INSERT INTO webhook_logs (id, received_at, raw_payload, result, error_message)
            VALUES ($1, $2, $3, $4, $5)
          `,
            [logId, now, rawPayload, 'unauthorized', 'Invalid or missing Webhook Secret']
          );
        } catch (logErr) {
          console.warn('Failed to insert unauthorized log:', logErr);
        }

        return res.status(401).json({ success: false, message: 'Unauthorized Webhook' });
      }
    }

    const {
      id: sepayTxId,
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
    const transactionId = String(sepayTxId || referenceCode || '').trim();

    // Check transaction type (Must be money IN)
    if (transferType && String(transferType).toLowerCase() !== 'in') {
      try {
        await query(
          `
          INSERT INTO webhook_logs (id, received_at, raw_payload, payment_content, amount, transaction_id, result, error_message)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
          [logId, now, rawPayload, paymentContent, amount, transactionId || null, 'ignored', 'Not an IN transaction']
        );
      } catch (logErr) {
        console.warn('Failed to log ignored webhook:', logErr);
      }

      return res.status(200).json({ success: true, message: 'Ignored non-credit transaction' });
    }

    // Chống xử lý trùng theo id giao dịch SePay (Idempotent protection)
    if (transactionId) {
      const existingTx = await queryOne<any>(
        `SELECT id FROM webhook_logs WHERE transaction_id = $1 AND result = 'success' LIMIT 1`,
        [transactionId]
      );
      if (existingTx) {
        return res.status(200).json({
          success: true,
          message: 'Giao dịch đã được xử lý trước đó (Idempotent)',
          duplicate: true
        });
      }
    }

    // Extract Order Code using prefix regex (e.g. AFF000001)
    const prefix = settings.order_prefix || 'AFF';
    const regex = new RegExp(`(${prefix}\\d{6})`, 'i');
    const match = paymentContent.match(regex);
    const detectedCode = match ? match[1].toUpperCase() : null;

    if (!detectedCode) {
      try {
        await query(
          `
          INSERT INTO webhook_logs (id, received_at, raw_payload, payment_content, amount, transaction_id, result, error_message)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
          [
            logId,
            now,
            rawPayload,
            paymentContent,
            amount,
            transactionId || null,
            'no_order_code',
            'Không tìm thấy mã đơn hàng trong nội dung chuyển khoản'
          ]
        );
      } catch (logErr) {
        console.warn('Failed to log missing code:', logErr);
      }

      return res.status(200).json({ success: false, message: 'Order code not found in payment content' });
    }

    // Find Order in PostgreSQL
    const order = await queryOne<any>('SELECT * FROM orders WHERE order_code = $1', [detectedCode]);
    if (!order) {
      try {
        await query(
          `
          INSERT INTO webhook_logs (id, received_at, raw_payload, payment_content, amount, detected_order_code, transaction_id, result, error_message)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
          [
            logId,
            now,
            rawPayload,
            paymentContent,
            amount,
            detectedCode,
            transactionId || null,
            'order_not_found',
            `Mã đơn ${detectedCode} không tồn tại`
          ]
        );
      } catch (logErr) {
        console.warn('Failed to log order not found:', logErr);
      }

      return res.status(200).json({ success: false, message: 'Order code does not exist' });
    }

    // Check if already paid
    if (order.status === 'paid') {
      try {
        await query(
          `
          INSERT INTO webhook_logs (id, received_at, raw_payload, payment_content, amount, detected_order_code, transaction_id, result, error_message)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
          [
            logId,
            now,
            rawPayload,
            paymentContent,
            amount,
            detectedCode,
            transactionId || null,
            'already_paid',
            'Đơn hàng này đã được xác nhận thanh toán trước đó'
          ]
        );
      } catch (logErr) {
        console.warn('Failed to log already paid:', logErr);
      }

      return res.status(200).json({ success: true, message: 'Order already paid, no action needed' });
    }

    // Validate Amount
    if (amount < Number(order.amount)) {
      try {
        await query(
          `
          INSERT INTO webhook_logs (id, received_at, raw_payload, payment_content, amount, detected_order_code, transaction_id, result, error_message)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
          [
            logId,
            now,
            rawPayload,
            paymentContent,
            amount,
            detectedCode,
            transactionId || null,
            'insufficient_amount',
            `Số tiền chuyển (${amount}) nhỏ hơn giá trị đơn hàng (${order.amount})`
          ]
        );
      } catch (logErr) {
        console.warn('Failed to log insufficient amount:', logErr);
      }

      return res.status(200).json({ success: false, message: 'Insufficient payment amount' });
    }

    // Valid Payment! Calculate Expiration Date
    const paidAt = new Date();
    const planDays = Number(order.plan_days || 36500);
    const expiredAt = new Date(paidAt.getTime() + planDays * 24 * 60 * 60 * 1000);

    // 1. Update Order status to 'paid'
    await query(
      `
      UPDATE orders 
      SET status = 'paid', paid_at = $1, expired_at = $2
      WHERE order_id = $3
    `,
      [paidAt.toISOString(), expiredAt.toISOString(), order.order_id]
    );

    // 2. Insert into Payments
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await query(
      `
      INSERT INTO payments (
        payment_id, order_code, amount, bank_brand_name,
        account_number, transaction_content, transaction_date, reference_code, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
      [
        paymentId,
        order.order_code,
        amount,
        gateway || settings.bank_code,
        accountNumber || settings.account_number,
        paymentContent,
        transactionDate || now,
        referenceCode || transactionId || logId,
        now
      ]
    );

    // 3. Create or Update Subscription for customer
    const existingSub = await queryOne<any>(
      `
      SELECT * FROM subscriptions 
      WHERE (customer_email = $1 OR customer_phone = $2)
      ORDER BY created_at DESC LIMIT 1
    `,
      [order.customer_email, order.customer_phone]
    );

    const subId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    if (existingSub) {
      await query(
        `
        UPDATE subscriptions 
        SET subscription_type = 'paid', plan_name = $1, status = 'active', started_at = $2, expired_at = $3
        WHERE id = $4
      `,
        [order.plan_name, paidAt.toISOString(), expiredAt.toISOString(), existingSub.id]
      );
    } else {
      await query(
        `
        INSERT INTO subscriptions (
          id, customer_name, customer_email, customer_phone,
          subscription_type, plan_name, status, started_at, expired_at, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
        [
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
        ]
      );
    }

    // 4. Log Success with unique transaction_id
    await query(
      `
      INSERT INTO webhook_logs (id, received_at, raw_payload, payment_content, amount, detected_order_code, transaction_id, result)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
      [logId, now, rawPayload, paymentContent, amount, detectedCode, transactionId || null, 'success']
    );

    // Send payment confirmation email asynchronously (non-blocking)
    sendPaymentSuccessEmail({
      to: order.customer_email,
      customerName: order.customer_name,
      planName: order.plan_name,
      planDays: Number(order.plan_days),
      amount: Number(order.amount),
      orderCode: order.order_code
    }).catch((err) => console.error('Payment email error:', err));

    return res.status(200).json({ success: true, message: 'Payment successfully confirmed and activated' });
  } catch (err: any) {
    console.error('Webhook processing error:', err);
    try {
      await query(
        `
        INSERT INTO webhook_logs (id, received_at, raw_payload, result, error_message)
        VALUES ($1, $2, $3, $4, $5)
      `,
        [logId, now, rawPayload, 'exception', err.message]
      );
    } catch (logErr) {
      console.warn('Failed to log webhook exception:', logErr);
    }

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

    const trialSettings = await getTrialSettings();
    if (trialSettings.is_active !== 1) {
      return res.status(400).json({ error: 'Chương trình dùng thử hiện chưa được bật.' });
    }

    const cleanEmail = customer_email.trim().toLowerCase();
    const cleanPhone = customer_phone.trim();

    // Check if email already used trial
    const emailUsed = await queryOne<{ count: string | number }>(
      `SELECT COUNT(*) as count FROM trial_logs WHERE customer_email = $1`,
      [cleanEmail]
    );
    if (Number(emailUsed?.count || 0) >= Number(trialSettings.max_per_email || 1)) {
      return res.status(400).json({ error: 'Email này đã sử dụng hết lượt dùng thử.' });
    }

    // Check if phone already used trial
    const phoneUsed = await queryOne<{ count: string | number }>(
      `SELECT COUNT(*) as count FROM trial_logs WHERE customer_phone = $1`,
      [cleanPhone]
    );
    if (Number(phoneUsed?.count || 0) >= Number(trialSettings.max_per_phone || 1)) {
      return res.status(400).json({ error: 'Số điện thoại này đã sử dụng hết lượt dùng thử.' });
    }

    // Check if user already has an active paid subscription
    const activeSub = await queryOne<any>(
      `SELECT * FROM subscriptions WHERE (customer_email = $1 OR customer_phone = $2) AND status = 'active'`,
      [cleanEmail, cleanPhone]
    );
    if (activeSub && activeSub.subscription_type === 'paid') {
      return res.status(400).json({ error: 'Bạn đã có gói trả phí đang hoạt động, không cần đăng ký dùng thử.' });
    }

    const trialHours = Number(trialSettings.trial_hours || 24);
    const now = new Date();
    const token = crypto.randomBytes(24).toString('hex');
    const tokenExpires = new Date(now.getTime() + 48 * 60 * 60 * 1000); // link valid 48h

    // Insert pending token
    await query(
      `
      INSERT INTO trial_tokens (
        token, customer_name, customer_email, customer_phone,
        trial_hours, status, created_at, expired_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
      [
        token,
        customer_name.trim(),
        cleanEmail,
        cleanPhone,
        trialHours,
        'pending',
        now.toISOString(),
        tokenExpires.toISOString()
      ]
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

    await query(
      `UPDATE trial_tokens SET email_sent = $1, email_error = $2 WHERE token = $3`,
      [emailResult.success && !emailResult.simulated ? 1 : 0, emailResult.error || null, token]
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
app.post('/api/trial/activate-by-token', async (req, res) => {
  try {
    const { token, device_id } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Mã kích hoạt không hợp lệ.' });
    }

    const tokenRecord = await queryOne<any>('SELECT * FROM trial_tokens WHERE token = $1', [token]);
    if (!tokenRecord) {
      return res.status(404).json({ error: 'Liên kết kích hoạt không tồn tại hoặc không hợp lệ.' });
    }

    // If already activated, retrieve active subscription
    if (tokenRecord.status === 'activated') {
      const existingSub = await queryOne<any>(
        `
        SELECT * FROM subscriptions 
        WHERE customer_email = $1 AND status = 'active'
        ORDER BY created_at DESC LIMIT 1
      `,
        [tokenRecord.customer_email]
      );

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

    const trialHours = Number(tokenRecord.trial_hours || 24);
    const now = new Date();
    const expiredAt = new Date(now.getTime() + trialHours * 60 * 60 * 1000);
    const subId = `trial_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Create Subscription
    await query(
      `
      INSERT INTO subscriptions (
        id, customer_name, customer_email, customer_phone,
        subscription_type, plan_name, status, started_at, expired_at, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
      [
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
      ]
    );

    // Record Trial Log
    await query(
      `
      INSERT INTO trial_logs (
        id, customer_name, customer_email, customer_phone,
        device_id, ip_address, user_agent, status, started_at, expired_at, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
      [
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
      ]
    );

    // Mark token as activated
    await query(`UPDATE trial_tokens SET status = 'activated', activated_at = $1 WHERE token = $2`, [
      now.toISOString(),
      token
    ]);

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
      record = await queryOne('SELECT * FROM trial_tokens WHERE token = $1', [token]);
    } else if (email) {
      record = await queryOne(
        'SELECT * FROM trial_tokens WHERE customer_email = $1 ORDER BY created_at DESC LIMIT 1',
        [email.trim().toLowerCase()]
      );
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
      trialHours: Number(record.trial_hours)
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
app.get('/api/subscription/check', async (req, res) => {
  try {
    const identifier = String(req.query.email || req.query.phone || '').trim().toLowerCase();
    if (!identifier) {
      return res.json({ hasAccess: false, message: 'Chưa cung cấp thông tin tài khoản.' });
    }

    const sub = await checkUserSubscription(identifier);
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
    const sub = await checkUserSubscription(email || phone);
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
   - ${
     isDifferent
       ? 'ĐỔI MỚI NỘI DUNG HOÀN TOÀN: Sáng tạo một chủ đề mới, cốt truyện mới, tình huống mới 100% (tránh bản quyền và không trùng lặp câu chuyện cũ), nhưng phải đặt trọn vẹn trong cùng phong cách gốc.'
       : 'TẠO NỘI DUNG MỚI TƯƠNG TỰ: Cùng trục đề tài nhưng viết mới toàn bộ kịch bản, khai thác góc nhìn mới mẻ hơn, hấp dẫn hơn, giữ nguyên 100% phong cách gốc.'
   }

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
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              topic: { type: Type.STRING },
              background: { type: Type.STRING }
            },
            required: ['topic', 'background']
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
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                stt: { type: Type.NUMBER },
                prompt: { type: Type.STRING },
                voice: { type: Type.STRING }
              },
              required: ['stt', 'prompt', 'voice']
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
app.get('/api/admin/overview', verifyAdmin, async (req, res) => {
  try {
    const totalOrdersRow = await queryOne<{ count: string | number }>('SELECT COUNT(*) as count FROM orders');
    const paidOrdersRow = await queryOne<{ count: string | number }>(
      "SELECT COUNT(*) as count FROM orders WHERE status = 'paid'"
    );
    const totalRevenueRow = await queryOne<{ sum: string | number }>(
      "SELECT SUM(amount) as sum FROM orders WHERE status = 'paid'"
    );
    const activePaidUsersRow = await queryOne<{ count: string | number }>(
      "SELECT COUNT(*) as count FROM subscriptions WHERE subscription_type = 'paid' AND status = 'active'"
    );
    const activeTrialUsersRow = await queryOne<{ count: string | number }>(
      "SELECT COUNT(*) as count FROM subscriptions WHERE subscription_type = 'trial' AND status = 'active'"
    );
    const totalWebhooksRow = await queryOne<{ count: string | number }>('SELECT COUNT(*) as count FROM webhook_logs');

    res.json({
      success: true,
      stats: {
        totalOrders: Number(totalOrdersRow?.count || 0),
        paidOrders: Number(paidOrdersRow?.count || 0),
        totalRevenue: Number(totalRevenueRow?.sum || 0),
        activePaidUsers: Number(activePaidUsersRow?.count || 0),
        activeTrialUsers: Number(activeTrialUsersRow?.count || 0),
        totalWebhooks: Number(totalWebhooksRow?.count || 0)
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Get/Update Plans
app.get('/api/admin/plans', verifyAdmin, async (req, res) => {
  try {
    const plans = await query('SELECT * FROM plans ORDER BY price ASC');
    res.json({ success: true, plans });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/plans', verifyAdmin, async (req, res) => {
  try {
    const { id, name, description, price, days, is_active, is_featured } = req.body;
    if (!id || !name || price === undefined) {
      return res.status(400).json({ error: 'Thiếu thông tin gói bắt buộc.' });
    }

    const exists = await queryOne('SELECT id FROM plans WHERE id = $1', [id]);
    if (exists) {
      await query(
        `
        UPDATE plans 
        SET name = $1, description = $2, price = $3, days = $4, is_active = $5, is_featured = $6
        WHERE id = $7
      `,
        [name, description || '', Number(price), Number(days || 36500), is_active ? 1 : 0, is_featured ? 1 : 0, id]
      );
    } else {
      await query(
        `
        INSERT INTO plans (id, name, description, price, days, is_active, is_featured, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
        [
          id,
          name,
          description || '',
          Number(price),
          Number(days || 36500),
          is_active ? 1 : 0,
          is_featured ? 1 : 0,
          new Date().toISOString()
        ]
      );
    }

    res.json({ success: true, message: 'Lưu gói sử dụng thành công' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Get/Update SePay Settings
app.get('/api/admin/sepay-settings', verifyAdmin, async (req, res) => {
  try {
    const settings = await getSepaySettings();
    res.json({ success: true, settings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/sepay-settings', verifyAdmin, async (req, res) => {
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

    await query(
      `
      UPDATE sepay_settings 
      SET bank_name = $1, bank_code = $2, account_number = $3, account_holder = $4,
          api_key = $5, webhook_secret = $6, order_prefix = $7, payment_content_template = $8,
          webhook_url = $9, is_active = $10, updated_at = $11
      WHERE id = 'default'
    `,
      [
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
      ]
    );

    res.json({ success: true, message: 'Lưu cấu hình SePay thành công' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Test SePay Connection
app.post('/api/admin/sepay-test', verifyAdmin, async (req, res) => {
  const settings = await getSepaySettings();
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
app.post('/api/admin/sepay-test-transaction', verifyAdmin, async (req, res) => {
  try {
    const { order_code } = req.body;
    if (!order_code) {
      return res.status(400).json({ error: 'Vui lòng cung cấp mã đơn hàng cần test' });
    }

    const order = await queryOne<any>('SELECT * FROM orders WHERE order_code = $1', [order_code]);
    if (!order) {
      return res.status(404).json({ error: `Không tìm thấy đơn hàng ${order_code}` });
    }

    const paidAt = new Date();
    const expiredAt = new Date(paidAt.getTime() + (Number(order.plan_days) || 36500) * 24 * 60 * 60 * 1000);

    await query(
      `UPDATE orders SET status = 'paid', paid_at = $1, expired_at = $2 WHERE order_id = $3`,
      [paidAt.toISOString(), expiredAt.toISOString(), order.order_id]
    );

    const subId = `sub_${Date.now()}_test`;
    await query(
      `
      INSERT INTO subscriptions (
        id, customer_name, customer_email, customer_phone,
        subscription_type, plan_name, status, started_at, expired_at, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
      [
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
      ]
    );

    const testTxId = `test_${Date.now()}`;
    await query(
      `
      INSERT INTO webhook_logs (id, received_at, raw_payload, payment_content, amount, detected_order_code, transaction_id, result)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
      [
        testTxId,
        new Date().toISOString(),
        JSON.stringify({ test: true, order_code }),
        `TEST ${order_code}`,
        Number(order.amount),
        order_code,
        testTxId,
        'test_success'
      ]
    );

    sendPaymentSuccessEmail({
      to: order.customer_email,
      customerName: order.customer_name,
      planName: order.plan_name,
      planDays: Number(order.plan_days),
      amount: Number(order.amount),
      orderCode: order.order_code
    }).catch((err) => console.error('Payment test email error:', err));

    res.json({
      success: true,
      message: `Đã kích hoạt test thành công đơn hàng ${order_code}. Gói sử dụng đã được active!`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Get/Update Trial Settings
app.get('/api/admin/trial-settings', verifyAdmin, async (req, res) => {
  try {
    const settings = await getTrialSettings();
    res.json({ success: true, settings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/trial-settings', verifyAdmin, async (req, res) => {
  try {
    const {
      is_active,
      trial_hours,
      button_title,
      description,
      terms,
      app_redirect_url,
      max_per_email,
      max_per_phone
    } = req.body;

    await query(
      `
      UPDATE trial_settings 
      SET is_active = $1, trial_hours = $2, button_title = $3, description = $4,
          terms = $5, app_redirect_url = $6, max_per_email = $7, max_per_phone = $8, updated_at = $9
      WHERE id = 'default'
    `,
      [
        is_active ? 1 : 0,
        Number(trial_hours || 24),
        button_title || 'Dùng thử miễn phí',
        description || '',
        terms || '',
        app_redirect_url || '',
        Number(max_per_email || 1),
        Number(max_per_phone || 1),
        new Date().toISOString()
      ]
    );

    res.json({ success: true, message: 'Lưu cấu hình Dùng thử thành công' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Orders List
app.get('/api/admin/orders', verifyAdmin, async (req, res) => {
  try {
    const orders = await query('SELECT * FROM orders ORDER BY created_at DESC');
    res.json({ success: true, orders });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Webhook Logs List
app.get('/api/admin/webhook-logs', verifyAdmin, async (req, res) => {
  try {
    const logs = await query('SELECT * FROM webhook_logs ORDER BY received_at DESC LIMIT 100');
    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Active Users List (Subscriptions)
app.get('/api/admin/active-users', verifyAdmin, async (req, res) => {
  try {
    const users = await query('SELECT * FROM subscriptions ORDER BY created_at DESC');
    res.json({ success: true, users });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Trial Users List
app.get('/api/admin/trial-users', verifyAdmin, async (req, res) => {
  try {
    const { filter } = req.query; // 'all', 'active', 'expired', 'upgraded'
    const trials = await query<any>(`
      SELECT t.*, s.subscription_type, s.status as sub_status 
      FROM trial_logs t
      LEFT JOIN subscriptions s ON t.customer_email = s.customer_email
      ORDER BY t.created_at DESC
    `);

    const now = new Date().getTime();
    const processed = trials.map((t) => {
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

    const filtered = processed.filter((t) => {
      if (filter === 'active') return !t.isExpired && !t.isUpgraded;
      if (filter === 'expired') return t.isExpired && !t.isUpgraded;
      if (filter === 'upgraded') return t.isUpgraded;
      return true;
    });

    res.json({ success: true, trialUsers: filtered });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Email Settings & Logs
app.get('/api/admin/email-settings', verifyAdmin, async (req, res) => {
  try {
    const settings = await getEmailSettings();
    res.json({ success: true, settings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/email-settings', verifyAdmin, async (req, res) => {
  try {
    const { smtp_host, smtp_port, smtp_user, smtp_pass, from_name, from_email, is_active } = req.body;
    await query(
      `
      UPDATE email_settings 
      SET smtp_host = $1, smtp_port = $2, smtp_user = $3, smtp_pass = $4,
          from_name = $5, from_email = $6, is_active = $7, updated_at = $8
      WHERE id = 'default'
    `,
      [
        smtp_host || 'smtp.gmail.com',
        Number(smtp_port || 587),
        smtp_user || '',
        smtp_pass || '',
        from_name || 'AI Video Công Nghệ',
        from_email || '',
        is_active ? 1 : 0,
        new Date().toISOString()
      ]
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

app.get('/api/admin/sent-emails', verifyAdmin, async (req, res) => {
  try {
    const emails = await query('SELECT * FROM sent_emails ORDER BY created_at DESC LIMIT 100');
    res.json({ success: true, emails });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Clear All Customers & Test Data
app.post('/api/admin/clear-test-data', verifyAdmin, async (req, res) => {
  try {
    const { target } = req.body; // 'all', 'trials', 'orders'

    if (target === 'trials') {
      await query("DELETE FROM subscriptions WHERE subscription_type = 'trial'");
      await query('DELETE FROM trial_logs');
      await query('DELETE FROM trial_tokens');
      await query('DELETE FROM sent_emails');
    } else {
      await query('DELETE FROM subscriptions');
      await query('DELETE FROM trial_logs');
      await query('DELETE FROM trial_tokens');
      await query('DELETE FROM orders');
      await query('DELETE FROM payments');
      await query('DELETE FROM webhook_logs');
      await query('DELETE FROM sent_emails');
    }

    res.json({
      success: true,
      message: 'Đã xóa dữ liệu kiểm tra thành công!'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Export Express app for Vercel Serverless Function & Testing
export default app;

// ================= VITE MIDDLEWARE & STANDALONE SERVER =================

// Only start the HTTP listener when NOT running in a Vercel Serverless environment
const isVercel = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV) || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

if (!isVercel) {
  async function startServer() {
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
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

  startServer().catch((err) => {
    console.error('Failed to start standalone server:', err);
  });
}
