import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';

let sqlClient: NeonQueryFunction<false, false> | null = null;
let initPromise: Promise<void> | null = null;

export function isRemoteDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL;
  return typeof url === 'string' && url.trim().length > 0;
}

export function isDatabaseConfigured(): boolean {
  // Always returns true because we have seamless local persistent store fallback
  return true;
}

// -------------------------------------------------------------
// LOCAL PERSISTENT DATABASE ENGINE (Used when DATABASE_URL is not set)
// -------------------------------------------------------------
interface LocalDatabase {
  plans: any[];
  sepay_settings: any[];
  trial_settings: any[];
  email_settings: any[];
  trial_tokens: any[];
  sent_emails: any[];
  orders: any[];
  payments: any[];
  subscriptions: any[];
  webhook_logs: any[];
  trial_logs: any[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE_PATH = path.join(DATA_DIR, 'app_database.json');

let localDb: LocalDatabase | null = null;

function getInitialDbState(): LocalDatabase {
  const now = new Date().toISOString();
  return {
    plans: [
      {
        id: 'lifetime',
        name: 'Gói Vĩnh Viễn',
        description:
          'Sử dụng vĩnh viễn không giới hạn công nghệ tạo video AI, toàn bộ dàn ý kịch bản, âm thanh và bảng prompts chuẩn xác.',
        price: 398000,
        days: 36500,
        is_active: 1,
        is_featured: 1,
        created_at: now
      }
    ],
    sepay_settings: [
      {
        id: 'default',
        bank_name: 'vpbank',
        bank_code: 'VPB',
        account_number: '0939969127',
        account_holder: 'HUYNH THI THU HONG',
        api_key: process.env.SEPAY_API_KEY || '',
        webhook_secret: process.env.SEPAY_WEBHOOK_SECRET || '',
        order_prefix: 'AFF',
        payment_content_template: '{order_code}',
        webhook_url: '/api/sepay-webhook',
        is_active: 1,
        updated_at: now
      }
    ],
    trial_settings: [
      {
        id: 'default',
        is_active: 1,
        trial_hours: 24,
        button_title: 'Dùng thử miễn phí',
        description:
          'Trải nghiệm 24 giờ sử dụng trọn bộ tính năng tạo video AI, dàn ý timeline và bảng prompts đỉnh cao.',
        terms: 'Mỗi email và số điện thoại chỉ được tham gia dùng thử 1 lần.',
        app_redirect_url: '',
        max_per_email: 1,
        max_per_phone: 1,
        updated_at: now
      }
    ],
    email_settings: [
      {
        id: 'default',
        smtp_host: process.env.SMTP_HOST || 'smtp.gmail.com',
        smtp_port: Number(process.env.SMTP_PORT || 587),
        smtp_user: process.env.SMTP_USER || '',
        smtp_pass: process.env.SMTP_PASS || '',
        from_name: process.env.SMTP_FROM_NAME || 'AI Video Công Nghệ',
        from_email: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@aivideo.vn',
        is_active: 1,
        updated_at: now
      }
    ],
    trial_tokens: [],
    sent_emails: [],
    orders: [],
    payments: [],
    subscriptions: [],
    webhook_logs: [],
    trial_logs: []
  };
}

function loadLocalDb(): LocalDatabase {
  if (localDb) return localDb;

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(DB_FILE_PATH)) {
      const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      const initial = getInitialDbState();

      localDb = {
        plans: Array.isArray(parsed.plans) && parsed.plans.length > 0 ? parsed.plans : initial.plans,
        sepay_settings:
          Array.isArray(parsed.sepay_settings) && parsed.sepay_settings.length > 0
            ? parsed.sepay_settings
            : initial.sepay_settings,
        trial_settings:
          Array.isArray(parsed.trial_settings) && parsed.trial_settings.length > 0
            ? parsed.trial_settings
            : initial.trial_settings,
        email_settings:
          Array.isArray(parsed.email_settings) && parsed.email_settings.length > 0
            ? parsed.email_settings
            : initial.email_settings,
        trial_tokens: Array.isArray(parsed.trial_tokens) ? parsed.trial_tokens : [],
        sent_emails: Array.isArray(parsed.sent_emails) ? parsed.sent_emails : [],
        orders: Array.isArray(parsed.orders) ? parsed.orders : [],
        payments: Array.isArray(parsed.payments) ? parsed.payments : [],
        subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
        webhook_logs: Array.isArray(parsed.webhook_logs) ? parsed.webhook_logs : [],
        trial_logs: Array.isArray(parsed.trial_logs) ? parsed.trial_logs : []
      };

      // Ensure default sepay_settings has VPBank
      const defaultSepay = localDb.sepay_settings.find((s) => s.id === 'default');
      if (
        defaultSepay &&
        (defaultSepay.bank_name === 'MBBank' ||
          defaultSepay.bank_name === 'MBBank (Ngân hàng Quân Đội)' ||
          !defaultSepay.bank_name)
      ) {
        defaultSepay.bank_name = 'vpbank';
        defaultSepay.bank_code = 'VPB';
        defaultSepay.account_number = '0939969127';
        defaultSepay.account_holder = 'HUYNH THI THU HONG';
        saveLocalDb();
      }
    } else {
      localDb = getInitialDbState();
      saveLocalDb();
    }
  } catch (err) {
    console.warn('[LocalDatabase] Error loading database file, initializing defaults:', err);
    localDb = getInitialDbState();
    saveLocalDb();
  }

