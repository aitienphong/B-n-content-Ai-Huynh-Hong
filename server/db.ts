import { neon, NeonQueryFunction } from '@neondatabase/serverless';

let sqlClient: NeonQueryFunction<false, false> | null = null;
let initPromise: Promise<void> | null = null;

export function isDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL;
  return typeof url === 'string' && url.trim().length > 0;
}

export function getDb(): NeonQueryFunction<false, false> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || connectionString.trim().length === 0) {
    throw new Error(
      'DATABASE_URL environment variable is not configured. Please set DATABASE_URL in Vercel or your environment.'
    );
  }

  if (!sqlClient) {
    sqlClient = neon(connectionString.trim());
  }
  return sqlClient;
}

/**
 * Execute a parameterized query with PostgreSQL $1, $2, ... placeholders.
 * Returns array of rows.
 */
export async function query<T = any>(sqlText: string, params: any[] = []): Promise<T[]> {
  const sql = getDb();
  const rows = await sql.query(sqlText, params);
  return (rows as unknown as T[]) || [];
}

/**
 * Convenience helper to fetch a single row or null.
 */
export async function queryOne<T = any>(sqlText: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sqlText, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Initialize PostgreSQL tables, unique constraints, and initial seeds.
 * Safe to execute multiple times (idempotent with CREATE TABLE IF NOT EXISTS and ON CONFLICT).
 */
export async function initDatabase(): Promise<void> {
  if (!isDatabaseConfigured()) {
    console.warn('[Database] DATABASE_URL is not set. Skipping schema initialization.');
    return;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const sql = getDb();

      // 1. Create Tables
      const tableStatements = [
        `CREATE TABLE IF NOT EXISTS plans (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          price BIGINT NOT NULL,
          days INTEGER NOT NULL,
          is_active INTEGER DEFAULT 1,
          is_featured INTEGER DEFAULT 0,
          created_at VARCHAR(255) NOT NULL
        );`,

        `CREATE TABLE IF NOT EXISTS sepay_settings (
          id VARCHAR(255) PRIMARY KEY,
          bank_name VARCHAR(255) NOT NULL,
          bank_code VARCHAR(100) NOT NULL,
          account_number VARCHAR(100) NOT NULL,
          account_holder VARCHAR(255) NOT NULL,
          api_key TEXT,
          webhook_secret TEXT,
          order_prefix VARCHAR(50) DEFAULT 'AFF',
          payment_content_template VARCHAR(255) DEFAULT '{order_code}',
          webhook_url VARCHAR(255),
          is_active INTEGER DEFAULT 1,
          updated_at VARCHAR(255) NOT NULL
        );`,

        `CREATE TABLE IF NOT EXISTS trial_settings (
          id VARCHAR(255) PRIMARY KEY,
          is_active INTEGER DEFAULT 1,
          trial_hours INTEGER DEFAULT 24,
          button_title VARCHAR(255) DEFAULT 'Dùng thử miễn phí',
          description TEXT,
          terms TEXT,
          app_redirect_url TEXT DEFAULT '',
          max_per_email INTEGER DEFAULT 1,
          max_per_phone INTEGER DEFAULT 1,
          updated_at VARCHAR(255) NOT NULL
        );`,

        `CREATE TABLE IF NOT EXISTS email_settings (
          id VARCHAR(255) PRIMARY KEY,
          smtp_host VARCHAR(255) DEFAULT 'smtp.gmail.com',
          smtp_port INTEGER DEFAULT 587,
          smtp_user VARCHAR(255) DEFAULT '',
          smtp_pass TEXT DEFAULT '',
          from_name VARCHAR(255) DEFAULT 'AI Video Tools',
          from_email VARCHAR(255) DEFAULT '',
          is_active INTEGER DEFAULT 1,
          updated_at VARCHAR(255) NOT NULL
        );`,

        `CREATE TABLE IF NOT EXISTS trial_tokens (
          token VARCHAR(255) PRIMARY KEY,
          customer_name VARCHAR(255) NOT NULL,
          customer_email VARCHAR(255) NOT NULL,
          customer_phone VARCHAR(50) NOT NULL,
          trial_hours INTEGER NOT NULL,
          status VARCHAR(50) NOT NULL,
          email_sent INTEGER DEFAULT 0,
          email_error TEXT,
          created_at VARCHAR(255) NOT NULL,
          activated_at VARCHAR(255),
          expired_at VARCHAR(255)
        );`,

        `CREATE TABLE IF NOT EXISTS sent_emails (
          id VARCHAR(255) PRIMARY KEY,
          to_email VARCHAR(255) NOT NULL,
          subject VARCHAR(255) NOT NULL,
          customer_name VARCHAR(255),
          activation_link TEXT,
          status VARCHAR(50) NOT NULL,
          error_message TEXT,
          created_at VARCHAR(255) NOT NULL
        );`,

        `CREATE TABLE IF NOT EXISTS orders (
          order_id VARCHAR(255) PRIMARY KEY,
          order_code VARCHAR(100) UNIQUE NOT NULL,
          plan_id VARCHAR(255) NOT NULL,
          plan_name VARCHAR(255) NOT NULL,
          plan_days INTEGER NOT NULL,
          amount BIGINT NOT NULL,
          customer_name VARCHAR(255) NOT NULL,
          customer_email VARCHAR(255) NOT NULL,
          customer_phone VARCHAR(50) NOT NULL,
          note TEXT,
          status VARCHAR(50) NOT NULL,
          payment_content VARCHAR(255) NOT NULL,
          created_at VARCHAR(255) NOT NULL,
          paid_at VARCHAR(255),
          expired_at VARCHAR(255)
        );`,

        `CREATE TABLE IF NOT EXISTS payments (
          payment_id VARCHAR(255) PRIMARY KEY,
          order_code VARCHAR(100) NOT NULL,
          amount BIGINT NOT NULL,
          bank_brand_name VARCHAR(100),
          account_number VARCHAR(100),
          transaction_content TEXT,
          transaction_date VARCHAR(255),
          reference_code VARCHAR(255),
          created_at VARCHAR(255) NOT NULL
        );`,

        `CREATE TABLE IF NOT EXISTS subscriptions (
          id VARCHAR(255) PRIMARY KEY,
          customer_name VARCHAR(255) NOT NULL,
          customer_email VARCHAR(255) NOT NULL,
          customer_phone VARCHAR(50) NOT NULL,
          subscription_type VARCHAR(50) NOT NULL,
          plan_name VARCHAR(255),
          status VARCHAR(50) NOT NULL,
          started_at VARCHAR(255) NOT NULL,
          expired_at VARCHAR(255) NOT NULL,
          created_at VARCHAR(255) NOT NULL
        );`,

        `CREATE TABLE IF NOT EXISTS webhook_logs (
          id VARCHAR(255) PRIMARY KEY,
          received_at VARCHAR(255) NOT NULL,
          raw_payload TEXT,
          payment_content TEXT,
          amount BIGINT,
          detected_order_code VARCHAR(100),
          transaction_id VARCHAR(255) UNIQUE,
          result VARCHAR(100),
          error_message TEXT
        );`,

        `CREATE TABLE IF NOT EXISTS trial_logs (
          id VARCHAR(255) PRIMARY KEY,
          customer_name VARCHAR(255) NOT NULL,
          customer_email VARCHAR(255) NOT NULL,
          customer_phone VARCHAR(50) NOT NULL,
          device_id VARCHAR(255),
          ip_address VARCHAR(100),
          user_agent TEXT,
          status VARCHAR(50) NOT NULL,
          started_at VARCHAR(255) NOT NULL,
          expired_at VARCHAR(255) NOT NULL,
          created_at VARCHAR(255) NOT NULL
        );`
      ];

      for (const statement of tableStatements) {
        await sql.query(statement);
      }

      // 2. Safe Unique Indices & Column additions
      await sql.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_code ON orders (order_code);`
      );
      await sql.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_logs_transaction_id ON webhook_logs (transaction_id);`
      );

      await sql.query(
        `ALTER TABLE trial_settings ADD COLUMN IF NOT EXISTS app_redirect_url TEXT DEFAULT '';`
      );
      await sql.query(
        `ALTER TABLE webhook_logs ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(255);`
      );

      // 3. Seed Default Plan
      await sql.query(
        `INSERT INTO plans (id, name, description, price, days, is_active, is_featured, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING;`,
        [
          'lifetime',
          'Gói Vĩnh Viễn',
          'Sử dụng vĩnh viễn không giới hạn công nghệ tạo video AI, toàn bộ dàn ý kịch bản, âm thanh và bảng prompts chuẩn xác.',
          398000,
          36500,
          1,
          1,
          new Date().toISOString()
        ]
      );

      // 4. Seed Default SePay Settings
      await sql.query(
        `INSERT INTO sepay_settings (
          id, bank_name, bank_code, account_number, account_holder,
          api_key, webhook_secret, order_prefix, payment_content_template,
          webhook_url, is_active, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO NOTHING;`,
        [
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
        ]
      );

      // 5. Seed Default Trial Settings
      await sql.query(
        `INSERT INTO trial_settings (
          id, is_active, trial_hours, button_title, description, terms,
          app_redirect_url, max_per_email, max_per_phone, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO NOTHING;`,
        [
          'default',
          1,
          24,
          'Dùng thử miễn phí',
          'Trải nghiệm 24 giờ sử dụng trọn bộ tính năng tạo video AI, dàn ý timeline và bảng prompts đỉnh cao.',
          'Mỗi email và số điện thoại chỉ được tham gia dùng thử 1 lần.',
          '',
          1,
          1,
          new Date().toISOString()
        ]
      );

      // 6. Seed Default Email Settings
      await sql.query(
        `INSERT INTO email_settings (
          id, smtp_host, smtp_port, smtp_user, smtp_pass, from_name, from_email, is_active, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO NOTHING;`,
        [
          'default',
          process.env.SMTP_HOST || 'smtp.gmail.com',
          Number(process.env.SMTP_PORT || 587),
          process.env.SMTP_USER || '',
          process.env.SMTP_PASS || '',
          process.env.SMTP_FROM_NAME || 'AI Video Công Nghệ',
          process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@aivideo.vn',
          1,
          new Date().toISOString()
        ]
      );

      console.log('[Database] PostgreSQL database initialized successfully.');
    } catch (err: any) {
      console.error('[Database] Database initialization error:', err.message || err);
      // Reset initPromise on failure so future request can retry
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
}
