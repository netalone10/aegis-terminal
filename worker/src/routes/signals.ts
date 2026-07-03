import { Hono } from 'hono';
import { Cache } from '../cache';
import type { Bindings } from '../index';
import { mt5Fetch } from '../lib/candles';

export const signalsRoutes = new Hono<{ Bindings: Bindings }>();

// ── Helpers ──────────────────────────────────────────────────────

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SwingPoint {
  price: number;
  type: 'HH' | 'HL' | 'LH' | 'LL' | 'SH' | 'SL';
  time: number;
  index: number;
}

interface FVG {
  type: 'bull' | 'bear';
  top: number;
  bottom: number;
  time: number;
  gap: number;
}

interface OrderBlock {
  type: 'bull_ob' | 'bear_ob';
  high: number;
  low: number;
  time: number;
}

interface Reasoning {
  summary: string;
  structure: string;
  candlePattern?: string;
  multiTf: string;
  zoneNote: string;
}

interface Signal {
  symbol: string;
  timeframe: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  price: number;
  spread: number;
  zone: 'premium' | 'discount' | 'equilibrium';
  killZone: string;
  structure: {
    trend: string;
    swingHighs: SwingPoint[];
    swingLows: SwingPoint[];
    bos: boolean;
    choch: boolean;
  };
  levels: {
    resistance: number[];
    support: number[];
    fvgs: FVG[];
    orderBlocks: OrderBlock[];
    equilibrium: number;
  };
  setups: Setup[];
  reasoning: Reasoning;
  timestamp: number;
}

interface Setup {
  type: 'long' | 'short';
  entry: number;
  sl: number;
  tp: number;
  rr: number;
  reason: string;
  confluence: string[];
  status: 'active' | 'waiting';
}

// ── Swing Detection ──────────────────────────────────────────────

function detectSwings(candles: Candle[]): SwingPoint[] {
  const swings: SwingPoint[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    const isHigh =
      c.high > candles[i - 1].high && c.high > candles[i + 1].high &&
      c.high > candles[i - 2].high && c.high > candles[i + 2].high;
    const isLow =
      c.low < candles[i - 1].low && c.low < candles[i + 1].low &&
      c.low < candles[i - 2].low && c.low < candles[i + 2].low;

    if (isHigh) swings.push({ price: c.high, type: 'SH', time: c.time, index: i });
    if (isLow) swings.push({ price: c.low, type: 'SL', time: c.time, index: i });
  }

  // Classify HH/HL/LH/LL
  const classified: SwingPoint[] = [];
  let lastHigh = -Infinity;
  let lastLow = Infinity;

  for (const s of swings) {
    if (s.type === 'SH') {
      s.type = s.price > lastHigh ? 'HH' : 'LH';
      lastHigh = s.price;
      classified.push(s);
    } else {
      s.type = s.price > lastLow ? 'HL' : 'LL';
      lastLow = s.price;
      classified.push(s);
    }
  }

  return classified;
}

// ── Consecutive Structure Counting ───────────────────────────────

function countConsecutiveStructure(swings: SwingPoint[]): {
  consecutiveHH: number;
  consecutiveHL: number;
  consecutiveLH: number;
  consecutiveLL: number;
  lastHLSwing?: SwingPoint;
  lastLHSwing?: SwingPoint;
  pattern: string;
} {
  const recent = swings.slice(-10);
  let consecutiveHH = 0;
  let consecutiveHL = 0;
  let consecutiveLH = 0;
  let consecutiveLL = 0;
  let lastHLSwing: SwingPoint | undefined;
  let lastLHSwing: SwingPoint | undefined;

  for (let i = recent.length - 1; i >= 0; i--) {
    const s = recent[i];
    if (s.type === 'HH') consecutiveHH++;
    else if (s.type === 'HL') {
      consecutiveHL++;
      if (!lastHLSwing) lastHLSwing = s;
    }
    else if (s.type === 'LH') consecutiveLH++;
    else if (s.type === 'LL') {
      consecutiveLL++;
      if (!lastLHSwing) lastLHSwing = s;
    }
  }

  let pattern = 'Choppy / mixed structure';
  if (consecutiveHH >= 2 && consecutiveHL >= 2) {
    pattern = `${consecutiveHH} consecutive HH with ${consecutiveHL} HL`;
    if (lastHLSwing) pattern += ` — last HL at ${lastHLSwing.price.toFixed(0)} holding`;
  } else if (consecutiveLH >= 2 && consecutiveLL >= 2) {
    pattern = `${consecutiveLH} consecutive LH with ${consecutiveLL} LL`;
    if (lastLHSwing) pattern += ` — last LH at ${lastLHSwing.price.toFixed(0)} broken`;
  }

  return { consecutiveHH, consecutiveHL, consecutiveLH, consecutiveLL, lastHLSwing, lastLHSwing, pattern };
}

