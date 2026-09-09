/**
 * One-off migration: stamps `etapaDesde` (fecha en la que la planta entró a
 * su etapa actual) en toda planta que no lo tenga, usando `fecha`
 * (germinación) o `creadoEn` como mejor aproximación disponible. Sin esto,
 * las plantas ya existentes no muestran estimado de floración hasta su
 * próximo cambio de etapa. Run once:
 *   npx tsx scripts/backfillEtapaDesde.ts
 */
import { db } from '../src/firebaseAdmin';

async function main() {
  const snap = await db.collection('plants').get();
  let updated = 0;
  const batch = db.batch();
  snap.forEach((doc) => {
    const data = doc.data();
    if (!data.etapaDesde) {
      const fallback = data.fecha || (data.creadoEn ? String(data.creadoEn).split('T')[0] : new Date().toISOString().split('T')[0]);
      batch.update(doc.ref, { etapaDesde: fallback });
      updated++;
    }
  });
  if (updated > 0) await batch.commit();
  console.log(`plants: ${updated} de ${snap.size} documentos actualizados con etapaDesde`);
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
