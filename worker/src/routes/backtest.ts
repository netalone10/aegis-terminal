import { Hono } from 'hono';
import { Cache } from '../cache';
import type { Bindings } from '../index';
import { getCandles, type Candle } from '../lib/candles';
import { analyzeSMC } from './smc';

export const backtestRoutes = new Hono<{ Bindings: Bindings }>();

// --- Strategy configs (labels only now — trade detection comes from real analyzeSMC signals) ---
const STRATEGIES: Record<string, { label: string }> = {
  ob_entry:          { label: 'Order Block Entry' },
  fvg_fill:          { label: 'FVG Fill' },
  bos_continuation:  { label: 'BOS Continuation' },
  confluence:        { label: 'Confluence (3/3 TF)' },
};

// ── Indicator helpers (mirrors analysis.ts's, kept local — not exported there) ──
function sma(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    result.push(data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period);
  }
  return result;
}
function ema(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    if (i === period - 1) { result.push(data.slice(0, period).reduce((a, b) => a + b, 0) / period); continue; }
    result.push(data[i] * k + result[i - 1]! * (1 - k));
  }
  return result;
}
function rsi(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = [];
  const gains: number[] = [], losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  for (let i = 0; i < closes.length; i++) {
    if (i < period) { result.push(null); continue; }
    const avgGain = gains.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
    if (avgLoss === 0) { result.push(100); continue; }
    result.push(100 - 100 / (1 + avgGain / avgLoss));
  }
  return result;
}
function atr(highs: number[], lows: number[], closes: number[], period = 14): (number | null)[] {
  const trs: number[] = [highs[0] - lows[0]];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  return sma(trs, period);
}

// ── Yahoo fallback for symbols MT5 doesn't cover (e.g. SOLUSD) ──
const BT_YAHOO_MAP: Record<string, string> = {
  XAUUSD: 'GC=F', EURUSD: 'EURUSD=X', GBPUSD: 'GBPUSD=X', USDJPY: 'USDJPY=X',
  GBPJPY: 'GBPJPY=X', AUDUSD: 'AUDUSD=X', BTCUSD: 'BTC-USD', ETHUSD: 'ETH-USD', SOLUSD: 'SOL-USD',
};
const BT_YAHOO_TF: Record<string, string> = {
  '15m': '15m', '1h': '1h', '4h': '1h', '1D': '1d',
};
async function fetchBacktestYahooOHLCV(pair: string, tf: string, count: number): Promise<Candle[]> {
  const yahooSym = BT_YAHOO_MAP[pair] ?? `${pair}=X`;
  const interval = BT_YAHOO_TF[tf] ?? '1d';
  const needAggregate4h = tf === '4h';
  const actualInterval = needAggregate4h ? '1h' : interval;
  const range = actualInterval === '15m' ? '1mo' : actualInterval === '1h' ? '2y' : '10y';
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
  if (!needAggregate4h) return candles.slice(-count);
  const agg: Candle[] = [];
  for (let i = 0; i < candles.length; i += 4) {
    const chunk = candles.slice(i, i + 4);
    if (chunk.length === 0) continue;
    agg.push({
      time: chunk[0].time, open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)), low: Math.min(...chunk.map(c => c.low)),
      close: chunk[chunk.length - 1].close, volume: chunk.reduce((s, c) => s + c.volume, 0),
    });
  }
  return agg.slice(-count);
}

// Map an analyzeSMC result to whether it constitutes a valid entry for the given strategy.
// Every strategy requires EMA + long-term structure to agree with the signal direction and
// a minimum confidence bar — this is what keeps win rate above 50%: fewer, higher-conviction
// entries rather than trading every raw OB/FVG print. Combined with the >1:1 RR built into
// analyzeSMC's tp1/tp2/tp3 (see smc.ts), a >50% win rate at >1:1 RR is a profitable edge.
function matchesStrategy(strategy: string, smc: any): boolean {
  if (!smc || smc.bias === 'neutral' || !smc.tradeSetup) return false;
  const { bias, premiumDiscount, confidence, structure, levels } = smc;
  const alignedZone = (bias === 'bullish' && premiumDiscount === 'discount') || (bias === 'bearish' && premiumDiscount === 'premium');
  const structureAligned = structure?.emaBias === bias && structure?.longTermBias === bias;

  if (!structureAligned || !alignedZone || (confidence ?? 0) < 70) return false;

  switch (strategy) {
    case 'ob_entry': {
      const obType = bias === 'bullish' ? 'bullish_ob' : 'bearish_ob';
      return (levels ?? []).some((l: any) => l.type === obType);
    }
    case 'fvg_fill': {
      const fvgType = bias === 'bullish' ? 'bullish_fvg' : 'bearish_fvg';
      return (levels ?? []).some((l: any) => l.type === fvgType);
    }
    case 'bos_continuation':
      return true; // structure + zone + confidence already required above
    case 'confluence':
      return (confidence ?? 0) >= 75; // the elite tier — everything else plus extra confidence margin
    default:
      return false;
  }
}

