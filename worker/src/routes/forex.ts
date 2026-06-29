import { Hono } from 'hono';
import { Cache } from '../cache';
import type { Bindings } from '../index';

export const forexRoutes = new Hono<{ Bindings: Bindings }>();

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
      const symbols = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDIDR', 'AUDUSD', 'USDCAD', 'NZDUSD'];
      const markets = ['cfd', 'forex', 'forex', 'forex', 'forex', 'forex', 'forex', 'forex'];
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
  const cache = new Cache(c.env.AEGIS_CACHE, 30);

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
