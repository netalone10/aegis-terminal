import { Hono } from 'hono';
import { Cache } from '../cache';
import type { Bindings } from '../index';

export const idxRoutes = new Hono<{ Bindings: Bindings }>();

// --- TV Scanner query helper ---
async function tvScan(query: object): Promise<any> {
  const res = await fetch('https://scanner.tradingview.com/global/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  if (!res.ok) throw new Error(`TV Scanner ${res.status}`);
  return res.json();
}

// Scoring function: 0-100 composite
function scoreStock(d: any): number {
  let score = 50;
  // Trend: price vs EMA20/50/200
  const close = d.close ?? 0;
  const ema20 = d.ema20 ?? 0;
  const ema50 = d.ema50 ?? 0;
  const sma200 = d.sma200 ?? 0;
  if (close > ema20) score += 5;
  if (close > ema50) score += 5;
  if (close > sma200) score += 5;
  if (ema20 > ema50) score += 5; // golden cross short-term
  if (ema50 > sma200) score += 5; // golden cross long-term

  // RSI
  const rsi = d.rsi ?? 50;
  if (rsi > 50 && rsi < 70) score += 5;
  if (rsi < 30) score += 3; // oversold bounce potential
  if (rsi > 80) score -= 5; // overbought risk

  // Momentum
  const perfW = d.perfWeek ?? 0;
  const perfM = d.perfMonth ?? 0;
  if (perfW > 0) score += 3;
  if (perfM > 0) score += 3;

  // MACD
  if (d.macdLine != null && d.macdSignal != null) {
    if (d.macdLine > d.macdSignal) score += 5;
  }

  // Recommendation
  const rec = d.recommendation ?? 0;
  if (rec > 0.5) score += 5;
  if (rec < -0.5) score -= 5;

  // Volume (placeholder: high volume = interest)
  if (d.volume > 5000000) score += 3;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// GET /api/idx/components — IDX screener with 12 filters + scoring
idxRoutes.get('/components', async (c) => {
  const index = c.req.query('index') ?? 'IDX30'; // IDX30, IDXCOMPOSITE, LQ45
  const minScore = parseInt(c.req.query('minScore') ?? '50', 10);
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 100);
  const cache = new Cache(c.env.AEGIS_CACHE, 300);

  try {
    const cacheKey = `idx:${index}:${minScore}:${limit}`;
    const data = await cache.getOrSet(cacheKey, async () => {
      // Map IDX names to TV market codes
      const marketMap: Record<string, string> = {
        'IDX30': 'indonesia',
        'IDXCOMPOSITE': 'indonesia',
        'LQ45': 'indonesia',
        'JII70': 'indonesia',
        'ISSI': 'indonesia',
      };
      const market = marketMap[index] ?? 'indonesia';

      // 12 filter columns for IDX screener
      const columns = [
        'name', 'description', 'close', 'change', 'volume',
        'market_cap_basic', // 5
        'Recommend.All',    // 6
        'RSI',              // 7
        'MACD.macd',        // 8
        'MACD.signal',      // 9
        'Perf.W',           // 10
        'Perf.1M',          // 11
        'EMA20',            // 12
        'EMA50',            // 13
        'SMA200',           // 14
        'Perf.3M',          // 15
        'Perf.Y',           // 16
        'ATR',              // 17
        'Volatility.D',     // 18
      ];

      // Build filters
      const filters = [
        { left: 'is_primary', operation: 'equal', right: true },
        { left: 'market_cap_basic', operation: 'greater', right: 500000000 }, // min $500M
      ];

      const query = {
        columns,
        filter: filters,
        options: { lang: 'en' },
        range: [0, 200], // fetch more, then filter by score
        sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' },
        markets: [market],
      };

      return tvScan(query);
    }, { ttl: 300 });

    const rows = (data as any)?.data ?? [];
    const stocks = rows.map((r: any) => {
      const d = r.d ?? [];
      const obj = {
        symbol: r.s,
        name: d[1],
        close: d[2],
        changePct: d[3],
        volume: d[4],
        marketCap: d[5],
        recommendation: d[6],
        rsi: d[7],
        macdLine: d[8],
        macdSignal: d[9],
        perfWeek: d[10],
        perfMonth: d[11],
        ema20: d[12],
        ema50: d[13],
        sma200: d[14],
        perf3M: d[15],
        perfYear: d[16],
        atr: d[17],
        volatilityDaily: d[18],
        score: 0,
      };
      obj.score = scoreStock(obj);
      return obj;
    })
    .filter((s: any) => s.score >= minScore)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, limit);

    return c.json({ status: 'ok', index, total: stocks.length, data: stocks });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/idx/performance — IDX sector performance
idxRoutes.get('/performance', async (c) => {
  const market = c.req.query('market') ?? 'indonesia';
  const cache = new Cache(c.env.AEGIS_CACHE, 600);

  try {
    const data = await cache.getOrSet(`idxperf:${market}`, async () => {
      const query = {
        columns: ['name', 'description', 'close', 'change', 'Perf.W', 'Perf.1M', 'Perf.3M', 'Perf.Y', 'market_cap_basic', 'volume'],
        filter: [{ left: 'is_primary', operation: 'equal', right: true }],
        options: { lang: 'en' },
        range: [0, 100],
        sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' },
        markets: [market],
      };
      return tvScan(query);
    }, { ttl: 600 });

    const rows = (data as any)?.data ?? [];
    return c.json({
      status: 'ok',
      data: rows.map((r: any) => ({
        symbol: r.s, name: r.d?.[1], close: r.d?.[2],
        changePct: r.d?.[3], perfWeek: r.d?.[4], perfMonth: r.d?.[5],
        perf3M: r.d?.[6], perfYear: r.d?.[7], marketCap: r.d?.[8], volume: r.d?.[9],
      })),
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/idx/sectors — IDX sector breakdown
idxRoutes.get('/sectors', async (c) => {
  const market = c.req.query('market') ?? 'indonesia';
  const cache = new Cache(c.env.AEGIS_CACHE, 600);

  try {
    const data = await cache.getOrSet(`idxsectors:${market}`, async () => {
      const sectors = [
        'Technology', 'Financial', 'Healthcare', 'Consumer', 'Industrial',
        'Energy', 'Materials', 'Real Estate', 'Utilities', 'Communication',
      ];
      const results: any[] = [];
      for (const sector of sectors) {
        try {
          const query = {
            columns: ['name', 'description', 'close', 'change', 'Perf.W', 'Perf.1M', 'market_cap_basic'],
            filter: [
              { left: 'is_primary', operation: 'equal', right: true },
              { left: 'sector', operation: 'in_range', right: [sector] },
            ],
            options: { lang: 'en' },
            range: [0, 10],
            sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' },
            markets: [market],
          };
          const scan = await tvScan(query);
          const rows = (scan as any)?.data ?? [];
          results.push({
            sector,
            stocks: rows.map((r: any) => ({
              symbol: r.s, name: r.d?.[1], close: r.d?.[2],
              changePct: r.d?.[3], perfWeek: r.d?.[4], perfMonth: r.d?.[5], marketCap: r.d?.[6],
            })),
          });
        } catch { /* skip sector on error */ }
      }
      return results;
    }, { ttl: 600 });

    return c.json({ status: 'ok', data });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});
