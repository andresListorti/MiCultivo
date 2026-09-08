/**
 * Carga datos de ejemplo (las mismas 2 carpas y 5 plantas del diseño v2) para
 * no arrancar con la app vacía. Se puede correr una sola vez.
 *   npm run seed
 */
import { db } from '../src/firebaseAdmin';

async function main() {
  const now = new Date().toISOString();

  const tentPrincipal = await db.collection('tents').add({
    nombre: 'Carpa Principal',
    notas: '',
    dimensiones: '100x100x200cm',
    tipoLuz: 'LED 320W',
    extraccion: 'Extractor 4"',
    ambiente: { temp: 24, humedad: 55, luzHoras: 18, luzIntensidad: 'LED 320W', co2: 800, fuente: 'Manual', creadoEn: now },
    creadoEn: now,
    actualizadoEn: now,
  });
  const tentSecado = await db.collection('tents').add({
    nombre: 'Zona de Secado y Curado',
    notas: '',
    dimensiones: '',
    tipoLuz: '',
    extraccion: '',
    ambiente: { temp: 18, humedad: 55, luzHoras: null, luzIntensidad: '', co2: null, fuente: 'Manual', creadoEn: now },
    creadoEn: now,
    actualizadoEn: now,
  });

  const plants = [
    { nombre: 'Northern Lights #1', genetica: 'Northern Lights (Índica)', fecha: '2026-06-01', etapa: 'Floración', tentId: tentPrincipal.id, notas: 'Buen desarrollo de cogollos, sin plagas visibles.' },
    { nombre: 'Northern Lights #5', genetica: 'Northern Lights (Índica)', fecha: '2026-08-01', etapa: 'Vegetativo', tentId: tentPrincipal.id, notas: 'Clon de la #1, buen enraizado.' },
    { nombre: 'White Widow #2', genetica: 'White Widow (Híbrida)', fecha: '2026-07-10', etapa: 'Vegetativo', tentId: tentPrincipal.id, notas: 'Trasplantada a maceta de 11L la semana pasada.' },
    { nombre: 'Amnesia Haze #3', genetica: 'Amnesia Haze (Sativa)', fecha: '2026-05-15', etapa: 'Secado', tentId: tentSecado.id, notas: 'Cortada, colgada en el cuarto de secado.' },
    { nombre: 'Gorilla Glue #4', genetica: 'Gorilla Glue (Híbrida)', fecha: '2026-04-01', etapa: 'Curado', tentId: tentSecado.id, notas: 'En frascos, burping diario.' },
  ];

  const plantRefs: Record<string, FirebaseFirestore.DocumentReference> = {};
  for (const p of plants) {
    const ref = await db.collection('plants').add({ ...p, creadoEn: now, actualizadoEn: now });
    plantRefs[p.nombre] = ref;
  }

  await plantRefs['Northern Lights #1'].collection('waterings').add({
    fecha: '2026-09-06', cantidad: '2.0 L', producto: 'BioBloom 3ml/L', ph: '6.1', ec: '1.6', creadoEn: now,
  });
  await plantRefs['White Widow #2'].collection('waterings').add({
    fecha: '2026-09-06', cantidad: '1.2 L', producto: 'BioGrow 2ml/L', ph: '6.2', ec: '1.1', creadoEn: now,
  });

  await db.collection('harvests').add({
    plantId: plantRefs['Gorilla Glue #4'].id, cepa: 'Gorilla Glue', fecha: '2026-08-20',
    pesoHumedo: 210, pesoSeco: 52, curado: 'En curado', notas: '', creadoEn: now,
  });
  await db.collection('harvests').add({
    plantId: plantRefs['Amnesia Haze #3'].id, cepa: 'Amnesia Haze', fecha: '2026-08-25',
    pesoHumedo: 190, pesoSeco: 44, curado: 'En secado', notas: '', creadoEn: now,
  });

  console.log('Seed listo: 2 carpas, 5 plantas, 2 riegos, 2 cosechas.');
}

main().catch((err) => {
  console.error('Error cargando datos de ejemplo:', err);
  process.exit(1);
});