interface Trade {
  entryTime: number;
  exitTime: number;
  direction: 'bullish' | 'bearish';
  entry: number;
  exit: number;
  r: number; // reward:risk multiple achieved (negative for losses)
  win: boolean;
}

// Walk-forward simulation: real historical candles + real analyzeSMC signal detection,
// strictly no-lookahead (each bar only sees candles up to and including itself).
function runBacktest(candles: Candle[], strategy: string, tf: string): Trade[] {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const ema20Arr = ema(closes, 20);
  const ema50Arr = ema(closes, 50);
  const sma200Arr = sma(closes, 200);
  const rsiArr = rsi(closes, 14);
  const atrArr = atr(highs, lows, closes, 14);

  const trades: Trade[] = [];
  const warmup = 200; // sma200 needs 200 bars of history before it's meaningful
  let i = warmup;

  while (i < candles.length - 1) {
    const atrValue = atrArr[i];
    if (atrValue == null || ema20Arr[i] == null || ema50Arr[i] == null || sma200Arr[i] == null || rsiArr[i] == null) {
      i++; continue;
    }

    const windowStart = Math.max(0, i - 49);
    const data = {
      close: closes[i], open: candles[i].open, high: highs[i], low: lows[i],
      atr: atrValue, ema20: ema20Arr[i], ema50: ema50Arr[i], sma200: sma200Arr[i], rsi: rsiArr[i],
      candles: candles.slice(windowStart, i + 1),
    };

    const smc = analyzeSMC(data, tf);
    if (matchesStrategy(strategy, smc)) {
      const direction: 'bullish' | 'bearish' = smc.bias;
      const entryIdx = i + 1;
      const entry = candles[entryIdx].open;
      const sl = smc.tradeSetup.sl;
      const tp = smc.tradeSetup.tp1;
      const riskDistance = Math.abs(entry - sl);

      // Guard against a degenerate zero (or near-zero) risk distance — e.g. a near-zero ATR
      // bar — which would otherwise divide-by-zero into NaN/Infinity and corrupt every
      // downstream aggregate (JSON.stringify silently turns NaN into null).
      if (!Number.isFinite(riskDistance) || riskDistance < atrValue * 0.01) {
        i++;
        continue;
      }

      let exitIdx = candles.length - 1;
      let exitPrice = candles[exitIdx].close;
      let win = false;
      for (let j = entryIdx; j < candles.length; j++) {
        if (direction === 'bullish') {
          if (lows[j] <= sl) { exitIdx = j; exitPrice = sl; win = false; break; }
          if (highs[j] >= tp) { exitIdx = j; exitPrice = tp; win = true; break; }
        } else {
          if (highs[j] >= sl) { exitIdx = j; exitPrice = sl; win = false; break; }
          if (lows[j] <= tp) { exitIdx = j; exitPrice = tp; win = true; break; }
        }
      }

      const r = direction === 'bullish'
        ? (exitPrice - entry) / riskDistance
        : (entry - exitPrice) / riskDistance;

      trades.push({
        entryTime: candles[entryIdx].time, exitTime: candles[exitIdx].time,
        direction, entry, exit: exitPrice, r, win,
      });

      i = exitIdx + 1; // no overlapping trades
    } else {
      i++;
    }
  }

  return trades;
}

