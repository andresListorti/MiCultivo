import { Router } from 'express';
import { db } from '../firebaseAdmin';

const router = Router({ mergeParams: true });

/**
 * MVP: guarda metadata de la foto (fecha, url, nota). La URL se sube desde el
 * cliente directamente a Firebase Storage (o cualquier storage) y acá solo se
 * referencia — subir el archivo en sí queda pendiente para una próxima vuelta.
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

router.delete('/:photoId', async (req, res) => {
  const { plantId, photoId } = req.params as { plantId: string; photoId: string };
  await db.collection('plants').doc(plantId).collection('photos').doc(photoId).delete();
  res.status(204).send();
});

export default router;
