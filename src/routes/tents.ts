import { Router } from 'express';
import { db } from '../firebaseAdmin';
import { deleteCollection } from '../lib/deleteCollection';

const router = Router();

/**
 * GET /api/tents
 * Lista todas las carpas con sus plantas embebidas (las que ya están cargadas
 * en el sistema) y el último snapshot ambiental — así el dashboard puede
 * agrupar todo por carpa en una sola llamada.
 */
router.get('/', async (_req, res) => {
  const [tentsSnap, plantsSnap] = await Promise.all([
    db.collection('tents').orderBy('creadoEn', 'asc').get(),
    db.collection('plants').get(),
  ]);

  const plantsByTent = new Map<string, any[]>();
  plantsSnap.forEach((doc) => {
    const data = doc.data();
    const list = plantsByTent.get(data.tentId) || [];
    list.push({ id: doc.id, ...data });
    plantsByTent.set(data.tentId, list);
  });

  const tents = tentsSnap.docs.map((doc) => {
    const data = doc.data();
    return { id: doc.id, ...data, plants: plantsByTent.get(doc.id) || [] };
  });

  res.json(tents);
});

/** POST /api/tents — crea una carpa nueva. */
router.post('/', async (req, res) => {
  const { nombre, notas, dimensiones, tipoLuz, extraccion } = req.body || {};
  if (!nombre || typeof nombre !== 'string') {
    res.status(400).json({ error: 'nombre es requerido' });
    return;
  }
  const now = new Date().toISOString();
  const doc = {
    nombre,
    notas: notas || '',
    dimensiones: dimensiones || '',
    tipoLuz: tipoLuz || '',
    extraccion: extraccion || '',
    ambiente: null as null | Record<string, unknown>,
    creadoEn: now,
    actualizadoEn: now,
  };
  const ref = await db.collection('tents').add(doc);
  res.status(201).json({ id: ref.id, ...doc, plants: [] });
});

/** GET /api/tents/:id — detalle de una carpa: datos, plantas e historial ambiental. */
router.get('/:id', async (req, res) => {
  const tentDoc = await db.collection('tents').doc(req.params.id).get();
  if (!tentDoc.exists) {
    res.status(404).json({ error: 'Carpa no encontrada' });
    return;
  }
  const [plantsSnap, envSnap] = await Promise.all([
    db.collection('plants').where('tentId', '==', req.params.id).get(),
    db
      .collection('tents')
      .doc(req.params.id)
      .collection('environmentReadings')
      .orderBy('creadoEn', 'desc')
      .limit(30)
      .get(),
  ]);
  res.json({
    id: tentDoc.id,
    ...tentDoc.data(),
    plants: plantsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    environmentHistory: envSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  });
});

/** PUT /api/tents/:id — edita datos de la carpa (nombre, notas, dimensiones, etc). */
router.put('/:id', async (req, res) => {
  const ref = db.collection('tents').doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists) {
    res.status(404).json({ error: 'Carpa no encontrada' });
    return;
  }
  const { nombre, notas, dimensiones, tipoLuz, extraccion } = req.body || {};
  const update: Record<string, unknown> = { actualizadoEn: new Date().toISOString() };
  if (nombre !== undefined) update.nombre = nombre;
  if (notas !== undefined) update.notas = notas;
  if (dimensiones !== undefined) update.dimensiones = dimensiones;
  if (tipoLuz !== undefined) update.tipoLuz = tipoLuz;
  if (extraccion !== undefined) update.extraccion = extraccion;
  await ref.update(update);
  const updated = await ref.get();
  res.json({ id: updated.id, ...updated.data() });
});

/** DELETE /api/tents/:id — borra la carpa, desasigna sus plantas y borra su historial ambiental. */
router.delete('/:id', async (req, res) => {
  const ref = db.collection('tents').doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists) {
    res.status(404).json({ error: 'Carpa no encontrada' });
    return;
  }
  const plantsSnap = await db.collection('plants').where('tentId', '==', req.params.id).get();
  const batch = db.batch();
  plantsSnap.forEach((p) => batch.update(p.ref, { tentId: null }));
  await batch.commit();
  await deleteCollection(`tents/${req.params.id}/environmentReadings`);
  await ref.delete();
  res.status(204).send();
});

/**
 * POST /api/tents/:id/environment — carga una lectura ambiental (temperatura,
 * humedad, luz, CO2) para ESTA carpa y actualiza el snapshot "ambiente" que
 * se ve en el home. El ambiente ya no es global: es por carpa.
 */
router.post('/:id/environment', async (req, res) => {
  const tentRef = db.collection('tents').doc(req.params.id);
  const tentDoc = await tentRef.get();
  if (!tentDoc.exists) {
    res.status(404).json({ error: 'Carpa no encontrada' });
    return;
  }
  const { temp, humedad, luzHoras, luzIntensidad, co2, fuente } = req.body || {};
  const now = new Date().toISOString();
  const reading = {
    temp: temp ?? null,
    humedad: humedad ?? null,
    luzHoras: luzHoras ?? null,
    luzIntensidad: luzIntensidad ?? null,
    co2: co2 ?? null,
    fuente: fuente || 'Manual',
    creadoEn: now,
  };
  const readingRef = await tentRef.collection('environmentReadings').add(reading);
  await tentRef.update({ ambiente: reading, actualizadoEn: now });
  res.status(201).json({ id: readingRef.id, ...reading });
});

export default router;
