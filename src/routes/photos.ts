import { Router, Request, Response } from 'express';
import { db } from '../firebaseAdmin';
import { upload, handleUploadErrors } from '../lib/upload';
import { deleteBlobUrl, isAllowedImageMime, uploadImageBuffer } from '../lib/storage';

const router = Router({ mergeParams: true });

/**
 * POST / (JSON, solo url) queda para scripts/seed y carga manual de URLs ya
 * alojadas en otro lado. POST /upload (multipart) es el flujo real: recibe
 * el archivo, lo sube a Vercel Blob server-side y guarda la URL resultante.
 */
router.get('/', async (req, res) => {
  const { plantId } = req.params as { plantId: string };
  const snap = await db.collection('plants').doc(plantId).collection('photos').orderBy('fecha', 'desc').get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
});

router.post('/', async (req, res) => {
  const { plantId } = req.params as { plantId: string };
  const plantDoc = await db.collection('plants').doc(plantId).get();
  if (!plantDoc.exists) {
    res.status(404).json({ error: 'Planta no encontrada' });
    return;
  }
  const { fecha, url, nota } = req.body || {};
  if (!url) {
    res.status(400).json({ error: 'url es requerida (subida a Storage se hace del lado del cliente)' });
    return;
  }
  const doc = {
    fecha: fecha || new Date().toISOString().split('T')[0],
    url,
    nota: nota || '',
    creadoEn: new Date().toISOString(),
  };
  const ref = await db.collection('plants').doc(plantId).collection('photos').add(doc);
  res.status(201).json({ id: ref.id, ...doc });
});

router.post('/upload', upload.single('foto'), handleUploadErrors, async (req: Request, res: Response) => {
  const { plantId } = req.params as { plantId: string };
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) {
    res.status(400).json({ error: 'foto es requerida' });
    return;
  }
  if (!isAllowedImageMime(file.mimetype)) {
    res.status(400).json({ error: 'Formato de imagen no soportado (usá jpg, png o webp)' });
    return;
  }
  const { fecha, nota } = req.body || {};
  const ref = db.collection('plants').doc(plantId).collection('photos').doc();
  const { url } = await uploadImageBuffer(`plants/${plantId}/photos/${ref.id}`, file.buffer, file.mimetype);
  const doc = {
    fecha: fecha || new Date().toISOString().split('T')[0],
    url,
    nota: nota || '',
    creadoEn: new Date().toISOString(),
  };
  await ref.set(doc);
  res.status(201).json({ id: ref.id, ...doc });
});

router.delete('/:photoId', async (req, res) => {
  const { plantId, photoId } = req.params as { plantId: string; photoId: string };
  const ref = db.collection('plants').doc(plantId).collection('photos').doc(photoId);
  const doc = await ref.get();
  const url = doc.data()?.url;
  if (url) await deleteBlobUrl(url);
  await ref.delete();
  res.status(204).send();
});

export default router;
