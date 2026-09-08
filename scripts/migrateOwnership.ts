/**
 * One-off migration: stamps `ownerId` on every existing tents/plants/harvests
 * document that doesn't have one yet, so old data doesn't just disappear once
 * the API starts filtering by ownerId. All pre-existing data (seed data +
 * whatever was created while testing, under either account) goes to Nacho —
 * it's all test/demo content, not real grow records. Run once:
 *   npx tsx scripts/migrateOwnership.ts
 */
import { db } from '../src/firebaseAdmin';

const DEFAULT_OWNER_UID = '7o2yLr1znGMrU9x1fPSDcvoRh4v1'; // nacho@micultivo.app

async function migrateCollection(name: string) {
  const snap = await db.collection(name).get();
  let updated = 0;
  const batch = db.batch();
  snap.forEach((doc) => {
    if (!doc.data().ownerId) {
      batch.update(doc.ref, { ownerId: DEFAULT_OWNER_UID });
      updated++;
    }
  });
  if (updated > 0) await batch.commit();
  console.log(`${name}: ${updated} de ${snap.size} documentos actualizados con ownerId`);
}

async function main() {
  await migrateCollection('tents');
  await migrateCollection('plants');
  await migrateCollection('harvests');
  console.log('Migración completa.');
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
