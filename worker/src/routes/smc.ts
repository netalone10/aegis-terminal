import { Hono } from 'hono';
import { Cache } from '../cache';
import type { Bindings } from '../index';

export const smcRoutes = new Hono<{ Bindings: Bindings }>();

// TV Scanner helper — optional timeframe param
async function tvScan(query: object, timeframe?: string): Promise<any> {
  const body: any = { ...query };
  if (timeframe) body.timeframe = timeframe;
  const res = await fetch('https://scanner.tradingview.com/global/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`TV Scanner ${res.status}`);
  return res.json();
}

// Get OHLCV + TA data for a symbol at a specific timeframe
async function getForexData(symbol: string, market: string = 'cfd', tf?: string): Promise<any> {
  const result = await tvScan({
    columns: [
      'name', 'description', 'close', 'open', 'high', 'low', 'change',
      'Recommend.All', 'RSI', 'MACD.macd', 'MACD.signal',
      'EMA20', 'EMA50', 'SMA200', 'ATR',
      'Perf.W', 'Perf.1M', 'volume',
      'High.All', 'Low.All', 'High.6M', 'Low.6M',
      'High.1M', 'Low.1M', 'High.1W', 'Low.1W',
    ],
    filter: [{ left: 'name', operation: 'equal', right: symbol }],
    markets: [market],
    range: [0, 1],
  }, tf);
  const rows = result?.data ?? [];
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    tvSymbol: r.s,
    name: r.d?.[1],
    close: r.d?.[2],
    open: r.d?.[3],
    high: r.d?.[4],
    low: r.d?.[5],
    change: r.d?.[6],
    recommendation: r.d?.[7],
    rsi: r.d?.[8],
    macdLine: r.d?.[9],
    macdSignal: r.d?.[10],
    ema20: r.d?.[11],
    ema50: r.d?.[12],
    sma200: r.d?.[13],
    atr: r.d?.[14],
    perfWeek: r.d?.[15],
    perfMonth: r.d?.[16],
    volume: r.d?.[17],
    highAll: r.d?.[18],
    lowAll: r.d?.[19],
    high6M: r.d?.[20],
    low6M: r.d?.[21],
    high1M: r.d?.[22],
    low1M: r.d?.[23],
    high1W: r.d?.[24],
    low1W: r.d?.[25],
  };
}

// Get multi-timeframe data (daily + weekly context) for structure analysis
async function getMultiTFData(symbol: string, market: string, tf?: string): Promise<any> {
  const effectiveTf = tf || '1D';
  const [tfData, weekData] = await Promise.all([
    tvScan({
      columns: ['name', 'close', 'open', 'high', 'low', 'change', 'Recommend.All', 'RSI', 'EMA20', 'EMA50', 'ATR', 'High.1M', 'Low.1M', 'High.1W', 'Low.1W', 'High.All', 'Low.All'],
      filter: [{ left: 'name', operation: 'equal', right: symbol }],
      markets: [market],
      range: [0, 1],
    }, effectiveTf),
    // Always fetch weekly context for long-term structure
    tvScan({
      columns: ['name', 'close', 'open', 'high', 'low', 'Perf.W', 'Perf.1M', 'SMA200'],
      filter: [{ left: 'name', operation: 'equal', right: symbol }],
      markets: [market],
      range: [0, 1],
    }),
  ]);

  const d = tfData?.data?.[0];
  const w = weekData?.data?.[0];

  if (!d) return null;

  const close = d.d?.[1] ?? 0;
  const open = d.d?.[2] ?? 0;
  const high = d.d?.[3] ?? 0;
  const low = d.d?.[4] ?? 0;

  return {
    symbol: d.s,
    close, open, high, low,
    change: d.d?.[5],
    recommendation: d.d?.[6],
    rsi: d.d?.[7],
    ema20: d.d?.[8],
    ema50: d.d?.[9],
    atr: d.d?.[10],
    high1M: d.d?.[11],
    low1M: d.d?.[12],
    high1W: d.d?.[13],
    low1W: d.d?.[14],
    highAll: d.d?.[15],
    lowAll: d.d?.[16],
    sma200: w?.d?.[7],
    perfWeek: w?.d?.[5],
    perfMonth: w?.d?.[6],
  };
}

