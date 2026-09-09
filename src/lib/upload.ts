import multer from 'multer';
import { Request, Response, NextFunction } from 'express';

// Límite de 4MB: el body de la función de Vercel tiene un tope ~4.5MB,
// dejamos margen para el overhead del multipart.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
});

export function handleUploadErrors(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'La imagen no puede superar 4MB' });
      return;
    }
    res.status(400).json({ error: err.message });
    return;
  }
  next(err);
}
