import { Hono } from 'hono';
import { Cache } from '../cache';
import type { Bindings } from '../index';
import { getCandles, type Candle } from '../lib/candles';

export const forexRoutes = new Hono<{ Bindings: Bindings }>();

// Yahoo fallback for forex candles — only exercised if the MT5 bridge is down, since every
// symbol /live and /candles serve here is already covered by MT5_SYMBOL_MAP.
const FOREX_YAHOO_MAP: Record<string, string> = {
  XAUUSD: 'GC=F', XAU: 'GC=F', EURUSD: 'EURUSD=X', GBPUSD: 'GBPUSD=X',
  USDJPY: 'USDJPY=X', USDIDR: 'USDIDR=X', AUDUSD: 'AUDUSD=X',
  USDCAD: 'USDCAD=X', NZDUSD: 'NZDUSD=X', USDCHF: 'USDCHF=X',
};
const FOREX_YAHOO_TF: Record<string, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1H': '1h', '4H': '1h', '1D': '1d',
};

async function fetchForexYahooOHLCV(symbol: string, tf: string, limit: number): Promise<Candle[]> {
  const yahooSym = FOREX_YAHOO_MAP[symbol.toUpperCase()] ?? `${symbol.toUpperCase()}=X`;
  const interval = FOREX_YAHOO_TF[tf] ?? '1d';
  const needAggregate4h = tf === '4H';
  const actualInterval = needAggregate4h ? '1h' : interval;
  const range = actualInterval === '1m' ? '1d' : actualInterval === '5m' ? '5d' : actualInterval === '15m' ? '1mo' : actualInterval === '1h' ? '3mo' : '6mo';

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=${actualInterval}&range=${range}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return [];
  const json: any = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return [];

  const ts: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const candles: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    if (q.open?.[i] == null || q.close?.[i] == null) continue;
    candles.push({ time: ts[i], open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume?.[i] ?? 0 });
  }
  return needAggregate4h ? aggregateForexCandles(candles).slice(-limit) : candles.slice(-limit);
}

function aggregateForexCandles(candles: Candle[]): Candle[] {
  const agg: Candle[] = [];
  for (let i = 0; i < candles.length; i += 4) {
    const chunk = candles.slice(i, i + 4);
    if (chunk.length === 0) continue;
    agg.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)),
      low: Math.min(...chunk.map(c => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, c) => s + c.volume, 0),
    });
  }
  return agg;
}

// TV Scanner helper
async function tvScan(query: object): Promise<any> {
  const res = await fetch('https://scanner.tradingview.com/global/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  if (!res.ok) throw new Error(`TV Scanner ${res.status}`);
  return res.json();
}

// Scan one symbol (gets best match from top result)
async function scanOne(symbol: string, market: string = 'forex'): Promise<any> {
  const result = await tvScan({
    columns: [
      'name', 'description', 'close', 'change', 'Recommend.All', 'RSI',
      'MACD.macd', 'MACD.signal', 'EMA20', 'EMA50', 'SMA200',
      'Perf.W', 'Perf.1M',
    ],
    filter: [{ left: 'name', operation: 'equal', right: symbol }],
    markets: [market],
    range: [0, 1],
    sort: { sortBy: 'close', sortOrder: 'desc' },
  });
  const rows = result?.data ?? [];
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    tvSymbol: r.s,
    name: r.d?.[1],
    price: r.d?.[2],
    changePct: r.d?.[3],
    recommendation: r.d?.[4],
    rsi: r.d?.[5],
    macdLine: r.d?.[6],
    macdSignal: r.d?.[7],
    ema20: r.d?.[8],
    ema50: r.d?.[9],
    sma200: r.d?.[10],
    perfWeek: r.d?.[11],
    perfMonth: r.d?.[12],
  };
}

