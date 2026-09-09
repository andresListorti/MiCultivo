import { Router, Response } from 'express';
import { db } from '../firebaseAdmin';
import { deleteCollection } from '../lib/deleteCollection';
import { AuthedRequest } from '../middleware/auth';
import wateringsRouter from './waterings';
import photosRouter from './photos';
import { upload, handleUploadErrors } from '../lib/upload';
import { deleteBlobFolder, deleteBlobUrl, isAllowedImageMime, uploadImageBuffer } from '../lib/storage';

const router = Router();

const ETAPAS = ['Enraizado', 'Vegetativo', 'Floración', 'Secado', 'Curado'];

/** GET /api/plants — lista las plantas DEL USUARIO. Filtro opcional ?tentId=xxx */
router.get('/', async (req: AuthedRequest, res) => {
  let query: FirebaseFirestore.Query = db.collection('plants').where('ownerId', '==', req.uid);
  if (req.query.tentId) {
    query = query.where('tentId', '==', req.query.tentId as string);
  }
  const snap = await query.get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
});

/** POST /api/plants — crea una planta propia (opcionalmente ya asignada a una carpa propia). */
router.post('/', async (req: AuthedRequest, res) => {
  const { nombre, genetica, tentId, fecha, etapa, notas } = req.body || {};
  if (!nombre || typeof nombre !== 'string') {
    res.status(400).json({ error: 'nombre es requerido' });
    return;
  }
  if (etapa && !ETAPAS.includes(etapa)) {
    res.status(400).json({ error: `etapa inválida, debe ser una de: ${ETAPAS.join(', ')}` });
    return;
  }
  if (tentId) {
    const tentDoc = await db.collection('tents').doc(tentId).get();
    if (!tentDoc.exists || tentDoc.data()?.ownerId !== req.uid) {
      res.status(400).json({ error: 'La carpa indicada no existe o no te pertenece' });
      return;
    }
  }
  const now = new Date().toISOString();
  const doc = {
    nombre,
    ownerId: req.uid,
    genetica: genetica || '',
    tentId: tentId || null,
    fecha: fecha || now.split('T')[0],
    etapa: etapa || 'Enraizado',
    etapaDesde: now.split('T')[0],
    fotoUrl: null,
    notas: notas || '',
    creadoEn: now,
    actualizadoEn: now,
    // Rangos de fechas por etapa (nuevo)
    etapas: {
      Enraizado: { desde: null, hasta: null },
      Vegetativo: { desde: null, hasta: null },
      Floración: { desde: null, hasta: null },
      Secado: { desde: null, hasta: null },
      Curado: { desde: null, hasta: null },
    },
    // Notificaciones (nuevo)
    notificaciones: {
      habilitadas: false,
      tiposEventos: ['riego', 'cambioEtapa'],
      plataformas: ['web'], // web, mobile, desktop
    },
  };
  const ref = await db.collection('plants').add(doc);
  res.status(201).json({ id: ref.id, ...doc });
});

