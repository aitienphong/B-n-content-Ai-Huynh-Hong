import type { IncomingMessage, ServerResponse } from 'node:http';
import app from '../backend.js';

// Force rebuild: backend.ts now includes /api/external/provision (2026-11-14).
export default function handler(req: IncomingMessage, res: ServerResponse) {
  return (app as any)(req, res);
}
