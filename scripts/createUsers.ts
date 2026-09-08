/**
 * Crea las 2 cuentas de acceso de la app (Nacho y Pochi) en Firebase Auth,
 * con contraseñas fuertes generadas al azar. Se corre UNA sola vez (o cuando
 * haga falta resetear una contraseña).
 *
 * Uso:
 *   npm run create-users
 *
 * Emails por defecto: nacho@micultivo.app / pochi@micultivo.app (no hace
 * falta que existan de verdad — Firebase Auth no manda ni exige verificación
 * de email para este flujo). Para usar emails reales propios, pasalos así:
 *   NACHO_EMAIL=nacho@gmail.com POCHI_EMAIL=pochi@gmail.com npm run create-users
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { authAdmin } from '../src/firebaseAdmin';

function strongPassword(): string {
  return crypto.randomBytes(12).toString('base64url'); // ~96 bits de entropía
}

async function upsertUser(displayName: string, email: string): Promise<{ email: string; password: string; uid: string }> {
  const password = strongPassword();
  try {
    const existing = await authAdmin.getUserByEmail(email);
    await authAdmin.updateUser(existing.uid, { password, displayName });
    return { email, password, uid: existing.uid };
  } catch {
    const created = await authAdmin.createUser({ email, password, displayName, emailVerified: true });
    return { email, password, uid: created.uid };
  }
}

async function main() {
  const nachoEmail = process.env.NACHO_EMAIL || 'nacho@micultivo.app';
  const pochiEmail = process.env.POCHI_EMAIL || 'pochi@micultivo.app';

  const nacho = await upsertUser('Nacho', nachoEmail);
  const pochi = await upsertUser('Pochi', pochiEmail);

  const lines = [
    'Credenciales de Mi Cultivo — generadas el ' + new Date().toISOString(),
    '(este archivo está en .gitignore, nunca se sube al repo — guardalo en un lugar seguro y borralo después)',
    '',
    `Nacho  → email: ${nacho.email}   password: ${nacho.password}`,
    `Pochi  → email: ${pochi.email}   password: ${pochi.password}`,
    '',
    'Podés cambiar la contraseña de cada uno más adelante desde la app (o volviendo a correr este script).',
  ];
  const outPath = path.join(process.cwd(), 'credenciales-generadas.txt');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');

  console.log(lines.join('\n'));
  console.log(`\nGuardado también en: ${outPath}`);
}

main().catch((err) => {
  console.error('Error creando usuarios:', err);
  process.exit(1);
});
