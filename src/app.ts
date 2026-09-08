import express from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import { requireAuth } from './middleware/auth';
import tentsRouter from './routes/tents';
import plantsRouter from './routes/plants';
import harvestsRouter from './routes/harvests';

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
