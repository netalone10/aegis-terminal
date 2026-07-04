import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { marketRoutes } from './routes/market';
import { analysisRoutes } from './routes/analysis';
import { portfolioRoutes } from './routes/portfolio';
import { aiRoutes } from './routes/ai';
import { macroRoutes } from './routes/macro';
import { journalRoutes } from './routes/journal';
import { newsRoutes } from './routes/news';
import { forexRoutes } from './routes/forex';
import { mt5Routes } from './routes/mt5';
import { smcRoutes } from './routes/smc';
import { calendarRoutes } from './routes/calendar';
import { tradeRoutes } from './routes/trade';
import { planRoutes } from './routes/plan';
import { sentimentRoutes } from './routes/sentiment';
import { backtestRoutes } from './routes/backtest';
import { sessionRoutes } from './routes/session';
import { signalsRoutes } from './routes/signals';
import { cryptoRoutes } from './routes/crypto';
import { Cache } from './cache';

export type Bindings = {
  DB: D1Database;
  AEGIS_CACHE: KVNamespace;
  GROQ_API_KEY: string;
  FRED_API_KEY: string;
  MT5_API_URL: string;
  MT5_API_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('/*', cors());

app.route('/api/market', marketRoutes);
app.route('/api/analysis', analysisRoutes);
app.route('/api/portfolio', portfolioRoutes);
app.route('/api/ai', aiRoutes);
app.route('/api/macro', macroRoutes);
app.route('/api/journal', journalRoutes);
app.route('/api/news', newsRoutes);
app.route('/api/forex', forexRoutes);
app.route('/api/mt5', mt5Routes);
app.route('/api/smc', smcRoutes);
app.route('/api/calendar', calendarRoutes);
app.route('/api/trades', tradeRoutes);
app.route('/api/plan', planRoutes);
app.route('/api/sentiment', sentimentRoutes);
app.route('/api/backtest', backtestRoutes);
app.route('/api/session', sessionRoutes);
app.route('/api/signals', signalsRoutes);
app.route('/api/crypto', cryptoRoutes);

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

  // Pre-warm session reports at session start times
  // Asia: 00:30 UTC (07:30 WIB), London: 06:15 UTC (13:15 WIB), NY: 11:15 UTC (18:15 WIB)
  const utcHour = new Date().getUTCHours();
  const utcMin = new Date().getUTCMinutes();
  const sessionWarmUrls: string[] = [];
  if (utcHour === 0 && utcMin >= 25 && utcMin <= 35) {
    sessionWarmUrls.push('https://aegisterminal.app/api/session/report/refresh?session=asia');
  } else if (utcHour === 6 && utcMin >= 10 && utcMin <= 20) {
    sessionWarmUrls.push('https://aegisterminal.app/api/session/report/refresh?session=london');
  } else if (utcHour === 11 && utcMin >= 10 && utcMin <= 20) {
    sessionWarmUrls.push('https://aegisterminal.app/api/session/report/refresh?session=ny');
  }
  if (sessionWarmUrls.length > 0) {
    await Promise.allSettled(sessionWarmUrls.map(url =>
      fetch(url).then(r => console.log(`Cron session: ${url} ${r.status}`)).catch(e => console.error(`Cron session fail: ${url}`, e))
    ));
  }
}

export default {
  fetch: app.fetch,
  scheduled: handleScheduled,
};
