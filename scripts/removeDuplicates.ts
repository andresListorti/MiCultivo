import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const serviceAccountPath = resolve(__dirname, '../firebase-service-account.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as any),
  projectId: 'mi-cultivo-app',
});

const db = admin.firestore();

async function removeDuplicates() {
  console.log('🔍 Buscando plantas duplicadas...');

  // Obtener todas las plantas
  const plantsSnap = await db.collection('plants').get();
  const plants = plantsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log(`📊 Total de plantas: ${plants.length}`);

  // Agrupar por (nombre, tentId, ownerId) para identificar duplicados
  const grouped = new Map<string, any[]>();
  plants.forEach(p => {
    const key = `${p.nombre}|${p.tentId}|${p.ownerId}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(p);
  });

  // Encontrar duplicados
  const duplicates: any[] = [];
  grouped.forEach((group, key) => {
    if (group.length > 1) {
      console.log(`⚠️  Duplicado encontrado: "${key}" (${group.length} plantas)`);
      group.forEach(p => console.log(`  - ID: ${p.id}, creadoEn: ${p.creadoEn}`));
      // Mantener el primero (por fecha de creación), eliminar el resto
      const sorted = group.sort((a, b) => (a.creadoEn || '').localeCompare(b.creadoEn || ''));
      duplicates.push(...sorted.slice(1)); // Todos excepto el primero
    }
  });

  if (duplicates.length === 0) {
    console.log('✅ No hay duplicados detectados.');
    return;
  }

  console.log(`\n🗑️  Eliminando ${duplicates.length} plantas duplicadas...\n`);

  // Eliminar duplicados
  for (const plant of duplicates) {
    try {
      // Primero, eliminar sus subcollections (waterings, photos)
      const wateringsSnap = await db.collection('plants').doc(plant.id).collection('waterings').get();
      for (const doc of wateringsSnap.docs) {
        await doc.ref.delete();
      }

      const photosSnap = await db.collection('plants').doc(plant.id).collection('photos').get();
      for (const doc of photosSnap.docs) {
        await doc.ref.delete();
      }

      // Luego, eliminar la planta
      await db.collection('plants').doc(plant.id).delete();
      console.log(`✅ Eliminada: ${plant.id} (${plant.nombre})`);
    } catch (err) {
      console.error(`❌ Error eliminando ${plant.id}:`, err);
    }
  }

  console.log(`\n✨ Proceso completado. Se eliminaron ${duplicates.length} plantas duplicadas.`);
  process.exit(0);
}

removeDuplicates().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