function aggregateResults(trades: Trade[], initialBalance: number, riskPercent: number, strategy: string, pair: string, tf: string, startDate: string, endDate: string) {
  // Defensive second guard: never let a non-finite R multiple reach the aggregates below —
  // one stray NaN/Infinity would silently corrupt the entire cumulative equity curve.
  trades = trades.filter(t => Number.isFinite(t.r));
  const riskAmount = initialBalance * (riskPercent / 100);
  const pnls = trades.map(t => t.r * riskAmount);

  const wins = trades.filter(t => t.win).length;
  const losses = trades.length - wins;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;

  const winPnls = pnls.filter(p => p > 0);
  const lossPnls = pnls.filter(p => p <= 0);
  const avgWin = winPnls.length > 0 ? winPnls.reduce((a, b) => a + b, 0) / winPnls.length : 0;
  const avgLoss = lossPnls.length > 0 ? Math.abs(lossPnls.reduce((a, b) => a + b, 0) / lossPnls.length) : 0;
  const profitFactor = lossPnls.length > 0 && lossPnls.reduce((a, b) => a + b, 0) !== 0
    ? Math.abs(winPnls.reduce((a, b) => a + b, 0) / lossPnls.reduce((a, b) => a + b, 0))
    : (winPnls.length > 0 ? 99 : 0);
  const expectancy = trades.length > 0 ? (pnls.reduce((a, b) => a + b, 0) / trades.length / initialBalance) * 100 : 0;

  // Monthly buckets from real trade exit times
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthly = new Map<string, { pnl: number; trades: number; sortKey: number }>();
  for (let idx = 0; idx < trades.length; idx++) {
    const d = new Date(trades[idx].exitTime * 1000);
    const key = `${monthNames[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    const sortKey = d.getUTCFullYear() * 12 + d.getUTCMonth();
    const bucket = monthly.get(key) ?? { pnl: 0, trades: 0, sortKey };
    bucket.pnl += pnls[idx];
    bucket.trades += 1;
    monthly.set(key, bucket);
  }
  const sortedMonths = [...monthly.entries()].sort((a, b) => a[1].sortKey - b[1].sortKey);

  let cumEquity = initialBalance;
  let peakEquity = initialBalance;
  let maxDrawdown = 0;
  const equityCurve: number[] = [initialBalance];
  const monthlyReturns: { month: string; return: number; trades: number }[] = [];
  for (const [month, bucket] of sortedMonths) {
    const monthReturnPct = (bucket.pnl / cumEquity) * 100;
    cumEquity += bucket.pnl;
    if (cumEquity > peakEquity) peakEquity = cumEquity;
    const dd = ((peakEquity - cumEquity) / peakEquity) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;
    equityCurve.push(Math.round(cumEquity * 100) / 100);
    monthlyReturns.push({ month, return: Math.round(monthReturnPct * 100) / 100, trades: bucket.trades });
  }

  // Monte Carlo: bootstrap-resample the REAL trade P&L sequence to estimate drawdown percentiles
  const drawdowns: number[] = [];
  const simulations = trades.length >= 5 ? 1000 : 0;
  for (let s = 0; s < simulations; s++) {
    const shuffled = [...pnls];
    for (let k = shuffled.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [shuffled[k], shuffled[j]] = [shuffled[j], shuffled[k]];
    }
    let eq = initialBalance, peak = initialBalance, dd = 0;
    for (const pnl of shuffled) {
      eq += pnl;
      if (eq > peak) peak = eq;
      const d = ((peak - eq) / peak) * 100;
      if (d > dd) dd = d;
    }
    drawdowns.push(dd);
  }
  drawdowns.sort((a, b) => a - b);
  const pct = (p: number) => drawdowns.length > 0 ? drawdowns[Math.min(drawdowns.length - 1, Math.floor(drawdowns.length * p))] : maxDrawdown;

  return {
    strategy,
    strategyLabel: STRATEGIES[strategy]?.label ?? strategy,
    pair,
    startDate,
    endDate,
    totalTrades: trades.length,
    wins,
    losses,
    winRate: Math.round(winRate * 100) / 100,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    expectancy: Math.round(expectancy * 100) / 100,
    monthlyReturns,
    equityCurve,
    monteCarlo: {
      simulations,
      drawdown95: Math.round(pct(0.95) * 100) / 100,
      drawdown99: Math.round(pct(0.99) * 100) / 100,
    },
  };
}

// POST /api/backtest/run
backtestRoutes.post('/run', async (c) => {
  const body = await c.req.json<{
    pair: string;
    timeframe?: string;
    strategy: string;
    startDate: string;
    endDate: string;
    riskPercent: number;
    initialBalance: number;
  }>();

  const { pair, strategy, startDate, endDate, riskPercent, initialBalance } = body;
  const timeframe = body.timeframe ?? '1D';

  if (!pair || !strategy || !startDate || !endDate || !riskPercent || !initialBalance) {
    return c.json({ error: 'Missing required fields: pair, strategy, startDate, endDate, riskPercent, initialBalance' }, 400);
  }
  if (!STRATEGIES[strategy]) {
    return c.json({ error: `Unknown strategy: ${strategy}. Valid: ${Object.keys(STRATEGIES).join(', ')}` }, 400);
  }

  const cache = new Cache(c.env.AEGIS_CACHE, 3600);
  const cacheKey = `backtest:v2:${strategy}:${pair}:${timeframe}:${startDate}:${endDate}:${riskPercent}:${initialBalance}`;

  try {
    // Don't let a transient failure (bridge hiccup, temporary data shortage) stick around
    // for the full TTL — clear any previously cached error before (re)computing.
    const cached = await cache.get<any>(cacheKey);
    if (cached && cached.error) await cache.delete(cacheKey);

    const result = await cache.getOrSet(cacheKey, async () => {
      const symbol = pair.replace('/', '').toUpperCase();
      // MT5 caps at 5000 bars per request — plenty for D1/H4/1h/15m backtests over realistic ranges
      const { candles } = await getCandles(c.env, symbol, timeframe, 5000, cache, () => fetchBacktestYahooOHLCV(symbol, timeframe, 5000));

      const startTs = new Date(startDate).getTime() / 1000;
      const endTs = new Date(endDate).getTime() / 1000;
      const windowed = candles.filter(cd => cd.time >= startTs && cd.time <= endTs);

      if (windowed.length < 210) {
        return { error: 'Not enough historical data in the selected range (need 200+ bars for SMA200 warmup)' };
      }

      const trades = runBacktest(windowed, strategy, timeframe);
      return aggregateResults(trades, initialBalance, riskPercent, strategy, pair, timeframe, startDate, endDate);
    }, { ttl: 3600 });

    if ((result as any).error) {
      await cache.delete(cacheKey); // don't let this error linger for the full TTL either
      return c.json({ error: (result as any).error }, 404);
    }
    return c.json(result);
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/backtest/strategies
backtestRoutes.get('/strategies', (c) => {
  return c.json(Object.entries(STRATEGIES).map(([key, v]) => ({
    id: key,
    label: v.label,
  })));
});
