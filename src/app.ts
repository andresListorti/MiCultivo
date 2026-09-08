import express from 'express';
import cors from 'cors';
import { requireAuth } from './middleware/auth';
import tentsRouter from './routes/tents';
import plantsRouter from './routes/plants';
import harvestsRouter from './routes/harvests';

const app = express();

app.use(cors());
app.use(express.json());

// Sin auth: solo para chequear que la función serverless está viva.
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Todo lo demás requiere sesión de Firebase Auth (Nacho o Pochi).
app.use('/api/tents', requireAuth, tentsRouter);
app.use('/api/plants', requireAuth, plantsRouter);
app.use('/api/harvests', requireAuth, harvestsRouter);

app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

export default app;