/** GET /api/plants/:id — detalle con riegos, fotos y cosecha si la tiene (solo si es propia). */
router.get('/:id', async (req: AuthedRequest, res) => {
  const doc = await db.collection('plants').doc(req.params.id).get();
  if (!doc.exists || doc.data()?.ownerId !== req.uid) {
    res.status(404).json({ error: 'Planta no encontrada' });
    return;
  }
  const [wateringsSnap, photosSnap, harvestsSnap] = await Promise.all([
    db.collection('plants').doc(req.params.id).collection('waterings').orderBy('fecha', 'desc').get(),
    db.collection('plants').doc(req.params.id).collection('photos').orderBy('fecha', 'desc').get(),
    db.collection('harvests').where('plantId', '==', req.params.id).where('ownerId', '==', req.uid).get(),
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
 * PUT /api/plants/:id — edita cualquier campo de una planta propia, incluyendo
 * `tentId` para MOVERLA de una carpa a otra (la carpa destino también debe
 * ser propia).
 */
router.put('/:id', async (req: AuthedRequest, res) => {
  const ref = db.collection('plants').doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.ownerId !== req.uid) {
    res.status(404).json({ error: 'Planta no encontrada' });
    return;
  }
  const { nombre, genetica, tentId, fecha, etapa, notas, etapas, notificaciones } = req.body || {};
  if (etapa && !ETAPAS.includes(etapa)) {
    res.status(400).json({ error: `etapa inválida, debe ser una de: ${ETAPAS.join(', ')}` });
    return;
  }
  if (tentId) {
    const tentDoc = await db.collection('tents').doc(tentId).get();
    if (!tentDoc.exists || tentDoc.data()?.ownerId !== req.uid) {
      res.status(400).json({ error: 'La carpa indicada no existe o no te pertenece' });
      return;
    }
  }
  // Validar rangos de fechas por etapa
  if (etapas) {
    for (const etapaName of ETAPAS) {
      const rango = etapas[etapaName];
      if (rango && rango.desde && rango.hasta) {
        if (new Date(rango.desde) > new Date(rango.hasta)) {
          res.status(400).json({ error: `Rango de fechas inválido en etapa ${etapaName}: la fecha "desde" debe ser anterior a "hasta"` });
          return;
        }
      }
    }
  }
  const update: Record<string, unknown> = { actualizadoEn: new Date().toISOString() };
  if (nombre !== undefined) update.nombre = nombre;
  if (genetica !== undefined) update.genetica = genetica;
  if (tentId !== undefined) update.tentId = tentId || null; // reasignación de carpa
  if (fecha !== undefined) update.fecha = fecha;
  if (etapa !== undefined) {
    update.etapa = etapa;
    if (etapa !== doc.data()!.etapa) update.etapaDesde = new Date().toISOString().split('T')[0];
  }
  if (notas !== undefined) update.notas = notas;
  if (etapas !== undefined) update.etapas = etapas;
  if (notificaciones !== undefined) update.notificaciones = notificaciones;
  await ref.update(update);
  const updated = await ref.get();
  res.json({ id: updated.id, ...updated.data() });
});

/** POST /api/plants/:id/photo — sube/reemplaza la foto de portada de una planta propia. */
router.post('/:id/photo', upload.single('foto'), handleUploadErrors, async (req: AuthedRequest, res: Response) => {
  const ref = db.collection('plants').doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.ownerId !== req.uid) {
    res.status(404).json({ error: 'Planta no encontrada' });
    return;
  }
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) {
    res.status(400).json({ error: 'foto es requerida' });
    return;
  }
  if (!isAllowedImageMime(file.mimetype)) {
    res.status(400).json({ error: 'Formato de imagen no soportado (usá jpg, png o webp)' });
    return;
  }
  const { url } = await uploadImageBuffer(`plants/${req.params.id}/cover`, file.buffer, file.mimetype);
  await ref.update({ fotoUrl: url, actualizadoEn: new Date().toISOString() });
  const updated = await ref.get();
  res.json({ id: updated.id, ...updated.data() });
});

/** DELETE /api/plants/:id/photo — borra la foto de portada de una planta propia. */
router.delete('/:id/photo', async (req: AuthedRequest, res: Response) => {
  const ref = db.collection('plants').doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.ownerId !== req.uid) {
    res.status(404).json({ error: 'Planta no encontrada' });
    return;
  }
  const fotoUrl = doc.data()?.fotoUrl;
  if (fotoUrl) await deleteBlobUrl(fotoUrl);
  await ref.update({ fotoUrl: null, actualizadoEn: new Date().toISOString() });
  const updated = await ref.get();
  res.json({ id: updated.id, ...updated.data() });
});

/** DELETE /api/plants/:id — borra una planta propia y en cascada sus riegos y fotos. */
router.delete('/:id', async (req: AuthedRequest, res) => {
  const ref = db.collection('plants').doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.ownerId !== req.uid) {
    res.status(404).json({ error: 'Planta no encontrada' });
    return;
  }
  await deleteCollection(`plants/${req.params.id}/waterings`);
  await deleteCollection(`plants/${req.params.id}/photos`);
  await deleteBlobFolder(`plants/${req.params.id}/`);
  await ref.delete();
  res.status(204).send();
});

/** Exige que :plantId exista y pertenezca al usuario autenticado antes de tocar sus riegos/fotos. */
async function requirePlantOwnership(req: AuthedRequest, res: import('express').Response, next: import('express').NextFunction) {
  const doc = await db.collection('plants').doc(req.params.plantId).get();
  if (!doc.exists || doc.data()?.ownerId !== req.uid) {
    res.status(404).json({ error: 'Planta no encontrada' });
    return;
  }
  next();
}

// Subrutas anidadas: /api/plants/:plantId/waterings, /api/plants/:plantId/photos
router.use('/:plantId/waterings', requirePlantOwnership, wateringsRouter);
router.use('/:plantId/photos', requirePlantOwnership, photosRouter);

export default router;
