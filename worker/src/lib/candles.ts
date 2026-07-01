import type { Bindings } from '../index';
import { Cache } from '../cache';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandleResult {
  candles: Candle[];
  source: 'mt5' | 'yahoo';
}

// ── MT5 bridge primitive (shared with routes/mt5.ts) ──────────────
export async function mt5Fetch(env: Bindings, path: string): Promise<any> {
  const res = await fetch(`${env.MT5_API_URL}${path}`, {
    headers: { 'X-API-Key': env.MT5_API_KEY },
  });
  if (!res.ok) throw new Error(`MT5 API ${res.status}`);
  return res.json();
}

// ── Symbol mapping: internal ticker → MT5 (Valetax) symbol ────────
// Confirmed live from the Valetax account (57 tradable symbols). IDX equities and anything
// else not listed here return null from toMT5Symbol(), signalling callers to use their
// existing Yahoo/TradingView fallback.
const MT5_SYMBOL_MAP: Record<string, string> = {
  EURUSD: 'EURUSD.vxc', GBPUSD: 'GBPUSD.vxc', USDJPY: 'USDJPY.vxc',
  AUDUSD: 'AUDUSD.vxc', USDCHF: 'USDCHF.vxc', USDCAD: 'USDCAD.vxc',
  NZDUSD: 'NZDUSD.vxc', EURJPY: 'EURJPY.vxc', GBPJPY: 'GBPJPY.vxc',
  EURGBP: 'EURGBP.vxc', EURAUD: 'EURAUD.vxc', EURCAD: 'EURCAD.vxc',
  EURCHF: 'EURCHF.vxc', EURNZD: 'EURNZD.vxc', GBPAUD: 'GBPAUD.vxc',
  GBPCAD: 'GBPCAD.vxc', GBPCHF: 'GBPCHF.vxc', GBPNZD: 'GBPNZD.vxc',
  AUDCAD: 'AUDCAD.vxc', AUDCHF: 'AUDCHF.vxc', AUDJPY: 'AUDJPY.vxc',
  AUDNZD: 'AUDNZD.vxc', CADCHF: 'CADCHF.vxc', CADJPY: 'CADJPY.vxc',
  CHFJPY: 'CHFJPY.vxc', NZDCAD: 'NZDCAD.vxc', NZDCHF: 'NZDCHF.vxc',
  NZDJPY: 'NZDJPY.vxc', USDIDR: 'USDIDR',
  XAUUSD: 'XAUUSD.vxc', XAU: 'XAUUSD.vxc', XAGUSD: 'XAGUSD.vxc',
  XBRUSD: 'XBRUSD.vxc', BRENT: 'XBRUSD.vxc', XTIUSD: 'XTIUSD.vxc', WTIUSD: 'XTIUSD.vxc',
  BTCUSD: 'BTCUSD.vxc', ETHUSD: 'ETHUSD.vxc', LTCUSD: 'LTCUSD.vxc',
  DOGEUSD: 'DOGEUSD.vxc', BCHUSD: 'BCHUSD.vxc', XRPUSD: 'XRPUSD.vxc',
};

export function toMT5Symbol(symbol: string): string | null {
  const key = symbol.toUpperCase().replace('/', '').replace(/\.(JK|VXC)$/i, '');
  return MT5_SYMBOL_MAP[key] ?? null;
}

// ── Timeframe mapping: every literal tf string used across smc.ts/analysis.ts/market.ts ──
// Case-sensitive on purpose — avoids the '1m' (1-minute) vs '1M' (monthly) collision.
// Monthly is intentionally absent → forces the caller's Yahoo fallback (no MT5 consumer
// needs monthly candles today). MT5 has no native H4, so H4/4h/4H aggregate from H1.
const MT5_TF_MAP: Record<string, { mt5Tf: string; aggregateFactor: number }> = {
  '1m': { mt5Tf: 'M1', aggregateFactor: 1 },
  '5m': { mt5Tf: 'M5', aggregateFactor: 1 },
  '15m': { mt5Tf: 'M15', aggregateFactor: 1 },
  '30m': { mt5Tf: 'M30', aggregateFactor: 1 },
  '1H': { mt5Tf: 'H1', aggregateFactor: 1 },
  '1h': { mt5Tf: 'H1', aggregateFactor: 1 },
  '4H': { mt5Tf: 'H1', aggregateFactor: 4 },
  '4h': { mt5Tf: 'H1', aggregateFactor: 4 },
  '1D': { mt5Tf: 'D1', aggregateFactor: 1 },
  '1d': { mt5Tf: 'D1', aggregateFactor: 1 },
  'D': { mt5Tf: 'D1', aggregateFactor: 1 },
  '1W': { mt5Tf: 'W1', aggregateFactor: 1 },
  '1w': { mt5Tf: 'W1', aggregateFactor: 1 },
  'W': { mt5Tf: 'W1', aggregateFactor: 1 },
};

// ── OHLC aggregation (e.g. H1 → H4), shared by every caller ───────
export function aggregateCandles(candles: Candle[], factor: number): Candle[] {
  if (factor <= 1) return candles;
  const agg: Candle[] = [];
  for (let i = 0; i < candles.length; i += factor) {
    const chunk = candles.slice(i, i + factor);
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

async function fetchMT5Candles(
  env: Bindings,
  mt5Symbol: string,
  mt5Tf: string,
  count: number,
  cache?: Cache
): Promise<Candle[]> {
  const key = `mt5:candles:${mt5Symbol}:${mt5Tf}:${count}`;
  const run = () => mt5Fetch(env, `/candles?symbol=${mt5Symbol}&timeframe=${mt5Tf}&count=${count}`);
  const raw = cache ? await cache.getOrSet(key, run, { ttl: 60 }) : await run();
  return raw?.candles ?? [];
}

/**
 * Fetch candles for `symbol`/`tf`, trying MT5 first (for the 57 Valetax-covered symbols)
 * and falling back to the caller-supplied `yahooFallback` for anything MT5 doesn't cover
 * or if the MT5 bridge errors (VPS/tunnel down). Each route keeps its own existing
 * Yahoo-fetching logic as the fallback closure, since IDX/.JK handling and interval/range
 * resolution already differ per file — this only adds the MT5-first branch in front.
 */
export async function getCandles(
  env: Bindings,
  symbol: string,
  tf: string,
  limit: number,
  cache: Cache | undefined,
  yahooFallback: () => Promise<Candle[]>
): Promise<CandleResult> {
  const mt5Symbol = toMT5Symbol(symbol);
  const tfInfo = MT5_TF_MAP[tf];

  if (mt5Symbol && tfInfo) {
    try {
      const MT5_MAX_COUNT = 5000; // mt5-api/server.py caps `count` at 5000 per request
      const rawCount = tfInfo.aggregateFactor > 1 ? limit * tfInfo.aggregateFactor + 8 : limit;
      const fetchCount = Math.min(rawCount, MT5_MAX_COUNT);
      let candles = await fetchMT5Candles(env, mt5Symbol, tfInfo.mt5Tf, fetchCount, cache);
      if (tfInfo.aggregateFactor > 1) candles = aggregateCandles(candles, tfInfo.aggregateFactor);
      if (candles.length > 0) return { candles: candles.slice(-limit), source: 'mt5' };
    } catch (e) {
      console.error(`MT5 candle fetch failed for ${symbol}/${tf}, falling back to Yahoo:`, e);
    }
  }

  const candles = await yahooFallback();
  return { candles, source: 'yahoo' };
}
