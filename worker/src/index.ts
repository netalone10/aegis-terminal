import { Hono } from 'hono';
import { marketRoutes } from './routes/market';
import { idxRoutes } from './routes/idx';
import { analysisRoutes } from './routes/analysis';
import { portfolioRoutes } from './routes/portfolio';
import { aiRoutes } from './routes/ai';
import { macroRoutes } from './routes/macro';
import { journalRoutes } from './routes/journal';
import { newsRoutes } from './routes/news';

type Bindings = {
  DB: D1Database;
  AEGIS_CACHE: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

app.route('/api/market', marketRoutes);
app.route('/api/idx', idxRoutes);
app.route('/api/analysis', analysisRoutes);
app.route('/api/portfolio', portfolioRoutes);
app.route('/api/ai', aiRoutes);
app.route('/api/macro', macroRoutes);
app.route('/api/journal', journalRoutes);
app.route('/api/news', newsRoutes);

app.get('/', (c) => c.json({ status: 'ok', service: 'aegis-terminal-api' }));

export default app;
