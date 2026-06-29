import { Hono } from 'hono';
import { Cache } from '../cache';
import type { Bindings } from '../index';

export const marketRoutes = new Hono<{ Bindings: Bindings }>();

// --- TV Scanner: POST to TradingView global scan ---
async function tvScan(query: object): Promise<any> {
  const res = await fetch('https://scanner.tradingview.com/global/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  if (!res.ok) throw new Error(`TV Scanner ${res.status}`);
  return res.json();
}

// --- Yahoo Finance quote ---
async function yahooQuote(symbol: string): Promise<any> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'AegisTerminal/1.0' },
  });
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const data: any = await res.json();
  const result = data.chart?.result?.[0];
  if (!result) return null;
  const meta = result.meta;
  const quotes = result.indicators?.quote?.[0];
  const len = quotes?.close?.length ?? 0;
  return {
    symbol: meta.symbol,
    price: meta.regularMarketPrice,
    prevClose: meta.chartPreviousClose ?? meta.previousClose,
    currency: meta.currency,
    exchange: meta.exchangeName,
    interval: meta.dataGranularity,
    closes: quotes?.close?.filter((v: number | null) => v != null) ?? [],
    volumes: quotes?.volume?.filter((v: number | null) => v != null) ?? [],
    timestamps: result.timestamp ?? [],
  };
}

