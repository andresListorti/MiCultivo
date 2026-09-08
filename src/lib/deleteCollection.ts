import { db } from '../firebaseAdmin';

/** Borra todos los documentos de una subcolección (Firestore no hace cascade delete solo). */
export async function deleteCollection(collectionPath: string, batchSize = 100): Promise<void> {
  const collectionRef = db.collection(collectionPath);
  let snapshot = await collectionRef.limit(batchSize).get();
  while (!snapshot.empty) {
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    snapshot = await collectionRef.limit(batchSize).get();
  }
}
