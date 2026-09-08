import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'app_database.sqlite');
export const db = new DatabaseSync(dbPath);

// Initialize Tables
export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price INTEGER NOT NULL,
      days INTEGER NOT NULL,
      is_active INTEGER DEFAULT 1,
      is_featured INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sepay_settings (
      id TEXT PRIMARY KEY,
      bank_name TEXT NOT NULL,
      bank_code TEXT NOT NULL,
      account_number TEXT NOT NULL,
      account_holder TEXT NOT NULL,
      api_key TEXT,
      webhook_secret TEXT,
      order_prefix TEXT DEFAULT 'AFF',
      payment_content_template TEXT DEFAULT '{order_code}',
      webhook_url TEXT,
      is_active INTEGER DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trial_settings (
      id TEXT PRIMARY KEY,
      is_active INTEGER DEFAULT 1,
      trial_hours INTEGER DEFAULT 24,
      button_title TEXT DEFAULT 'Dùng thử miễn phí',
      description TEXT,
      terms TEXT,
      app_redirect_url TEXT DEFAULT '',
      max_per_email INTEGER DEFAULT 1,
      max_per_phone INTEGER DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_settings (
      id TEXT PRIMARY KEY,
      smtp_host TEXT DEFAULT 'smtp.gmail.com',
      smtp_port INTEGER DEFAULT 587,
      smtp_user TEXT DEFAULT '',
      smtp_pass TEXT DEFAULT '',
      from_name TEXT DEFAULT 'AI Video Tools',
      from_email TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trial_tokens (
      token TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      trial_hours INTEGER NOT NULL,
      status TEXT NOT NULL, -- pending, activated, expired
      email_sent INTEGER DEFAULT 0,
      email_error TEXT,
      created_at TEXT NOT NULL,
      activated_at TEXT,
      expired_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sent_emails (
      id TEXT PRIMARY KEY,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      customer_name TEXT,
      activation_link TEXT,
      status TEXT NOT NULL, -- sent, failed, simulated
      error_message TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      order_id TEXT PRIMARY KEY,
      order_code TEXT UNIQUE NOT NULL,
      plan_id TEXT NOT NULL,
      plan_name TEXT NOT NULL,
      plan_days INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      note TEXT,
      status TEXT NOT NULL, -- pending, paid, failed, expired
      payment_content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      paid_at TEXT,
      expired_at TEXT
    );

    CREATE TABLE IF NOT EXISTS payments (
      payment_id TEXT PRIMARY KEY,
      order_code TEXT NOT NULL,
      amount INTEGER NOT NULL,
      bank_brand_name TEXT,
      account_number TEXT,
      transaction_content TEXT,
      transaction_date TEXT,
      reference_code TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      subscription_type TEXT NOT NULL, -- trial, paid
      plan_name TEXT,
      status TEXT NOT NULL, -- active, expired
      started_at TEXT NOT NULL,
      expired_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_logs (
      id TEXT PRIMARY KEY,
      received_at TEXT NOT NULL,
      raw_payload TEXT,
      payment_content TEXT,
      amount INTEGER,
      detected_order_code TEXT,
      result TEXT,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS trial_logs (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      device_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      expired_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Seed default plan if not present
  const checkPlan = db.prepare('SELECT COUNT(*) as count FROM plans').get() as { count: number };
  if (checkPlan.count === 0) {
    db.prepare(`
      INSERT INTO plans (id, name, description, price, days, is_active, is_featured, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'lifetime',
      'Gói Vĩnh Viễn',
      'Sử dụng vĩnh viễn không giới hạn công nghệ tạo video AI, toàn bộ dàn ý kịch bản, âm thanh và bảng prompts chuẩn xác.',
      398000,
      36500, // 100 năm (vĩnh viễn)
      1,
      1,
      new Date().toISOString()
    );
  }

  // Seed default SePay settings if not present
  const checkSettings = db.prepare('SELECT COUNT(*) as count FROM sepay_settings').get() as { count: number };
  if (checkSettings.count === 0) {
    db.prepare(`
      INSERT INTO sepay_settings (
        id, bank_name, bank_code, account_number, account_holder,
        api_key, webhook_secret, order_prefix, payment_content_template,
        webhook_url, is_active, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'default',
      'MBBank (Ngân hàng Quân Đội)',
      'MB',
      '0988888888',
      'HUYNH HONG',
      process.env.SEPAY_API_KEY || '',
      process.env.SEPAY_WEBHOOK_SECRET || '',
      'AFF',
      '{order_code}',
      '/api/sepay-webhook',
      1,
      new Date().toISOString()
    );
  }

  // Seed default trial settings if not present
  const checkTrial = db.prepare('SELECT COUNT(*) as count FROM trial_settings').get() as { count: number };
  if (checkTrial.count === 0) {
    db.prepare(`
      INSERT INTO trial_settings (
        id, is_active, trial_hours, button_title, description, terms,
        max_per_email, max_per_phone, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'default',
      1,
      24,
      'Dùng thử miễn phí',
      'Trải nghiệm 24 giờ sử dụng trọn bộ tính năng tạo video AI, dàn ý timeline và bảng prompts đỉnh cao.',
      'Mỗi email và số điện thoại chỉ được tham gia dùng thử 1 lần.',
      1,
      1,
      new Date().toISOString()
    );
  }

  try {
    db.exec(`ALTER TABLE trial_settings ADD COLUMN app_redirect_url TEXT DEFAULT ''`);
  } catch (err) {
    // Column already exists
  }

  // Seed default email settings if not present
  const checkEmail = db.prepare('SELECT COUNT(*) as count FROM email_settings').get() as { count: number };
  if (checkEmail.count === 0) {
    db.prepare(`
      INSERT INTO email_settings (
        id, smtp_host, smtp_port, smtp_user, smtp_pass, from_name, from_email, is_active, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'default',
      process.env.SMTP_HOST || 'smtp.gmail.com',
      Number(process.env.SMTP_PORT || 587),
      process.env.SMTP_USER || '',
      process.env.SMTP_PASS || '',
      process.env.SMTP_FROM_NAME || 'AI Video Công Nghệ',
      process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@aivideo.vn',
      1,
      new Date().toISOString()
    );
  }
}
