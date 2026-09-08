import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Carga la credencial del service account desde:
 *  1) la env var FIREBASE_SERVICE_ACCOUNT (JSON completo, así se configura en Vercel), o
 *  2) el archivo local firebase-service-account.json en la raíz del proyecto (solo para
 *     desarrollo/scripts locales — nunca se sube al repo, ver .gitignore).
 */
function loadServiceAccount(): admin.ServiceAccount {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }
  const localPath = path.join(process.cwd(), 'firebase-service-account.json');
  if (fs.existsSync(localPath)) {
    return JSON.parse(fs.readFileSync(localPath, 'utf8'));
  }
  throw new Error(
    'Falta la credencial de Firebase. Definí la variable de entorno FIREBASE_SERVICE_ACCOUNT ' +
    '(JSON completo del service account) o guardá el archivo firebase-service-account.json ' +
    'en la raíz del proyecto. Ver README.md → "Credenciales".'
  );
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(loadServiceAccount()),
  });
}

export const db = admin.firestore();
export const authAdmin = admin.auth();
export default admin;