// GET /api/market/price/:symbol — Yahoo Finance real-time quote
marketRoutes.get('/price/:symbol', async (c) => {
  const symbol = c.req.param('symbol');
  const cache = new Cache(c.env.AEGIS_CACHE, 60); // 1 min TTL

  try {
    const data = await cache.getOrSet(`price:${symbol}`, () => yahooQuote(symbol), { ttl: 60 });
    if (!data) return c.json({ error: 'Symbol not found' }, 404);
    return c.json({ status: 'ok', data });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/market/candles/:symbol — Yahoo chart data
marketRoutes.get('/candles/:symbol', async (c) => {
  const symbol = c.req.param('symbol');
  const interval = c.req.query('interval') ?? '1d';
  const range = c.req.query('range') ?? '3mo';
  const cache = new Cache(c.env.AEGIS_CACHE, 300);

  try {
    const key = `candles:${symbol}:${interval}:${range}`;
    const data = await cache.getOrSet(key, async () => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'AegisTerminal/1.0' } });
      if (!res.ok) throw new Error(`Yahoo ${res.status}`);
      const json: any = await res.json();
      const result = json.chart?.result?.[0];
      if (!result) return null;
      const q = result.indicators?.quote?.[0] ?? {};
      const timestamps = result.timestamp ?? [];
      return timestamps.map((t: number, i: number) => ({
        time: t,
        open: q.open?.[i],
        high: q.high?.[i],
        low: q.low?.[i],
        close: q.close?.[i],
        volume: q.volume?.[i],
      })).filter((c: any) => c.close != null);
    }, { ttl: 300 });
    if (!data) return c.json({ error: 'No data' }, 404);
    return c.json({ status: 'ok', symbol, interval, range, data });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/market/orderbook/:symbol — CoinGecko market data (crypto proxy)
marketRoutes.get('/orderbook/:symbol', async (c) => {
  const symbol = c.req.param('symbol').toLowerCase();
  const cache = new Cache(c.env.AEGIS_CACHE, 30);

  try {
    const data = await cache.getOrSet(`cg:${symbol}`, async () => {
      const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(symbol)}?localization=false&tickers=false&community_data=false&developer_data=false`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
      const json: any = await res.json();
      return {
        id: json.id,
        symbol: json.symbol,
        name: json.name,
        price_usd: json.market_data?.current_price?.usd,
        price_btc: json.market_data?.current_price?.btc,
        market_cap: json.market_data?.market_cap?.usd,
        volume_24h: json.market_data?.total_volume?.usd,
        change_24h: json.market_data?.price_change_percentage_24h,
        change_7d: json.market_data?.price_change_percentage_7d,
        ath: json.market_data?.ath?.usd,
        ath_change_pct: json.market_data?.ath_change_percentage?.usd,
        circulating_supply: json.market_data?.circulating_supply,
        total_supply: json.market_data?.total_supply,
      };
    }, { ttl: 60 });
    return c.json({ status: 'ok', data });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/market/scan — TV Scanner screener (top stocks by custom filters)
marketRoutes.get('/scan', async (c) => {
  const market = c.req.query('market') ?? 'america';
  const cache = new Cache(c.env.AEGIS_CACHE, 120);

  try {
    const data = await cache.getOrSet(`tvscan:${market}`, async () => {
      const query = {
        columns: [
          'name', 'description', 'logoid', 'type', 'close', 'change', 'volume',
          'market_cap_basic', 'Recommend.All', 'RSI', 'MACD.macd', 'MACD.signal',
          'Perf.W', 'Perf.1M', 'EMA20', 'EMA50', 'SMA200',
        ],
        filter: [
          { left: 'is_primary', operation: 'equal', right: true },
          { left: 'market_cap_basic', operation: 'greater', right: 1000000000 },
        ],
        options: { lang: 'en' },
        range: [0, 50],
        sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' },
        markets: [market],
      };
      return tvScan(query);
    }, { ttl: 120 });

    const rows = (data as any)?.data ?? [];
    const results = rows.map((r: any) => ({
      symbol: r.s,
      name: r.d?.[1],
      logoId: r.d?.[2],
      type: r.d?.[3],
      close: r.d?.[4],
      changePct: r.d?.[5],
      volume: r.d?.[6],
      marketCap: r.d?.[7],
      recommendation: r.d?.[8],
      rsi: r.d?.[9],
      macdLine: r.d?.[10],
      macdSignal: r.d?.[11],
      perfWeek: r.d?.[12],
      perfMonth: r.d?.[13],
      ema20: r.d?.[14],
      ema50: r.d?.[15],
      sma200: r.d?.[16],
    }));
    return c.json({ status: 'ok', total: results.length, data: results });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/market/gainers — TV Scanner top gainers
marketRoutes.get('/gainers', async (c) => {
  const market = c.req.query('market') ?? 'america';
  const cache = new Cache(c.env.AEGIS_CACHE, 120);

  try {
    const data = await cache.getOrSet(`tvgainers:${market}`, async () => {
      const query = {
        columns: ['name', 'description', 'close', 'change', 'volume', 'market_cap_basic', 'Recommend.All'],
        filter: [
          { left: 'is_primary', operation: 'equal', right: true },
          { left: 'market_cap_basic', operation: 'greater', right: 500000000 },
          { left: 'change', operation: 'greater', right: 2 },
        ],
        options: { lang: 'en' },
        range: [0, 25],
        sort: { sortBy: 'change', sortOrder: 'desc' },
        markets: [market],
      };
      return tvScan(query);
    }, { ttl: 120 });

    const rows = (data as any)?.data ?? [];
    return c.json({
      status: 'ok',
      data: rows.map((r: any) => ({
        symbol: r.s, name: r.d?.[1], close: r.d?.[2],
        changePct: r.d?.[3], volume: r.d?.[4], marketCap: r.d?.[5], recommendation: r.d?.[6],
      })),
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/market/losers — TV Scanner top losers
marketRoutes.get('/losers', async (c) => {
  const market = c.req.query('market') ?? 'america';
  const cache = new Cache(c.env.AEGIS_CACHE, 120);

  try {
    const data = await cache.getOrSet(`tvlosers:${market}`, async () => {
      const query = {
        columns: ['name', 'description', 'close', 'change', 'volume', 'market_cap_basic'],
        filter: [
          { left: 'is_primary', operation: 'equal', right: true },
          { left: 'market_cap_basic', operation: 'greater', right: 500000000 },
          { left: 'change', operation: 'less', right: -2 },
        ],
        options: { lang: 'en' },
        range: [0, 25],
        sort: { sortBy: 'change', sortOrder: 'asc' },
        markets: [market],
      };
      return tvScan(query);
    }, { ttl: 120 });

    const rows = (data as any)?.data ?? [];
    return c.json({
      status: 'ok',
      data: rows.map((r: any) => ({
        symbol: r.s, name: r.d?.[1], close: r.d?.[2],
        changePct: r.d?.[3], volume: r.d?.[4], marketCap: r.d?.[5],
      })),
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});