// SMC Analysis Engine
function analyzeSMC(data: any): any {
  if (!data) return null;

  const { close, open, high, low, atr, ema20, ema50, sma200, rsi,
    high1M, low1M, highAll, lowAll } = data;
  // Fallback: use 1M data if 1W not available
  const high1W = data.high1W ?? high1M;
  const low1W = data.low1W ?? low1M;

  const levels: any[] = [];
  let bias = 'neutral';
  let confidence = 50;
  const signals: string[] = [];

  // === STRUCTURE ANALYSIS ===
  const emaBias = ema20 > ema50 ? 'bullish' : ema20 < ema50 ? 'bearish' : 'neutral';
  const priceVsEma = close > ema20 ? 'bullish' : 'bearish';
  const longTermBias = close > sma200 ? 'bullish' : 'bearish';

  // === ORDER BLOCKS ===
  const atrValue = atr ?? (high - low);

  const bullishOB = {
    type: 'bullish_ob',
    zone: [low1W, low1W + atrValue * 0.5],
    label: 'Bullish Order Block (Weekly Low)',
    strength: close < low1W + atrValue ? 'strong' : 'moderate',
  };

  const bearishOB = {
    type: 'bearish_ob',
    zone: [high1W - atrValue * 0.5, high1W],
    label: 'Bearish Order Block (Weekly High)',
    strength: close > high1W - atrValue ? 'strong' : 'moderate',
  };

  levels.push(bullishOB, bearishOB);

  // === FAIR VALUE GAPS ===
  const bodySize = Math.abs(close - open);
  const isBullishCandle = close > open;

  if (bodySize > atrValue * 1.5 && isBullishCandle) {
    levels.push({
      type: 'bullish_fvg',
      zone: [open - atrValue * 0.5, open],
      label: 'Bullish FVG (Gap)',
      strength: 'moderate',
    });
    signals.push('Bullish FVG detected — potential retracement target');
  }

  if (bodySize > atrValue * 1.5 && !isBullishCandle) {
    levels.push({
      type: 'bearish_fvg',
      zone: [close, close + atrValue * 0.5],
      label: 'Bearish FVG (Gap)',
      strength: 'moderate',
    });
    signals.push('Bearish FVG detected — potential retracement target');
  }

  // === PREMIUM / DISCOUNT ZONES ===
  const range1M = high1M - low1M;
  const range1W = high1W - low1W;
  const midpoint1M = low1M + range1M * 0.5;
  const midpoint1W = low1W + range1W * 0.5;
  const fib618 = low1M + range1M * 0.618;
  const fib382 = low1M + range1M * 0.382;

  const premiumDiscount = close > midpoint1M ? 'premium' : 'discount';

  levels.push({
    type: 'equilibrium',
    zone: [midpoint1M, midpoint1M],
    label: `Equilibrium (1M): ${midpoint1M.toFixed(2)}`,
    strength: 'key',
  });

  levels.push({
    type: 'fib_618',
    zone: [fib618, fib618],
    label: `Fib 61.8%: ${fib618.toFixed(2)}`,
    strength: 'key',
  });

  levels.push({
    type: 'fib_382',
    zone: [fib382, fib382],
    label: `Fib 38.2%: ${fib382.toFixed(2)}`,
    strength: 'key',
  });

  // === LIQUIDITY POOLS ===
  const eqHighTarget = high1W;
  const eqLowTarget = low1W;

  levels.push({
    type: 'liquidity_high',
    zone: [eqHighTarget, eqHighTarget + atrValue * 0.3],
    label: 'Buy-side Liquidity (Weekly High)',
    strength: close > high1W - atrValue * 0.5 ? 'imminent' : 'distant',
  });

  levels.push({
    type: 'liquidity_low',
    zone: [eqLowTarget - atrValue * 0.3, eqLowTarget],
    label: 'Sell-side Liquidity (Weekly Low)',
    strength: close < low1W + atrValue * 0.5 ? 'imminent' : 'distant',
  });

  // === KILL ZONE DETECTION ===
  const now = new Date();
  const wibHour = (now.getUTCHours() + 7) % 24;
  let killZone = 'none';
  if (wibHour >= 7 && wibHour < 11) killZone = 'asian';
  else if (wibHour >= 13 && wibHour < 17) killZone = 'london';
  else if (wibHour >= 19 && wibHour < 23) killZone = 'new_york_am';
  else if (wibHour >= 0 && wibHour < 3) killZone = 'new_york_pm';

  // === BIAS DETERMINATION ===
  let bullScore = 0;
  let bearScore = 0;

  // EMA structure
  if (emaBias === 'bullish') bullScore += 2;
  else bearScore += 2;

  // Price vs EMA
  if (priceVsEma === 'bullish') bullScore += 1;
  else bearScore += 1;

  // Long-term trend
  if (longTermBias === 'bullish') bullScore += 1;
  else bearScore += 1;

  // RSI
  if (rsi < 30) bullScore += 2;
  else if (rsi > 70) bearScore += 2;
  else if (rsi < 45) bullScore += 1;
  else if (rsi > 55) bearScore += 1;

  // Premium/Discount
  if (premiumDiscount === 'discount') bullScore += 1;
  else bearScore += 1;

  // Recommendation
  if (data.recommendation > 0.3) bullScore += 2;
  else if (data.recommendation < -0.3) bearScore += 2;

  // Kill zone bonus
  if (killZone !== 'none') {
    signals.push(`Active Kill Zone: ${killZone.replace('_', ' ').toUpperCase()}`);
  }

  // Final bias
  if (bullScore > bearScore + 2) {
    bias = 'bullish';
    confidence = Math.min(90, 50 + (bullScore - bearScore) * 8);
  } else if (bearScore > bullScore + 2) {
    bias = 'bearish';
    confidence = Math.min(90, 50 + (bearScore - bullScore) * 8);
  } else {
    bias = 'neutral';
    confidence = 40 + Math.abs(bullScore - bearScore) * 5;
  }

  // Signal generation
  if (bias === 'bullish') {
    signals.push(`Bullish structure — EMA20 ${ema20 > ema50 ? '>' : '<'} EMA50, price ${close > ema20 ? 'above' : 'below'} EMA20`);
    if (premiumDiscount === 'discount') signals.push('Price in DISCOUNT zone — favorable for buys');
    if (close < low1W + atrValue) signals.push('Near weekly low — potential demand zone');
    if (rsi < 35) signals.push(`RSI ${rsi.toFixed(0)} oversold — divergence watch`);
  } else if (bias === 'bearish') {
    signals.push(`Bearish structure — EMA20 ${ema20 > ema50 ? '>' : '<'} EMA50, price ${close > ema20 ? 'above' : 'below'} EMA20`);
    if (premiumDiscount === 'premium') signals.push('Price in PREMIUM zone — favorable for sells');
    if (close > high1W - atrValue) signals.push('Near weekly high — potential supply zone');
    if (rsi > 65) signals.push(`RSI ${rsi.toFixed(0)} overbought — divergence watch`);
  } else {
    signals.push('No clear structure — wait for BOS/CHoCH');
  }

  // Risk levels — scalping/intraday style (tighter SL/TP)
  const slDistance = atrValue * 0.75;
  let entryZone, sl, tp1, tp2, tp3;

  if (bias === 'bullish') {
    entryZone = close;
    sl = close - slDistance;
    tp1 = close + atrValue * 0.5;
    tp2 = close + atrValue * 1;
    tp3 = close + atrValue * 1.5;
  } else if (bias === 'bearish') {
    entryZone = close;
    sl = close + slDistance;
    tp1 = close - atrValue * 0.5;
    tp2 = close - atrValue * 1;
    tp3 = close - atrValue * 1.5;
  }

  return {
    bias,
    confidence,
    premiumDiscount,
    killZone,
    bullScore,
    bearScore,
    signals,
    levels: levels.sort((a, b) => {
      const aMid = (a.zone[0] + a.zone[1]) / 2;
      const bMid = (b.zone[0] + b.zone[1]) / 2;
      return bMid - aMid;
    }),
    tradeSetup: bias !== 'neutral' ? {
      direction: bias,
      entry: entryZone,
      sl,
      tp1,
      tp2,
      tp3,
      rr1: tp1 && sl ? Math.abs(tp1 - close) / Math.abs(close - sl) : null,
      rr2: tp2 && sl ? Math.abs(tp2 - close) / Math.abs(close - sl) : null,
    } : null,
    structure: {
      emaBias,
      longTermBias,
      priceVsEma,
    },
    meta: {
      atr: atrValue,
      rsi,
      ema20,
      ema50,
      sma200,
    },
  };
}

