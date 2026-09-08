import { Router } from 'express';
import { db } from '../firebaseAdmin';

// mergeParams para poder leer :plantId del router padre (montado en /api/plants/:plantId/waterings)
const router = Router({ mergeParams: true });

router.get('/', async (req, res) => {
  const { plantId } = req.params as { plantId: string };
  const snap = await db.collection('plants').doc(plantId).collection('waterings').orderBy('fecha', 'desc').get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
});

router.post('/', async (req, res) => {
  const { plantId } = req.params as { plantId: string };
  const plantDoc = await db.collection('plants').doc(plantId).get();
  if (!plantDoc.exists) {
    res.status(404).json({ error: 'Planta no encontrada' });
    return;
  }
  const { fecha, cantidad, producto, ph, ec } = req.body || {};
  const doc = {
    fecha: fecha || new Date().toISOString().split('T')[0],
    cantidad: cantidad || '',
    producto: producto || '',
    ph: ph || '',
    ec: ec || '',
    creadoEn: new Date().toISOString(),
  };
  const ref = await db.collection('plants').doc(plantId).collection('waterings').add(doc);
  res.status(201).json({ id: ref.id, ...doc });
});

router.put('/:wateringId', async (req, res) => {
  const { plantId, wateringId } = req.params as { plantId: string; wateringId: string };
  const ref = db.collection('plants').doc(plantId).collection('waterings').doc(wateringId);
  const doc = await ref.get();
  if (!doc.exists) {
    res.status(404).json({ error: 'Riego no encontrado' });
    return;
  }
  const { fecha, cantidad, producto, ph, ec } = req.body || {};
  const update: Record<string, unknown> = {};
  if (fecha !== undefined) update.fecha = fecha;
  if (cantidad !== undefined) update.cantidad = cantidad;
  if (producto !== undefined) update.producto = producto;
  if (ph !== undefined) update.ph = ph;
  if (ec !== undefined) update.ec = ec;
  await ref.update(update);
  const updated = await ref.get();
  res.json({ id: updated.id, ...updated.data() });
});

router.delete('/:wateringId', async (req, res) => {
  const { plantId, wateringId } = req.params as { plantId: string; wateringId: string };
  await db.collection('plants').doc(plantId).collection('waterings').doc(wateringId).delete();
  res.status(204).send();
});

export default router;
