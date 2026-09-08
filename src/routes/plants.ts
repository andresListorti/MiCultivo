import { Router } from 'express';
import { db } from '../firebaseAdmin';
import { deleteCollection } from '../lib/deleteCollection';
import wateringsRouter from './waterings';
import photosRouter from './photos';

const router = Router();

const ETAPAS = ['Enraizado', 'Vegetativo', 'Floración', 'Secado', 'Curado'];

/** GET /api/plants — lista todas las plantas. Filtro opcional ?tentId=xxx */
router.get('/', async (req, res) => {
  let query: FirebaseFirestore.Query = db.collection('plants');
  if (req.query.tentId) {
    query = query.where('tentId', '==', req.query.tentId as string);
  }
  const snap = await query.get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
});

/** POST /api/plants — crea una planta (opcionalmente ya asignada a una carpa). */
router.post('/', async (req, res) => {
  const { nombre, genetica, tentId, fecha, etapa, notas } = req.body || {};
  if (!nombre || typeof nombre !== 'string') {
    res.status(400).json({ error: 'nombre es requerido' });
    return;
  }
  if (etapa && !ETAPAS.includes(etapa)) {
    res.status(400).json({ error: `etapa inválida, debe ser una de: ${ETAPAS.join(', ')}` });
    return;
  }
  const now = new Date().toISOString();
  const doc = {
    nombre,
    genetica: genetica || '',
    tentId: tentId || null,
    fecha: fecha || now.split('T')[0],
    etapa: etapa || 'Enraizado',
    notas: notas || '',
    creadoEn: now,
    actualizadoEn: now,
  };
  const ref = await db.collection('plants').add(doc);
  res.status(201).json({ id: ref.id, ...doc });
});

/** GET /api/plants/:id — detalle con riegos, fotos y cosecha si la tiene. */
router.get('/:id', async (req, res) => {
  const doc = await db.collection('plants').doc(req.params.id).get();
  if (!doc.exists) {
    res.status(404).json({ error: 'Planta no encontrada' });
    return;
  }
  const [wateringsSnap, photosSnap, harvestsSnap] = await Promise.all([
    db.collection('plants').doc(req.params.id).collection('waterings').orderBy('fecha', 'desc').get(),
    db.collection('plants').doc(req.params.id).collection('photos').orderBy('fecha', 'desc').get(),
    db.collection('harvests').where('plantId', '==', req.params.id).get(),
  ]);
  res.json({
    id: doc.id,
    ...doc.data(),
    waterings: wateringsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    photos: photosSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    harvests: harvestsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  });
});

/**
 * PUT /api/plants/:id — edita cualquier campo de la planta, incluyendo
 * `tentId` para MOVERLA de una carpa a otra. Esto es lo único que hace
 * falta para reasignar carpa: el modal de edición manda el nuevo tentId acá.
 */
router.put('/:id', async (req, res) => {
  const ref = db.collection('plants').doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists) {
    res.status(404).json({ error: 'Planta no encontrada' });
    return;
  }
  const { nombre, genetica, tentId, fecha, etapa, notas } = req.body || {};
  if (etapa && !ETAPAS.includes(etapa)) {
    res.status(400).json({ error: `etapa inválida, debe ser una de: ${ETAPAS.join(', ')}` });
    return;
  }
  const update: Record<string, unknown> = { actualizadoEn: new Date().toISOString() };
  if (nombre !== undefined) update.nombre = nombre;
  if (genetica !== undefined) update.genetica = genetica;
  if (tentId !== undefined) update.tentId = tentId || null; // reasignación de carpa
  if (fecha !== undefined) update.fecha = fecha;
  if (etapa !== undefined) update.etapa = etapa;
  if (notas !== undefined) update.notas = notas;
  await ref.update(update);
  const updated = await ref.get();
  res.json({ id: updated.id, ...updated.data() });
});

/** DELETE /api/plants/:id — borra la planta y en cascada sus riegos y fotos. */
router.delete('/:id', async (req, res) => {
  const ref = db.collection('plants').doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists) {
    res.status(404).json({ error: 'Planta no encontrada' });
    return;
  }
  await deleteCollection(`plants/${req.params.id}/waterings`);
  await deleteCollection(`plants/${req.params.id}/photos`);
  await ref.delete();
  res.status(204).send();
});

// Subrutas anidadas: /api/plants/:plantId/waterings, /api/plants/:plantId/photos
router.use('/:plantId/waterings', wateringsRouter);
router.use('/:plantId/photos', photosRouter);

export default router;
