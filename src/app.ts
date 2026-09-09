import express from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import { requireAuth } from './middleware/auth';
import tentsRouter from './routes/tents';
import plantsRouter from './routes/plants';
import harvestsRouter from './routes/harvests';
import { FAVICON_SVG, ICON_32_PNG, ICON_192_PNG, ICON_512_PNG, APPLE_TOUCH_ICON_PNG } from './lib/icons';

const app = express();

app.use(cors());
app.use(express.json());

// El frontend se sirve desde el propio Express (evita depender de la
// detección de framework/estáticos de Vercel, que en este proyecto no
// terminaba publicando index.html como archivo estático). index.html se
// incluye en el bundle de la función vía `functions.includeFiles` en
// vercel.json, y se lee una sola vez al arrancar la función.
function loadIndexHtml(): string {
  const candidates = [
    path.join(process.cwd(), 'index.html'),
    path.join(__dirname, '..', 'index.html'),
    path.join(__dirname, '..', '..', 'index.html'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8');
  }
  return '<h1>index.html no encontrado en el bundle</h1>';
}
const INDEX_HTML = loadIndexHtml();

// Ícono de la app (favicon + PWA): embebido en código (src/lib/icons.ts),
// no leído de un archivo vía `includeFiles` de vercel.json — un intento
// anterior con un patrón `{a,b}` en includeFiles no bundleó NADA (ni
// siquiera index.html), tumbando el sitio entero.
app.get('/favicon.svg', (_req, res) => res.type('image/svg+xml').send(FAVICON_SVG));
app.get('/icon-32.png', (_req, res) => res.type('png').send(ICON_32_PNG));
app.get('/icon-192.png', (_req, res) => res.type('png').send(ICON_192_PNG));
app.get('/icon-512.png', (_req, res) => res.type('png').send(ICON_512_PNG));
app.get('/apple-touch-icon.png', (_req, res) => res.type('png').send(APPLE_TOUCH_ICON_PNG));
app.get('/site.webmanifest', (_req, res) => res.type('application/manifest+json').json({
  name: 'Mi Cultivo',
  short_name: 'Mi Cultivo',
  description: 'Seguimiento personal de cultivo de cannabis',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait-primary',
  background_color: '#ffffff',
  theme_color: '#14532d',
  icons: [
    { src: '/icon-32.png', sizes: '32x32', type: 'image/png', purpose: 'any' },
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
  ],
}));

app.get('/', (_req, res) => res.type('html').send(INDEX_HTML));

// Sin auth: solo para chequear que la función serverless está viva.
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Todo lo demás requiere sesión de Firebase Auth (Nacho o Pochi).
app.use('/api/tents', requireAuth, tentsRouter);
app.use('/api/plants', requireAuth, plantsRouter);
app.use('/api/harvests', requireAuth, harvestsRouter);

// Cualquier otra ruta que no sea /api/* devuelve el HTML (SPA).
app.get(/^(?!\/api\/).*/, (_req, res) => res.type('html').send(INDEX_HTML));

app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

export default app;
