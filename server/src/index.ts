import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import { sql } from 'drizzle-orm';
import { db } from './db/index.ts';
import { loadSession } from './auth/middleware.ts';
import { authRouter } from './routes/auth.ts';
import { deleteExpiredSessions } from './db/session.ts';
import cookieParser from 'cookie-parser';

const app: Express = express();


app.use(express.json());
app.use(cookieParser())
app.use(loadSession);
app.use('/api/auth', authRouter);

app.get('/api/test', (req: Request, res: Response) => {
 res.json({message: "Hello from express"})
})

app.get('/api/health', async (req: Request, res: Response) => {
  await db.execute(sql`select 1`);
  res.json({ ok: true });
});

// Catches anything thrown or rejected in a handler/middleware (e.g. DB down, malformed JSON) and replies with JSON.
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? "Internal server error" : "Bad request" });
});

// Expired sessions are otherwise only removed when someone tries to use them.
// So clean up every hour
const HOUR_MS = 60 * 60 * 1000;
setInterval(() => {
  deleteExpiredSessions().catch((err) => console.error('Failed to clean up sessions', err));
}, HOUR_MS).unref();

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
