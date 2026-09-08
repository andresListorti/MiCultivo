import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../src/app';

// Vercel manda cualquier request bajo /api/* acá; Express se encarga del
// ruteo interno (tal cual pidió el usuario: backend Node + Express + TS).
export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req as any, res as any);
}