// GET /api/forex/live — all major pairs with TA
forexRoutes.get('/live', async (c) => {
  const cache = new Cache(c.env.AEGIS_CACHE, 60);

  try {
    const data = await cache.getOrSet('forex:live:v3', async () => {
      // Parallel: scan all pairs + gold
      const symbols = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDIDR', 'AUDUSD', 'USDCAD', 'NZDUSD', 'USDCHF'];
      const markets = ['cfd', 'forex', 'forex', 'forex', 'forex', 'forex', 'forex', 'forex', 'forex'];
      const results = await Promise.all(
        symbols.map((s, i) => scanOne(s, markets[i]).catch(() => null))
      );

      const pairs = [];
      for (let i = 0; i < symbols.length; i++) {
        const r = results[i];
        if (!r) continue;
        const cleanName = symbols[i];
        const base = cleanName.slice(0, 3);
        const quote = cleanName.slice(3, 6);
        pairs.push({
          symbol: `${base}/${quote}`,
          ...r,
        });
      }

      return { pairs, timestamp: new Date().toISOString() };
    }, { ttl: 60 });

    return c.json({ status: 'ok', data });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/forex/ticker — lightweight ticker for ticker bar
forexRoutes.get('/ticker', async (c) => {
  const cache = new Cache(c.env.AEGIS_CACHE, 60);

  try {
    const data = await cache.getOrSet('forex:ticker:v2', async () => {
      const symbols = [
        { name: 'XAUUSD', label: 'XAU/USD', market: 'cfd' },
        { name: 'EURUSD', label: 'EUR/USD', market: 'forex' },
        { name: 'GBPUSD', label: 'GBP/USD', market: 'forex' },
        { name: 'USDJPY', label: 'USD/JPY', market: 'forex' },
        { name: 'USDIDR', label: 'USD/IDR', market: 'forex' },
      ];

      const results = await Promise.all(
        symbols.map(s => scanOne(s.name, s.market).catch(() => null))
      );

      return symbols.map((s, i) => ({
        symbol: s.label,
        price: results[i]?.price ?? null,
        change: results[i]?.changePct ?? null,
        up: (results[i]?.changePct ?? 0) >= 0,
      })).filter(t => t.price != null);
    }, { ttl: 60 });

    return c.json({ status: 'ok', data });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/forex/price/:pair — specific pair with full TA
forexRoutes.get('/price/:pair', async (c) => {
  const pair = c.req.param('pair').toUpperCase().replace('/', '');
  const cache = new Cache(c.env.AEGIS_CACHE, 60);

  try {
    const data = await cache.getOrSet(`forex:price:v3:${pair}`, async () => {
      const market = (pair === 'XAUUSD' || pair === 'XAU') ? 'cfd' : 'forex';
      const result = await scanOne(pair, market);
      if (!result) return null;
      const base = pair.slice(0, 3);
      const quote = pair.slice(3, 6);
      return { symbol: `${base}/${quote}`, ...result };
    }, { ttl: 60 });

    if (!data) return c.json({ error: 'Pair not found' }, 404);
    return c.json({ status: 'ok', data });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/forex/candles/:pair?tf=1H&limit=100 — raw OHLCV, MT5 first (Yahoo fallback)
forexRoutes.get('/candles/:pair', async (c) => {
  const pair = c.req.param('pair').toUpperCase().replace('/', '');
  const tf = c.req.query('tf') || '1H';
  const limit = Math.min(parseInt(c.req.query('limit') ?? '100', 10), 1000);
  const cache = new Cache(c.env.AEGIS_CACHE, 60);

  try {
    const key = `forex:candles:${pair}:${tf}:${limit}`;
    const { candles, source } = await cache.getOrSet(key, async () => {
      return getCandles(c.env, pair, tf, limit, cache, () => fetchForexYahooOHLCV(pair, tf, limit));
    }, { ttl: 60 });

    if (!candles || candles.length === 0) return c.json({ error: 'No data available' }, 404);
    return c.json({ status: 'ok', pair, tf, data: candles, source });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});