  return localDb;
}

function saveLocalDb(): void {
  if (!localDb) return;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempPath = `${DB_FILE_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(localDb, null, 2), 'utf-8');
    fs.renameSync(tempPath, DB_FILE_PATH);
  } catch (err) {
    console.error('[LocalDatabase] Failed to persist database:', err);
  }
}

/**
 * Evaluates a simple WHERE clause against a row object.
 */
function evaluateRow(row: any, whereClause: string, params: any[]): boolean {
  if (!whereClause || !whereClause.trim()) return true;

  // Substitute parameter references like $1, $2 with sanitized literal placeholders
  let expr = whereClause.trim();

  // Normalize parenthesis and operators
  // Replace $1, $2, ...
  for (let i = params.length; i >= 1; i--) {
    const val = params[i - 1];
    const regex = new RegExp(`\\$${i}\\b`, 'g');
    if (val === null || val === undefined) {
      expr = expr.replace(regex, 'null');
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      expr = expr.replace(regex, String(val));
    } else {
      // String value
      const escaped = JSON.stringify(String(val));
      expr = expr.replace(regex, escaped);
    }
  }

  // Handle common single conditions:
  // e.g. "id = 'lifetime'", "order_code = 'AFF123'", "token = 'abc'", "is_active = 1"
  // Safe simple evaluator for SQL boolean condition
  try {
    // Replace SQL syntax with JS expressions
    let jsExpr = expr
      .replace(/<>/g, '!==')
      .replace(/IS NULL/gi, '=== null')
      .replace(/IS NOT NULL/gi, '!== null')
      .replace(/ AND /gi, ' && ')
      .replace(/ OR /gi, ' || ')
      .replace(/([^=!<])=([^=])/g, '$1===$2');

    // Replace column names with row['col']
    const knownCols = [
      'id',
      'order_code',
      'token',
      'is_active',
      'is_featured',
      'price',
      'days',
      'status',
      'subscription_type',
      'customer_email',
      'customer_phone',
      'customer_name',
      'plan_id',
      'bank_name',
      'transaction_id',
      'received_at',
      'created_at',
      'started_at',
      'expired_at',
      'paid_at'
    ];

    for (const col of knownCols) {
      // replace identifier surrounded by non-word/boundary chars
      const colRegex = new RegExp(`\\b${col}\\b`, 'g');
      jsExpr = jsExpr.replace(colRegex, `(row['${col}'] !== undefined ? row['${col}'] : null)`);
    }

    const fn = new Function('row', `try { return Boolean(${jsExpr}); } catch(e) { return false; }`);
    return fn(row);
  } catch (err) {
    console.warn('[LocalDatabase] WHERE evaluation error for:', whereClause, err);
    return false;
  }
}

/**
 * Local SQL interpreter to execute queries in absence of remote PostgreSQL.
 */
async function executeLocalQuery<T = any>(sqlText: string, params: any[] = []): Promise<T[]> {
  const db = loadLocalDb();
  const trimmed = sqlText.trim().replace(/;+$/, '');

  // 1. Health check or constant ping: SELECT 1 as ok
  if (/^SELECT\s+1\s*(as\s+ok)?/i.test(trimmed)) {
    return [{ ok: 1 }] as unknown as T[];
  }

  // 2. DDL statements: CREATE TABLE, ALTER TABLE, CREATE UNIQUE INDEX
  if (
    /^CREATE\s+TABLE/i.test(trimmed) ||
    /^ALTER\s+TABLE/i.test(trimmed) ||
    /^CREATE\s+(UNIQUE\s+)?INDEX/i.test(trimmed)
  ) {
    return [] as unknown as T[];
  }

  // 3. INSERT INTO
  const insertMatch = trimmed.match(
    /^INSERT\s+INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)(?:\s+ON\s+CONFLICT\s*\(([^)]+)\)\s*DO\s+NOTHING)?/i
  );
  if (insertMatch) {
    const tableName = insertMatch[1].toLowerCase() as keyof LocalDatabase;
    const cols = insertMatch[2].split(',').map((c) => c.trim().toLowerCase());
    const conflictCol = insertMatch[4] ? insertMatch[4].trim().toLowerCase() : null;

    if (!db[tableName]) {
      db[tableName] = [];
    }

    const newRow: any = {};
    for (let i = 0; i < cols.length; i++) {
      newRow[cols[i]] = params[i] !== undefined ? params[i] : null;
    }

    // Check conflict
    if (conflictCol && newRow[conflictCol] !== undefined) {
      const existing = db[tableName].find((r) => r[conflictCol] === newRow[conflictCol]);
      if (existing) {
        return [newRow] as unknown as T[];
      }
    }

    db[tableName].push(newRow);
    saveLocalDb();
    return [newRow] as unknown as T[];
  }

  // 4. UPDATE
  const updateMatch = trimmed.match(
    /^UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+([\s\S]+?)(?:\s+WHERE\s+([\s\S]+))?$/i
  );
  if (updateMatch) {
    const tableName = updateMatch[1].toLowerCase() as keyof LocalDatabase;
    const setClause = updateMatch[2];
    const whereClause = updateMatch[3] || '';

    if (!db[tableName]) {
      db[tableName] = [];
    }

    // Parse SET assignments: col = $1, col2 = $2, ...
    const assignments = setClause.split(/,(?![^(]*\))/).map((a) => a.trim());
    const updates: { col: string; valIndex: number | null; literalVal?: any }[] = [];

    for (const assignment of assignments) {
      const parts = assignment.split('=').map((p) => p.trim());
      const col = parts[0].toLowerCase();
      const valStr = parts[1];

      const paramMatch = valStr.match(/^\$(\d+)$/);
      if (paramMatch) {
        updates.push({ col, valIndex: Number(paramMatch[1]) - 1 });
      } else {
        // literal value
        const literal = valStr.replace(/^'|'$/g, '');
        updates.push({ col, valIndex: null, literalVal: literal });
      }
    }

    let modifiedCount = 0;
    for (const row of db[tableName]) {
      if (evaluateRow(row, whereClause, params)) {
        for (const u of updates) {
          if (u.valIndex !== null) {
            row[u.col] = params[u.valIndex];
          } else {
            row[u.col] = u.literalVal;
          }
        }
        modifiedCount++;
      }
    }

    if (modifiedCount > 0) {
      saveLocalDb();
    }
    return [] as unknown as T[];
  }

  // 5. DELETE FROM
  const deleteMatch = trimmed.match(/^DELETE\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+([\s\S]+))?$/i);
  if (deleteMatch) {
    const tableName = deleteMatch[1].toLowerCase() as keyof LocalDatabase;
    const whereClause = deleteMatch[2] || '';

    if (!db[tableName]) {
      return [] as unknown as T[];
    }

    if (!whereClause.trim()) {
      db[tableName] = [];
      saveLocalDb();
      return [] as unknown as T[];
    }

    const initialLen = db[tableName].length;
    db[tableName] = db[tableName].filter((row) => !evaluateRow(row, whereClause, params));
    if (db[tableName].length !== initialLen) {
      saveLocalDb();
    }
    return [] as unknown as T[];
  }

  // 6. SELECT
  const selectMatch = trimmed.match(
    /^SELECT\s+([\s\S]+?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+([\s\S]+?))?(?:\s+ORDER\s+BY\s+([a-zA-Z0-9_,\s]+))?(?:\s+LIMIT\s+(\d+))?$/i
  );
  if (selectMatch) {
    const fields = selectMatch[1].trim();
    const tableName = selectMatch[2].toLowerCase() as keyof LocalDatabase;
    const whereClause = selectMatch[3] || '';
    const orderByClause = selectMatch[4] || '';
    const limit = selectMatch[5] ? Number(selectMatch[5]) : null;

    const tableRows = db[tableName] || [];

    // Filter
    let filtered = tableRows.filter((row) => evaluateRow(row, whereClause, params));

    // Special count(*) handling
    if (/^COUNT\(\*\)(\s+as\s+([a-zA-Z0-9_]+))?/i.test(fields)) {
      const aliasMatch = fields.match(/^COUNT\(\*\)\s+as\s+([a-zA-Z0-9_]+)/i);
      const alias = aliasMatch ? aliasMatch[1] : 'count';
      return [{ [alias]: filtered.length }] as unknown as T[];
    }

    // Sort
    if (orderByClause) {
      const orderParts = orderByClause.trim().split(/\s+/);
      const sortCol = orderParts[0].toLowerCase();
      const isDesc = orderParts[1] && orderParts[1].toUpperCase() === 'DESC';

      filtered = [...filtered].sort((a, b) => {
        const valA = a[sortCol];
        const valB = b[sortCol];

        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;

        if (typeof valA === 'number' && typeof valB === 'number') {
          return isDesc ? valB - valA : valA - valB;
        }

        const comp = String(valA).localeCompare(String(valB));
        return isDesc ? -comp : comp;
      });
    }

    // Limit
    if (limit && limit > 0) {
      filtered = filtered.slice(0, limit);
    }

    // Projection
    if (fields === '*') {
      return filtered as unknown as T[];
    } else {
      const cols = fields.split(',').map((c) => c.trim().toLowerCase());
      return filtered.map((r) => {
        const proj: any = {};
        for (const col of cols) {
          proj[col] = r[col];
        }
        return proj;
      }) as unknown as T[];
    }
  }

  // Fallback for unparsed SELECT
  console.warn('[LocalDatabase] Unhandled query pattern:', sqlText);
  return [] as unknown as T[];
}

// -------------------------------------------------------------
// MAIN DATABASE EXPORTS
// -------------------------------------------------------------

export function getDb(): any {
  if (isRemoteDatabaseConfigured()) {
    const connectionString = process.env.DATABASE_URL!;
    if (!sqlClient) {
      sqlClient = neon(connectionString.trim());
    }
    return sqlClient;
  }

  // Return a mock neon function that routes through executeLocalQuery
  const mockNeon: any = async (sql: any, ...params: any[]) => {
    return executeLocalQuery(String(sql), params);
  };
  mockNeon.query = async (sql: string, params: any[] = []) => {
    return executeLocalQuery(sql, params);
  };
  return mockNeon;
}

/**
 * Execute a parameterized query with PostgreSQL $1, $2, ... placeholders.
 * Returns array of rows.
 */
export async function query<T = any>(sqlText: string, params: any[] = []): Promise<T[]> {
  if (isRemoteDatabaseConfigured()) {
    try {
      const sql = getDb();
      const rows = await sql.query(sqlText, params);
      return (rows as unknown as T[]) || [];
    } catch (err: any) {
      console.warn(
        '[Database] Remote PostgreSQL query failed, attempting local fallback:',
        err.message || err
      );
      return executeLocalQuery<T>(sqlText, params);
    }
  }

  return executeLocalQuery<T>(sqlText, params);
}

/**
 * Convenience helper to fetch a single row or null.
 */
export async function queryOne<T = any>(sqlText: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sqlText, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Initialize database tables, unique constraints, and initial seeds.
 * Safe to execute multiple times.
 */
export async function initDatabase(): Promise<void> {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      if (isRemoteDatabaseConfigured()) {
        const sql = getDb();

        // 1. Create Tables on PostgreSQL
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

        // 2. Indices
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
            'vpbank',
            'VPB',
            '0939969127',
            'HUYNH THI THU HONG',
            process.env.SEPAY_API_KEY || '',
            process.env.SEPAY_WEBHOOK_SECRET || '',
            'AFF',
            '{order_code}',
            '/api/sepay-webhook',
            1,
            new Date().toISOString()
          ]
        );

        // Ensure VPBank info
        await sql.query(
          `UPDATE sepay_settings 
           SET bank_name = 'vpbank', bank_code = 'VPB', account_number = '0939969127', account_holder = 'HUYNH THI THU HONG'
           WHERE id = 'default' AND (bank_name = 'MBBank (Ngân hàng Quân Đội)' OR bank_name = 'MBBank' OR bank_name = '' OR bank_name IS NULL);`
        );

        // 5. Seed Trial Settings
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

        // 6. Seed Email Settings
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

        console.log('[Database] Remote PostgreSQL database initialized successfully.');
      } else {
        // Initialize local persistent store
        loadLocalDb();
        console.log('[Database] Local persistent database initialized successfully (Storage: data/app_database.json).');
      }
    } catch (err: any) {
      console.warn(
        '[Database] Remote DB init failed or unavailable, using local database store:',
        err.message || err
      );
      loadLocalDb();
    }
  })();

  return initPromise;
}