// GET /api/smc/analyze/:symbol — full SMC analysis (optional ?tf=1D|4H|1H)
smcRoutes.get('/analyze/:symbol', async (c) => {
  const symbol = c.req.param('symbol').toUpperCase().replace('/', '');
  const tf = c.req.query('tf') || '1D';
  const cache = new Cache(c.env.AEGIS_CACHE, 120);

  try {
    const data = await cache.getOrSet(`smc:${symbol}:${tf}`, async () => {
      const market = (symbol === 'XAUUSD' || symbol === 'XAU') ? 'cfd' : 'forex';
      const rawData = await getMultiTFData(symbol, market, tf);
      if (!rawData) return null;
      return analyzeSMC(rawData);
    }, { ttl: 120 });

    if (!data) return c.json({ error: 'Symbol not found' }, 404);
    return c.json({ status: 'ok', data, tf });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/smc/batch — SMC analysis for multiple pairs (optional ?tf=1D|4H|1H)
smcRoutes.get('/batch', async (c) => {
  const tf = c.req.query('tf') || '1D';
  const cache = new Cache(c.env.AEGIS_CACHE, 120);

  try {
    const data = await cache.getOrSet(`smc:batch:${tf}`, async () => {
      const symbols = [
        { name: 'XAUUSD', label: 'XAU/USD', market: 'cfd' },
        { name: 'EURUSD', label: 'EUR/USD', market: 'forex' },
        { name: 'GBPUSD', label: 'GBP/USD', market: 'forex' },
        { name: 'USDJPY', label: 'USD/JPY', market: 'forex' },
        { name: 'USDIDR', label: 'USD/IDR', market: 'forex' },
        { name: 'USDCHF', label: 'USD/CHF', market: 'forex' },
      ];

      const results = await Promise.all(
        symbols.map(async (s) => {
          try {
            const rawData = await getMultiTFData(s.name, s.market, tf);
            const analysis = rawData ? analyzeSMC(rawData) : null;
            return analysis ? { symbol: s.label, ...analysis } : null;
          } catch {
            return null;
          }
        })
      );

      return results.filter(Boolean);
    }, { ttl: 120 });

    return c.json({ status: 'ok', data, tf });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});
