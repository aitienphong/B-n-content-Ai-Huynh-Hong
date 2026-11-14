import type { IncomingMessage, ServerResponse } from 'node:http';
import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');
  const send = (code: number, obj: any) => { res.statusCode = code; res.end(JSON.stringify(obj)); };
  try {
    if (req.method !== 'POST') return send(405, { error: 'Method not allowed.' });
    const secret = (process.env.U48_PROVISION_SECRET || '').trim();
    if (secret.length < 32) return send(503, { error: 'U48_PROVISION_SECRET chưa được cấu hình.' });
    const timestamp = String((req.headers['x-u48-timestamp'] as string) || '');
    const supplied = String((req.headers['x-u48-signature'] as string) || '');
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts * 1000) > 300000) return send(401, { error: 'Yêu cầu đã hết hạn.' });
    const rawBody = await readBody(req);
    const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
    const a = Buffer.from(supplied);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return send(401, { error: 'Chữ ký không hợp lệ.' });
    const body = JSON.parse(rawBody || '{}');
    const orderCode = String(body.order_id || '').trim();
    const customerName = String(body.customer_name || '').trim();
    const customerEmail = String(body.email || '').trim().toLowerCase();
    const customerPhone = String(body.phone || '').trim();
    if (!orderCode || !customerName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) return send(400, { error: 'Thiếu mã đơn, họ tên hoặc email hợp lệ.' });
    const dbUrl = (process.env.DATABASE_URL || '').trim();
    if (!dbUrl) return send(503, { error: 'DATABASE_URL chưa được cấu hình.' });
    const sql = neon(dbUrl);
    const now = new Date();
    const startedAt = now.toISOString();
    const expiredAt = new Date(now.getTime() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString();
    const existing = await sql.query(
      'SELECT * FROM subscriptions WHERE customer_email = $1 ORDER BY created_at DESC LIMIT 1',
      [customerEmail]
    );
    let subscriptionId: string;
    if (existing && existing.length > 0) {
      await sql.query(
        "UPDATE subscriptions SET subscription_type = 'paid', plan_name = $1, status = 'active', started_at = $2, expired_at = $3 WHERE id = $4",
        ['Gói Vĩnh Viễn', startedAt, expiredAt, existing[0].id]
      );
      subscriptionId = existing[0].id;
    } else {
      subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await sql.query(
        'INSERT INTO subscriptions (id, customer_name, customer_email, customer_phone, subscription_type, plan_name, status, started_at, expired_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [subscriptionId, customerName, customerEmail, customerPhone, 'paid', 'Gói Vĩnh Viễn', 'active', startedAt, expiredAt, startedAt]
      );
    }
    const baseUrl = (process.env.APP_URL || 'https://bancontent.u48mmo.com').replace(/\/$/, '');
    const activationUrl = `${baseUrl}/?email=${encodeURIComponent(customerEmail)}`;
    return send(200, { success: true, subscription_id: subscriptionId, activation_url: activationUrl });
  } catch (error: any) {
    console.error('[External provision]', error);
    return send(500, { error: 'Không thể cấp quyền Tool AI.' });
  }
}
