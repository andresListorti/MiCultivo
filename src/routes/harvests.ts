import { Router } from 'express';
import { db } from '../firebaseAdmin';
import { AuthedRequest } from '../middleware/auth';

const router = Router();

/** GET /api/harvests — lista las cosechas DEL USUARIO. Filtro opcional ?plantId=xxx */
router.get('/', async (req: AuthedRequest, res) => {
  let query: FirebaseFirestore.Query = db.collection('harvests').where('ownerId', '==', req.uid);
  if (req.query.plantId) {
    query = query.where('plantId', '==', req.query.plantId as string);
  }
  const snap = await query.get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
});

/** POST /api/harvests — cierra un ciclo / registra una cosecha para una planta propia. */
router.post('/', async (req: AuthedRequest, res) => {
  const { plantId, cepa, fecha, pesoHumedo, pesoSeco, curado, notas } = req.body || {};
  if (!plantId) {
    res.status(400).json({ error: 'plantId es requerido' });
    return;
  }
  const plantDoc = await db.collection('plants').doc(plantId).get();
  if (!plantDoc.exists || plantDoc.data()?.ownerId !== req.uid) {
    res.status(400).json({ error: 'La planta indicada no existe o no te pertenece' });
    return;
  }
  const doc = {
    plantId,
    ownerId: req.uid,
    cepa: cepa || '',
    fecha: fecha || new Date().toISOString().split('T')[0],
    pesoHumedo: pesoHumedo ?? null,
    pesoSeco: pesoSeco ?? null,
    curado: curado || 'En curado',
    notas: notas || '',
    creadoEn: new Date().toISOString(),
  };
  const ref = await db.collection('harvests').add(doc);
  res.status(201).json({ id: ref.id, ...doc });
});

router.put('/:id', async (req: AuthedRequest, res) => {
  const ref = db.collection('harvests').doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.ownerId !== req.uid) {
    res.status(404).json({ error: 'Cosecha no encontrada' });
    return;
  }
  const { cepa, fecha, pesoHumedo, pesoSeco, curado, notas } = req.body || {};
  const update: Record<string, unknown> = {};
  if (cepa !== undefined) update.cepa = cepa;
  if (fecha !== undefined) update.fecha = fecha;
  if (pesoHumedo !== undefined) update.pesoHumedo = pesoHumedo;
  if (pesoSeco !== undefined) update.pesoSeco = pesoSeco;
  if (curado !== undefined) update.curado = curado;
  if (notas !== undefined) update.notas = notas;
  await ref.update(update);
  const updated = await ref.get();
  res.json({ id: updated.id, ...updated.data() });
});

router.delete('/:id', async (req: AuthedRequest, res) => {
  const ref = db.collection('harvests').doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.ownerId !== req.uid) {
    res.status(404).json({ error: 'Cosecha no encontrada' });
    return;
  }
  await ref.delete();
  res.status(204).send();
});

export default router;
