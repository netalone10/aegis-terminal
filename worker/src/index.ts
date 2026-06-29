import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { marketRoutes } from './routes/market';
import { idxRoutes } from './routes/idx';
import { analysisRoutes } from './routes/analysis';
import { portfolioRoutes } from './routes/portfolio';
import { aiRoutes } from './routes/ai';
import { macroRoutes } from './routes/macro';
import { journalRoutes } from './routes/journal';
import { newsRoutes } from './routes/news';
import { forexRoutes } from './routes/forex';
import { smcRoutes } from './routes/smc';
import { calendarRoutes } from './routes/calendar';
import { tradeRoutes } from './routes/trade';
import { planRoutes } from './routes/plan';
import { sentimentRoutes } from './routes/sentiment';
import { backtestRoutes } from './routes/backtest';
import { Cache } from './cache';

export type Bindings = {
  DB: D1Database;
  AEGIS_CACHE: KVNamespace;
  GROQ_API_KEY: string;
  FRED_API_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('/*', cors());

app.route('/api/market', marketRoutes);
app.route('/api/idx', idxRoutes);
app.route('/api/analysis', analysisRoutes);
app.route('/api/portfolio', portfolioRoutes);
app.route('/api/ai', aiRoutes);
app.route('/api/macro', macroRoutes);
app.route('/api/journal', journalRoutes);
app.route('/api/news', newsRoutes);
app.route('/api/forex', forexRoutes);
app.route('/api/smc', smcRoutes);
app.route('/api/calendar', calendarRoutes);
app.route('/api/trades', tradeRoutes);
app.route('/api/plan', planRoutes);
app.route('/api/sentiment', sentimentRoutes);
app.route('/api/backtest', backtestRoutes);

app.get('/', (c) => c.json({ status: 'ok', service: 'aegis-terminal-api', version: '1.1.0' }));

// Cron handler — pre-warm caches
async function handleScheduled(event: ScheduledEvent, env: Bindings) {
  const cache = new Cache(env.AEGIS_CACHE, 300);

  // Pre-warm market scan cache
  try {
    await fetch('https://aegisterminal.app/api/market/scan?exchange=IDX');
    console.log('Cron: IDX market scan cached');
  } catch (e) { console.error('Cron IDX scan failed:', e); }

  // Pre-warm macro indicators (if FRED key available)
  if (env.FRED_API_KEY) {
    try {
      await fetch('https://aegisterminal.app/api/macro/indicators');
      console.log('Cron: Macro indicators cached');
    } catch (e) { console.error('Cron macro failed:', e); }
  }

  // Pre-warm forex + SMC caches (parallel)
  const warmUrls = [
    'https://aegisterminal.app/api/forex/live',
    'https://aegisterminal.app/api/forex/ticker',
    'https://aegisterminal.app/api/smc/batch',
  ];
  await Promise.allSettled(warmUrls.map(url =>
    fetch(url).then(r => console.log(`Cron warm: ${url} ${r.status}`)).catch(e => console.error(`Cron warm fail: ${url}`, e))
  ));
}

export default {
  fetch: app.fetch,
  scheduled: handleScheduled,
};
