import { NextFunction, Request, Response } from 'express';
import { authAdmin } from '../firebaseAdmin';

export interface AuthedRequest extends Request {
  uid?: string;
  userEmail?: string | null;
}

/**
 * Exige un ID token válido de Firebase Auth (Authorization: Bearer <idToken>).
 * App de 2 usuarios (Nacho y Pochi): cualquier cuenta válida del proyecto tiene
 * acceso completo — no hay roles ni multi-tenancy, es un cultivo compartido.
 */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    res.status(401).json({ error: 'Falta el token de autenticación (Authorization: Bearer <idToken>)' });
    return;
  }
  try {
    const decoded = await authAdmin.verifyIdToken(match[1]);
    req.uid = decoded.uid;
    req.userEmail = decoded.email ?? null;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}
