import { Router } from 'express';
import { db } from '../firebaseAdmin';
import { deleteCollection } from '../lib/deleteCollection';
import { AuthedRequest } from '../middleware/auth';

const router = Router();

const LUZ_PRESETS: Record<string, number> = { '18/6': 18, '12/12': 12, '20/4': 20, '24/0': 24 };

/** Valida el body crudo de luzSchedule. Devuelve un mensaje de error, o null si está OK. */
function validateLuzSchedule(luzSchedule: any): string | null {
  if (luzSchedule === null || luzSchedule === undefined) return null;
  if (typeof luzSchedule !== 'object') return 'luzSchedule inválido';
  const { preset, horasEncendido } = luzSchedule;
  if (!preset || (!LUZ_PRESETS[preset] && preset !== 'personalizado')) {
    return `preset de luz inválido, debe ser una de: ${Object.keys(LUZ_PRESETS).join(', ')}, personalizado`;
  }
  const horas = preset === 'personalizado' ? horasEncendido : LUZ_PRESETS[preset];
  if (typeof horas !== 'number' || horas < 1 || horas > 24) {
    return 'horasEncendido debe ser un número entre 1 y 24';
  }
  if (horas < 24 && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(luzSchedule.horaInicio || '')) {
    return 'horaInicio debe tener formato HH:MM (24hs)';
  }
  return null;
}

/** Normaliza luzSchedule para guardar: calcula horasEncendido a partir del preset salvo 'personalizado'. */
function normalizeLuzSchedule(luzSchedule: any): { preset: string; horasEncendido: number; horaInicio: string | null } | null {
  if (!luzSchedule) return null;
  const horas = luzSchedule.preset === 'personalizado' ? luzSchedule.horasEncendido : LUZ_PRESETS[luzSchedule.preset];
  return { preset: luzSchedule.preset, horasEncendido: horas, horaInicio: horas < 24 ? luzSchedule.horaInicio : null };
}

/**
 * GET /api/tents
 * Lista las carpas DEL USUARIO AUTENTICADO (ownerId === req.uid), con sus
 * plantas embebidas y el último snapshot ambiental — así el dashboard puede
 * agrupar todo por carpa en una sola llamada. Cada usuario ve solo lo suyo.
 */
router.get('/', async (req: AuthedRequest, res) => {
  const [tentsSnap, plantsSnap] = await Promise.all([
    db.collection('tents').where('ownerId', '==', req.uid).get(),
    db.collection('plants').where('ownerId', '==', req.uid).get(),
  ]);

  const plantsByTent = new Map<string | null, any[]>();
  plantsSnap.forEach((doc) => {
    const data = doc.data();
    const list = plantsByTent.get(data.tentId) || [];
    list.push({ id: doc.id, ...data });
    plantsByTent.set(data.tentId, list);
  });

  const tents: any[] = tentsSnap.docs
    .map((doc) => {
      const data = doc.data();
      return { id: doc.id, ...data, plants: plantsByTent.get(doc.id) || [] };
    })
    .sort((a: any, b: any) => (a.creadoEn || '').localeCompare(b.creadoEn || ''));

  const orphanedPlants = plantsByTent.get(null) || [];
  if (orphanedPlants.length > 0) {
    tents.push({
      id: '__unassigned__',
      nombre: 'Sin carpa asignada',
      ownerId: req.uid,
      notas: '',
      dimensiones: '',
      tipoLuz: '',
      extraccion: '',
      luzSchedule: null,
      ambiente: null,
      creadoEn: '',
      actualizadoEn: '',
      plants: orphanedPlants,
    });
  }

  res.json(tents);
});

/** POST /api/tents — crea una carpa nueva, propiedad del usuario autenticado. */
router.post('/', async (req: AuthedRequest, res) => {
  const { nombre, notas, dimensiones, tipoLuz, extraccion, luzSchedule } = req.body || {};
  if (!nombre || typeof nombre !== 'string') {
    res.status(400).json({ error: 'nombre es requerido' });
    return;
  }
  const luzError = validateLuzSchedule(luzSchedule);
  if (luzError) {
    res.status(400).json({ error: luzError });
    return;
  }
  const now = new Date().toISOString();
  const doc = {
    nombre,
    ownerId: req.uid,
    notas: notas || '',
    dimensiones: dimensiones || '',
    tipoLuz: tipoLuz || '',
    extraccion: extraccion || '',
    luzSchedule: normalizeLuzSchedule(luzSchedule),
    ambiente: null as null | Record<string, unknown>,
    creadoEn: now,
    actualizadoEn: now,
  };
  const ref = await db.collection('tents').add(doc);
  res.status(201).json({ id: ref.id, ...doc, plants: [] });
});

/** GET /api/tents/:id — detalle de una carpa propia: datos, plantas e historial ambiental. */
router.get('/:id', async (req: AuthedRequest, res) => {
  const tentDoc = await db.collection('tents').doc(req.params.id).get();
  if (!tentDoc.exists || tentDoc.data()?.ownerId !== req.uid) {
    res.status(404).json({ error: 'Carpa no encontrada' });
    return;
  }
  const [plantsSnap, envSnap] = await Promise.all([
    db.collection('plants').where('tentId', '==', req.params.id).where('ownerId', '==', req.uid).get(),
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

/** PUT /api/tents/:id — edita datos de una carpa propia (nombre, notas, dimensiones, etc). */
router.put('/:id', async (req: AuthedRequest, res) => {
  const ref = db.collection('tents').doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.ownerId !== req.uid) {
    res.status(404).json({ error: 'Carpa no encontrada' });
    return;
  }
  const { nombre, notas, dimensiones, tipoLuz, extraccion, luzSchedule } = req.body || {};
  const luzError = luzSchedule !== undefined ? validateLuzSchedule(luzSchedule) : null;
  if (luzError) {
    res.status(400).json({ error: luzError });
    return;
  }
  const update: Record<string, unknown> = { actualizadoEn: new Date().toISOString() };
  if (nombre !== undefined) update.nombre = nombre;
  if (notas !== undefined) update.notas = notas;
  if (dimensiones !== undefined) update.dimensiones = dimensiones;
  if (tipoLuz !== undefined) update.tipoLuz = tipoLuz;
  if (extraccion !== undefined) update.extraccion = extraccion;
  if (luzSchedule !== undefined) update.luzSchedule = normalizeLuzSchedule(luzSchedule);
  await ref.update(update);
  const updated = await ref.get();
  res.json({ id: updated.id, ...updated.data() });
});

/** DELETE /api/tents/:id — borra la carpa, desasigna sus plantas y borra su historial ambiental. */
router.delete('/:id', async (req: AuthedRequest, res) => {
  const ref = db.collection('tents').doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.ownerId !== req.uid) {
    res.status(404).json({ error: 'Carpa no encontrada' });
    return;
  }
  const plantsSnap = await db.collection('plants').where('tentId', '==', req.params.id).where('ownerId', '==', req.uid).get();
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
router.post('/:id/environment', async (req: AuthedRequest, res) => {
  const tentRef = db.collection('tents').doc(req.params.id);
  const tentDoc = await tentRef.get();
  if (!tentDoc.exists || tentDoc.data()?.ownerId !== req.uid) {
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