// ── Candle Pattern Detection ─────────────────────────────────────

function detectCandlePatterns(candles: Candle[]): string | undefined {
  if (candles.length < 3) return undefined;
  const recent = candles.slice(-3);
  const last = recent[recent.length - 1];
  const prev = recent[recent.length - 2];

  const body = Math.abs(last.close - last.open);
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const totalRange = last.high - last.low;

  // Engulfing
  const prevBody = Math.abs(prev.close - prev.open);
  if (body > prevBody * 1.5 && totalRange > 0) {
    if (last.close > last.open && prev.close < prev.open) {
      return 'Bullish engulfing pattern — strong reversal signal at current zone';
    }
    if (last.close < last.open && prev.close > prev.open) {
      return 'Bearish engulfing pattern — strong reversal signal at current zone';
    }
  }

  // Pin bar / hammer
  if (totalRange > 0 && body < totalRange * 0.25) {
    if (lowerWick > body * 2 && upperWick < body * 0.5) {
      return 'Hammer / pin bar rejection — buyers defended lower level';
    }
    if (upperWick > body * 2 && lowerWick < body * 0.5) {
      return 'Shooting star / inverted pin — sellers rejected higher prices';
    }
  }

  // Doji
  if (totalRange > 0 && body < totalRange * 0.05) {
    return 'Doji — indecision candle, wait for confirmation';
  }

  return undefined;
}

// ── Multi-TF Bias Check ──────────────────────────────────────────

function getTFBias(candles: Candle[]): 'bullish' | 'bearish' | 'neutral' {
  if (candles.length < 20) return 'neutral';
  const swings = detectSwings(candles);
  const recent = swings.slice(-8);
  const hh = recent.filter(s => s.type === 'HH').length;
  const hl = recent.filter(s => s.type === 'HL').length;
  const lh = recent.filter(s => s.type === 'LH').length;
  const ll = recent.filter(s => s.type === 'LL').length;

  if (hh + hl > lh + ll) return 'bullish';
  if (lh + ll > hh + hl) return 'bearish';
  return 'neutral';
}

// ── FVG Detection ────────────────────────────────────────────────

function detectFVGs(candles: Candle[]): FVG[] {
  const fvgs: FVG[] = [];
  for (let i = 2; i < candles.length; i++) {
    if (candles[i].low > candles[i - 2].high) {
      fvgs.push({
        type: 'bull',
        top: candles[i].low,
        bottom: candles[i - 2].high,
        time: candles[i - 1].time,
        gap: candles[i].low - candles[i - 2].high,
      });
    }
    if (candles[i].high < candles[i - 2].low) {
      fvgs.push({
        type: 'bear',
        top: candles[i - 2].low,
        bottom: candles[i].high,
        time: candles[i - 1].time,
        gap: candles[i - 2].low - candles[i].high,
      });
    }
  }
  return fvgs;
}

// ── Order Block Detection ────────────────────────────────────────

function detectOBs(candles: Candle[]): OrderBlock[] {
  const obs: OrderBlock[] = [];
  for (let i = 2; i < candles.length; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const body = Math.abs(prev.close - prev.open);
    const move = curr.high - curr.low;

    if (move > body * 2 && body > 0) {
      if (prev.close < prev.open) {
        obs.push({ type: 'bull_ob', high: prev.open, low: prev.low, time: prev.time });
      } else {
        obs.push({ type: 'bear_ob', high: prev.high, low: prev.close, time: prev.time });
      }
    }
  }
  return obs;
}

// ── Kill Zone Check ──────────────────────────────────────────────

