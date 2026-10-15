import express, {type Express, type Request, type Response} from 'express'
import { sql } from 'drizzle-orm';
import { db } from './db/index.ts';

const app: Express = express();


app.use(express.json());
app.get('/api/test', (req: Request, res: Response) => {
 res.json({message: "Hello from express"})
})

app.get('/api/health', async (req: Request, res: Response) => {
  await db.execute(sql`select 1`);
  res.json({ ok: true });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
