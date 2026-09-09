import { put, del, list } from '@vercel/blob';

// image/svg+xml se acepta porque las ilustraciones preseleccionables por cepa
// (generadas por la propia app, nunca contenido subido libremente por otro sitio)
// se suben por este mismo camino.
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

export function isAllowedImageMime(mimetype: string): boolean {
  return ALLOWED_MIME.includes(mimetype);
}

/**
 * Sube un buffer a Vercel Blob (plan Hobby: 1GB storage / 10GB transferencia
 * por mes, gratis, sin tarjeta) y devuelve la URL pública. `allowOverwrite`
 * permite resubir a la misma ruta (ej. la portada de una planta) sin que
 * tire error por path duplicado.
 */
export async function uploadImageBuffer(
  path: string,
  buffer: Buffer,
  mimetype: string
): Promise<{ url: string }> {
  const blob = await put(path, buffer, {
    access: 'public',
    contentType: mimetype,
    allowOverwrite: true,
  });
  return { url: blob.url };
}

export async function deleteBlobUrl(url: string): Promise<void> {
  try {
    await del(url);
  } catch {
    // URL ya borrada o no perteneciente a este store — no es motivo para fallar la request.
  }
}

export async function deleteBlobFolder(prefix: string): Promise<void> {
  const { blobs } = await list({ prefix });
  if (blobs.length) await del(blobs.map((b) => b.url));
}