function getKillZone(): string {
  const now = new Date();
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (mins >= 420 && mins <= 600) return 'London Open';
  if (mins >= 720 && mins <= 900) return 'NY Open';
  if (mins >= 900 && mins <= 1020) return 'London Close';
  if (mins >= 0 && mins <= 180) return 'Tokyo';
  return 'No Active Kill Zone';
}

// ── Premium / Discount Zone ──────────────────────────────────────

function getZone(price: number, high: number, low: number): 'premium' | 'discount' | 'equilibrium' {
  const mid = (high + low) / 2;
  const range = high - low;
  if (price > mid + range * 0.1) return 'premium';
  if (price < mid - range * 0.1) return 'discount';
  return 'equilibrium';
}

// ── Generate Setups ──────────────────────────────────────────────

function generateSetups(
  bias: string,
  price: number,
  swings: SwingPoint[],
  fvgs: FVG[],
  obs: OrderBlock[],
  eq: number,
): Setup[] {
  const setups: Setup[] = [];
  const recentHigh = Math.max(...swings.filter(s => s.type === 'HH' || s.type === 'SH').map(s => s.price).slice(-3));
  const recentLow = Math.min(...swings.filter(s => s.type === 'LL' || s.type === 'SL').map(s => s.price).slice(-3));

  // Bullish setups
  const bullFVGs = fvgs.filter(f => f.type === 'bull' && f.top > price - 100 && f.top < price);
  const bullOBs = obs.filter(o => o.type === 'bull_ob' && o.high > price - 100 && o.high < price);

  if (bullFVGs.length > 0) {
    const fvg = bullFVGs[bullFVGs.length - 1];
    const entry = fvg.top;
    const sl = entry - 25;
    const tp = recentHigh;
    setups.push({
      type: 'long',
      entry,
      sl,
      tp,
      rr: Math.round((tp - entry) / (entry - sl) * 10) / 10,
      reason: `Bull FVG fill at ${fvg.bottom.toFixed(0)}-${fvg.top.toFixed(0)}`,
      confluence: [
        `Structure: ${bias}`,
        `FVG gap: ${fvg.gap.toFixed(1)} pts`,
        bullOBs.length > 0 ? `Bull OB nearby` : null,
        `Equilibrium: ${eq.toFixed(0)}`,
      ].filter(Boolean) as string[],
      status: price > entry + 10 ? 'active' : 'waiting',
    });
  }

  if (bullOBs.length > 0) {
    const ob = bullOBs[bullOBs.length - 1];
    const entry = ob.high;
    const sl = ob.low - 5;
    const tp = recentHigh;
    setups.push({
      type: 'long',
      entry,
      sl,
      tp,
      rr: Math.round((tp - entry) / (entry - sl) * 10) / 10,
      reason: `Bull OB at ${ob.low.toFixed(0)}-${ob.high.toFixed(0)}`,
      confluence: [
        `Structure: ${bias}`,
        `Order Block demand zone`,
        `Zone: discount`,
      ],
      status: price > entry + 10 ? 'active' : 'waiting',
    });
  }

  // Bearish setups
  const bearOBs = obs.filter(o => o.type === 'bear_ob' && o.low < price + 100 && o.low > price);
  if (bearOBs.length > 0) {
    const ob = bearOBs[bearOBs.length - 1];
    const entry = ob.low;
    const sl = ob.high + 5;
    const tp = recentLow;
    setups.push({
      type: 'short',
      entry,
      sl,
      tp,
      rr: Math.round((entry - tp) / (sl - entry) * 10) / 10,
      reason: `Bear OB at ${ob.low.toFixed(0)}-${ob.high.toFixed(0)}`,
      confluence: [
        `Structure: ${bias}`,
        `Order Block supply zone`,
        `Zone: premium`,
      ],
      status: price < entry - 10 ? 'active' : 'waiting',
    });
  }

  return setups;
}

// ── Build Reasoning ──────────────────────────────────────────────

function buildReasoning(
  bias: 'bullish' | 'bearish' | 'neutral',
  confidence: number,
  structInfo: ReturnType<typeof countConsecutiveStructure>,
  candlePattern: string | undefined,
  h4Bias: 'bullish' | 'bearish' | 'neutral',
  d1Bias: 'bullish' | 'bearish' | 'neutral',
  zone: 'premium' | 'discount' | 'equilibrium',
  setups: Setup[],
): Reasoning {
  // Structure string
  const structure = bias === 'bullish'
    ? `Bullish: ${structInfo.pattern}`
    : bias === 'bearish'
    ? `Bearish: ${structInfo.pattern}`
    : `Neutral: ${structInfo.pattern}`;

  // Multi-TF alignment
  const tfBiasMap = { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral' };
  let multiTf: string;
  const aligned = (bias === h4Bias && h4Bias === d1Bias && bias !== 'neutral');
  if (aligned) {
    multiTf = `H4 ${tfBiasMap[h4Bias]} + D1 ${tfBiasMap[d1Bias]} = fully aligned with H1`;
  } else {
    const mismatches: string[] = [];
    if (bias !== h4Bias && h4Bias !== 'neutral') mismatches.push(`H4 ${tfBiasMap[h4Bias]}`);
    if (bias !== d1Bias && d1Bias !== 'neutral') mismatches.push(`D1 ${tfBiasMap[d1Bias]}`);
    multiTf = mismatches.length > 0
      ? `Mismatches: ${mismatches.join(', ')} vs H1 ${tfBiasMap[bias]}`
      : `H4 ${tfBiasMap[h4Bias]} + D1 ${tfBiasMap[d1Bias]} — no strong alignment`;
  }

  // Zone note
  let zoneNote: string;
  if (zone === 'premium') {
    zoneNote = 'Price in premium zone — longs have worse R:R, shorts favored here';
  } else if (zone === 'discount') {
    zoneNote = 'Price in discount zone — shorts have worse R:R, longs favored here';
  } else {
    zoneNote = 'Price at equilibrium — both directions viable with equal R:R context';
  }

  // Summary
  const activeSetups = setups.filter(s => s.status === 'active');
  const setupSummary = activeSetups.length > 0
    ? `${activeSetups.length} active setup(s): ${activeSetups.map(s => `${s.type} @ ${s.entry.toFixed(0)} R:R ${s.rr}`).join(', ')}`
    : 'No active setups — waiting for price to reach zones';

  const summaryParts: string[] = [];
  summaryParts.push(`${confidence}% confidence ${bias} bias`);
  summaryParts.push(setupSummary);
  if (aligned) summaryParts.push('Multi-TF alignment confirms');
  if (candlePattern) summaryParts.push(candlePattern);

  return {
    summary: summaryParts.join('. ') + '.',
    structure,
    candlePattern,
    multiTf,
    zoneNote,
  };
}

// ── Main Signal Endpoint ─────────────────────────────────────────

signalsRoutes.get('/:symbol', async (c) => {
  const rawSymbol = c.req.param('symbol') ?? 'XAUUSD';
  const symbol = rawSymbol.toUpperCase().replace('/', '');
  const timeframe = (c.req.query('timeframe') ?? 'H1').toUpperCase();
  const cache = new Cache(c.env.AEGIS_CACHE, 30);

  try {
    // Fetch live price + multi-TF candles in parallel
    const mt5Symbol = `${symbol}.vxc`;
    const [priceData, h1Data, h4Data, d1Data] = await Promise.all([
      mt5Fetch(c.env, `/price?symbol=${mt5Symbol}`).catch(() => null),
      mt5Fetch(c.env, `/candles?symbol=${mt5Symbol}&timeframe=H1&count=100`).catch(() => null),
      mt5Fetch(c.env, `/candles?symbol=${mt5Symbol}&timeframe=H4&count=50`).catch(() => null),
      mt5Fetch(c.env, `/candles?symbol=${mt5Symbol}&timeframe=D1&count=30`).catch(() => null),
    ]);

    const price = priceData?.bid ?? 0;
    const spread = priceData?.spread ?? 0;

    // Lazy result tracking: check open signals for this symbol
    c.executionCtx.waitUntil(
      closeOpenSignals(c.env.DB, symbol, price).catch(e =>
        console.error(`Lazy close failed for ${symbol}:`, e)
      )
    );

    // Analyze H1 (primary timeframe)
    const h1Candles: Candle[] = h1Data?.candles ?? [];
    const h4Candles: Candle[] = h4Data?.candles ?? [];
    const d1Candles: Candle[] = d1Data?.candles ?? [];
    const swings = detectSwings(h1Candles);
    const fvgs = detectFVGs(h1Candles);
    const obs = detectOBs(h1Candles);

    // Market structure
    const recentSwings = swings.slice(-10);
    const hhCount = recentSwings.filter(s => s.type === 'HH').length;
    const hlCount = recentSwings.filter(s => s.type === 'HL').length;
    const lhCount = recentSwings.filter(s => s.type === 'LH').length;
    const llCount = recentSwings.filter(s => s.type === 'LL').length;

    let bias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let confidence = 50;
    if (hhCount + hlCount > lhCount + llCount) {
      bias = 'bullish';
      confidence = 60 + Math.min((hhCount + hlCount - lhCount - llCount) * 5, 30);
    } else if (lhCount + llCount > hhCount + hlCount) {
      bias = 'bearish';
      confidence = 60 + Math.min((lhCount + llCount - hhCount - hlCount) * 5, 30);
    }

    // BOS detection
    const lastTwo = recentSwings.slice(-4);
    const bos = lastTwo.length >= 2 && (
      (lastTwo[lastTwo.length - 1].type === 'HH' && lastTwo[lastTwo.length - 2].type === 'HL') ||
      (lastTwo[lastTwo.length - 1].type === 'LL' && lastTwo[lastTwo.length - 2].type === 'LH')
    );

    // Range + zone
    const rangeHigh = Math.max(...h1Candles.slice(-20).map(c => c.high));
    const rangeLow = Math.min(...h1Candles.slice(-20).map(c => c.low));
    const equilibrium = (rangeHigh + rangeLow) / 2;
    const zone = getZone(price, rangeHigh, rangeLow);
    const killZone = getKillZone();

    // Levels
    const resistances = swings.filter(s => s.type === 'HH' || s.type === 'SH').map(s => s.price).slice(-3).reverse();
    const supports = swings.filter(s => s.type === 'LL' || s.type === 'SL').map(s => s.price).slice(-3).reverse();

    // Active FVGs (unfilled)
    const activeFVGs = fvgs.filter(f => {
      if (f.type === 'bull') return price > f.bottom && price < f.top + 50;
      return price < f.top && price > f.bottom - 50;
    }).slice(-5);

    // Active OBs
    const activeOBs = obs.filter(o => {
      if (o.type === 'bull_ob') return price > o.low - 20 && price < o.high + 50;
      return price < o.high + 20 && price > o.low - 50;
    }).slice(-5);

    // Generate setups
    const setups = generateSetups(bias, price, swings, fvgs, obs, equilibrium);

    // Enhanced reasoning
    const structInfo = countConsecutiveStructure(swings);
    const candlePattern = detectCandlePatterns(h1Candles);
    const h4Bias = getTFBias(h4Candles);
    const d1Bias = getTFBias(d1Candles);

    const reasoning = buildReasoning(
      bias, confidence, structInfo, candlePattern,
      h4Bias, d1Bias, zone, setups,
    );

    const signal: Signal = {
      symbol,
      timeframe,
      bias,
      confidence: Math.min(confidence, 95),
      price,
      spread,
      zone,
      killZone,
      structure: {
        trend: bias === 'bullish' ? 'Bullish (HH/HL)' : bias === 'bearish' ? 'Bearish (LH/LL)' : 'Ranging',
        swingHighs: swings.filter(s => s.type === 'HH' || s.type === 'SH').slice(-3),
        swingLows: swings.filter(s => s.type === 'HL' || s.type === 'SL').slice(-3),
        bos,
        choch: false,
      },
      levels: {
        resistance: resistances,
        support: supports,
        fvgs: activeFVGs,
        orderBlocks: activeOBs,
        equilibrium,
      },
      setups,
      reasoning,
      timestamp: Date.now(),
    };

    // Auto-save signal to D1 (fire-and-forget, don't fail main request)
    if (setups.length > 0) {
      c.executionCtx.waitUntil(
        saveSignalToHistory(c.env.DB, symbol, signal, timeframe).catch(e =>
          console.error(`Auto-save signal failed for ${symbol}:`, e)
        )
      );
    }

    return c.json({ status: 'ok', data: signal });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── History: Save Signal ─────────────────────────────────────────

signalsRoutes.post('/save', async (c) => {
  try {
    const body = await c.req.json<{
      symbol: string;
      bias: string;
      confidence: number;
      price: number;
      entry: number;
      sl: number;
      tp: number;
      rr: number;
      reason: string;
      confluence: string[];
    }>();

    const { symbol, bias, confidence, price, entry, sl, tp, rr, reason, confluence } = body;

    if (!symbol || !bias) {
      return c.json({ error: 'symbol and bias are required' }, 400);
    }

    const confluenceJson = JSON.stringify(confluence ?? []);

    await c.env.DB.prepare(
      `INSERT INTO signal_history (symbol, bias, confidence, price, entry, sl, tp, rr, reason, confluence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(symbol, bias, confidence ?? 0, price ?? 0, entry ?? 0, sl ?? 0, tp ?? 0, rr ?? 0, reason ?? '', confluenceJson).run();

    return c.json({ status: 'saved' });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── History: Get Past Signals ────────────────────────────────────

signalsRoutes.get('/history/:symbol', async (c) => {
  try {
    const symbol = c.req.param('symbol').toUpperCase();
    const limit = parseInt(c.req.query('limit') ?? '20', 10);
    const timeframe = c.req.query('timeframe')?.toUpperCase();

    let query = `SELECT * FROM signal_history WHERE symbol = ?`;
    const params: any[] = [symbol];

    if (timeframe) {
      query += ` AND timeframe = ?`;
      params.push(timeframe);
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const { results } = await c.env.DB.prepare(query).bind(...params).all();

    return c.json({ status: 'ok', data: results });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── History: Accuracy Stats ──────────────────────────────────────

signalsRoutes.get('/history/:symbol/stats', async (c) => {
  try {
    const symbol = c.req.param('symbol').toUpperCase();
    const timeframe = c.req.query('timeframe')?.toUpperCase();

    // Overall stats
    let query = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN result = 'hit_tp' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN result = 'hit_sl' THEN 1 ELSE 0 END) as losses,
        SUM(CASE WHEN result = 'open' THEN 1 ELSE 0 END) as open_count,
        ROUND(AVG(rr), 2) as avgRR
      FROM signal_history
      WHERE symbol = ? AND result IN ('hit_tp', 'hit_sl', 'open')`;
    const params: any[] = [symbol];

    if (timeframe) {
      query += ` AND timeframe = ?`;
      params.push(timeframe);
    }

    const { results } = await c.env.DB.prepare(query).bind(...params).all();
    const row = results[0] as any;
    const total = row?.total ?? 0;
    const wins = row?.wins ?? 0;
    const losses = row?.losses ?? 0;
    const openCount = row?.open_count ?? 0;
    const avgRR = row?.avgRR ?? 0;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

    // Per-bias breakdown
    let biasQuery = `
      SELECT
        bias,
        COUNT(*) as total,
        SUM(CASE WHEN result = 'hit_tp' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN result = 'hit_sl' THEN 1 ELSE 0 END) as losses
      FROM signal_history
      WHERE symbol = ? AND result IN ('hit_tp', 'hit_sl')`;
    const biasParams: any[] = [symbol];

    if (timeframe) {
      biasQuery += ` AND timeframe = ?`;
      biasParams.push(timeframe);
    }

    biasQuery += ` GROUP BY bias`;

    const { results: biasResults } = await c.env.DB.prepare(biasQuery).bind(...biasParams).all();
    const byBias: Record<string, any> = {};
    for (const bRow of (biasResults || [])) {
      const b = bRow as any;
      byBias[b.bias] = {
        total: b.total,
        wins: b.wins,
        losses: b.losses,
        winRate: b.total > 0 ? Math.round((b.wins / b.total) * 100) : 0,
      };
    }

    // Confidence calibration (group by confidence ranges)
    let calQuery = `
      SELECT
        CASE
          WHEN confidence >= 80 THEN '80-100'
          WHEN confidence >= 60 THEN '60-79'
          ELSE 'below-60'
        END as band,
        COUNT(*) as total,
        SUM(CASE WHEN result = 'hit_tp' THEN 1 ELSE 0 END) as wins
      FROM signal_history
      WHERE symbol = ? AND result IN ('hit_tp', 'hit_sl')`;
    const calParams: any[] = [symbol];

    if (timeframe) {
      calQuery += ` AND timeframe = ?`;
      calParams.push(timeframe);
    }

    calQuery += ` GROUP BY band`;

    const { results: calResults } = await c.env.DB.prepare(calQuery).bind(...calParams).all();
    const calibration: Record<string, any> = {};
    for (const cRow of (calResults || [])) {
      const c = cRow as any;
      calibration[c.band] = {
        total: c.total,
        wins: c.wins,
        actualWinRate: c.total > 0 ? Math.round((c.wins / c.total) * 100) : 0,
      };
    }

    return c.json({
      status: 'ok',
      data: {
        total,
        wins,
        losses,
        open: openCount,
        winRate,
        avgRR,
        byBias,
        calibration,
        minSignalsForCalibration: 10,
        ready: total >= 10,
      },
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── D1 Auto-Save Helper ──────────────────────────────────────────

async function saveSignalToHistory(db: D1Database, symbol: string, signal: Signal, timeframe: string): Promise<void> {
  const primarySetup = signal.setups[0];
  if (!primarySetup) return;

  // Dedup: skip if same bias + entry + sl + tp saved within last hour
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
  const dup = await db.prepare(
    `SELECT 1 FROM signal_history
     WHERE symbol = ? AND bias = ? AND entry = ? AND sl = ? AND tp = ? AND timeframe = ?
       AND created_at > ?
     LIMIT 1`
  ).bind(
    symbol,
    signal.bias,
    primarySetup.entry,
    primarySetup.sl,
    primarySetup.tp,
    timeframe,
    oneHourAgo,
  ).first();

  if (dup) return; // same signal exists in last hour, skip

  const confluenceJson = JSON.stringify(
    signal.setups.flatMap(s => s.confluence)
  );
  const reasonText = signal.reasoning.summary;

  await db.prepare(
    `INSERT INTO signal_history (symbol, bias, confidence, price, entry, sl, tp, rr, reason, confluence, timeframe)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    symbol,
    signal.bias,
    signal.confidence,
    signal.price,
    primarySetup.entry,
    primarySetup.sl,
    primarySetup.tp,
    primarySetup.rr,
    reasonText,
    confluenceJson,
    timeframe,
  ).run();
}

// ── Lazy Result Tracking ───────────────────────────────────────

async function closeOpenSignals(db: D1Database, symbol: string, currentPrice: number): Promise<void> {
  const { results } = await db.prepare(
    `SELECT id, entry, sl, tp, bias FROM signal_history WHERE symbol = ? AND result = 'open'`
  ).bind(symbol).all();

  if (!results || results.length === 0) return;

  const now = new Date().toISOString();

  for (const row of results) {
    const { id, entry, sl, tp, bias } = row as any;
    let newResult: string | null = null;

    if (bias === 'bullish') {
      // Long: TP hit if price >= tp, SL hit if price <= sl
      if (currentPrice >= tp) newResult = 'hit_tp';
      else if (currentPrice <= sl) newResult = 'hit_sl';
    } else if (bias === 'bearish') {
      // Short: TP hit if price <= tp, SL hit if price >= sl
      if (currentPrice <= tp) newResult = 'hit_tp';
      else if (currentPrice >= sl) newResult = 'hit_sl';
    }

    if (newResult) {
      await db.prepare(
        `UPDATE signal_history SET result = ?, closed_at = ? WHERE id = ?`
      ).bind(newResult, now, id).run();
    }
  }
}

// ── Manual Result Override ─────────────────────────────────────

signalsRoutes.post('/history/:id/result', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    const body = await c.req.json<{ result: string }>();
    const validResults = ['open', 'hit_tp', 'hit_sl'];

    if (!validResults.includes(body.result)) {
      return c.json({ error: `result must be one of: ${validResults.join(', ')}` }, 400);
    }

    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `UPDATE signal_history SET result = ?, closed_at = ? WHERE id = ?`
    ).bind(body.result, body.result === 'open' ? null : now, id).run();

    return c.json({ status: 'ok', id, result: body.result });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
