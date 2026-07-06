// xau-deep-analysis.js — Deep analysis engine for XAU/USD
// Combines SMC + Technical + Volume + Key Levels + Predictions

const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost', port: 5432, database: 'aegis_terminal',
  user: 'aegis', password: 'aegis_terminal_2026',
});

// ─── Get Candles ──────────────────────────────────────────
async function getCandles(symbol, timeframe, limit = 100) {
  const result = await pool.query(
    `SELECT open as o, high as h, low as l, close as c, volume as v, timestamp as t
     FROM historical_ohlc
     WHERE symbol = $1 AND timeframe = $2
     ORDER BY timestamp ASC
     LIMIT $3`,
    [symbol, timeframe, limit]
  );
  return result.rows.map(r => ({
    o: parseFloat(r.o), h: parseFloat(r.h), l: parseFloat(r.l),
    c: parseFloat(r.c), v: parseFloat(r.v), t: parseInt(r.t),
  }));
}

// ─── Technical Indicators ─────────────────────────────────
function calcRSI(candles, period = 14) {
  if (candles.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].c - candles[i - 1].c;
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].c - candles[i - 1].c;
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return Math.round((100 - (100 / (1 + avgGain / avgLoss))) * 10) / 10;
}

function calcEMA(candles, period) {
  if (candles.length < period) return [];
  const k = 2 / (period + 1);
  const ema = [candles.slice(0, period).reduce((s, c) => s + c.c, 0) / period];
  for (let i = period; i < candles.length; i++) {
    ema.push(candles[i].c * k + ema[ema.length - 1] * (1 - k));
  }
  return ema;
}

function calcMACD(candles, fast = 12, slow = 26, signal = 9) {
  if (candles.length < slow + signal) return { macd: null, signal: null, histogram: null };
  const emaFast = calcEMA(candles, fast);
  const emaSlow = calcEMA(candles, slow);
  const offset = slow - fast;
  const macdLine = [];
  for (let i = 0; i < emaSlow.length; i++) {
    macdLine.push(emaFast[i + offset] - emaSlow[i]);
  }
  const signalLine = calcEMA(macdLine.map(v => ({ c: v })), signal);
  if (macdLine.length === 0 || signalLine.length === 0) return { macd: null, signal: null, histogram: null };
  const macd = macdLine[macdLine.length - 1];
  const sig = signalLine[signalLine.length - 1];
  return { macd: Math.round(macd * 100) / 100, signal: Math.round(sig * 100) / 100, histogram: Math.round((macd - sig) * 100) / 100 };
}

function calcBollinger(candles, period = 20, stdDev = 2) {
  if (candles.length < period) return null;
  const recent = candles.slice(-period);
  const avg = recent.reduce((s, c) => s + c.c, 0) / period;
  const variance = recent.reduce((s, c) => s + Math.pow(c.c - avg, 2), 0) / period;
  const std = Math.sqrt(variance);
  return {
    upper: Math.round((avg + stdDev * std) * 100) / 100,
    middle: Math.round(avg * 100) / 100,
    lower: Math.round((avg - stdDev * std) * 100) / 100,
    width: Math.round(((avg + stdDev * std) - (avg - stdDev * std)) / avg * 10000) / 100,
  };
}

function calcATR(candles, period = 14) {
  if (candles.length < period + 1) return null;
  let atr = 0;
  for (let i = 1; i <= period; i++) {
    atr += Math.max(candles[i].h - candles[i].l, Math.abs(candles[i].h - candles[i - 1].c), Math.abs(candles[i].l - candles[i - 1].c));
  }
  atr /= period;
  for (let i = period + 1; i < candles.length; i++) {
    const tr = Math.max(candles[i].h - candles[i].l, Math.abs(candles[i].h - candles[i - 1].c), Math.abs(candles[i].l - candles[i - 1].c));
    atr = (atr * (period - 1) + tr) / period;
  }
  return Math.round(atr * 100) / 100;
}

// ─── SMC Analysis ─────────────────────────────────────────
function findSwings(candles, lookback = 3) {
  const swingHighs = [], swingLows = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true, isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i].h <= candles[i - j].h || candles[i].h <= candles[i + j].h) isHigh = false;
      if (candles[i].l >= candles[i - j].l || candles[i].l >= candles[i + j].l) isLow = false;
    }
    if (isHigh) swingHighs.push({ price: candles[i].h, time: candles[i].t });
    if (isLow) swingLows.push({ price: candles[i].l, time: candles[i].t });
  }
  return { swingHighs, swingLows };
}

function detectBOS(candles, swings) {
  const { swingHighs, swingLows } = swings;
  const signals = [];
  for (const sh of swingHighs) {
    for (const fc of candles.slice(-20)) {
      if (fc.c > sh.price) { signals.push({ type: 'bullish_bos', level: sh.price, time: fc.t }); break; }
    }
  }
  for (const sl of swingLows) {
    for (const fc of candles.slice(-20)) {
      if (fc.c < sl.price) { signals.push({ type: 'bearish_bos', level: sl.price, time: fc.t }); break; }
    }
  }
  return signals.slice(-3);
}

function detectFVGs(candles) {
  const fvgs = [];
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2], c3 = candles[i];
    if (c3.l > c1.h) fvgs.push({ type: 'bullish_fvg', top: c3.l, bottom: c1.h, time: c3.t });
    if (c1.l > c3.h) fvgs.push({ type: 'bearish_fvg', top: c1.l, bottom: c3.h, time: c3.t });
  }
  return fvgs.slice(-5);
}

function detectOrderBlocks(candles) {
  const obs = [];
  for (let i = 3; i < candles.length; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    // Bullish OB: bearish candle followed by strong bullish move
    if (prev.c < prev.o && curr.c > curr.o && (curr.c - curr.o) > (prev.o - prev.c) * 1.5) {
      obs.push({ type: 'bullish_ob', top: prev.o, bottom: prev.l, time: prev.t });
    }
    // Bearish OB: bullish candle followed by strong bearish move
    if (prev.c > prev.o && curr.c < curr.o && (curr.o - curr.c) > (prev.c - prev.o) * 1.5) {
      obs.push({ type: 'bearish_ob', top: prev.h, bottom: prev.o, time: prev.t });
    }
  }
  return obs.slice(-5);
}

// ─── Key Levels ───────────────────────────────────────────
function findKeyLevels(candles, swings) {
  const { swingHighs, swingLows } = swings;
  const currentPrice = candles[candles.length - 1].c;

  // Get unique levels
  const levels = new Set();
  swingHighs.forEach(s => levels.add(s.price));
  swingLows.forEach(s => levels.add(s.price));

  // Add round numbers
  const roundBase = Math.floor(currentPrice / 100) * 100;
  for (let i = -2; i <= 2; i++) levels.add(roundBase + i * 100);

  // Sort and categorize
  const sorted = [...levels].sort((a, b) => a - b);
  const support = sorted.filter(l => l < currentPrice).slice(-3);
  const resistance = sorted.filter(l => l > currentPrice).slice(0, 3);

  return {
    support: support.map(l => ({ price: Math.round(l * 100) / 100, strength: l > currentPrice * 0.995 ? 'strong' : 'moderate' })),
    resistance: resistance.map(l => ({ price: Math.round(l * 100) / 100, strength: l < currentPrice * 1.005 ? 'strong' : 'moderate' })),
  };
}

// ─── Volume Analysis ──────────────────────────────────────
function analyzeVolume(candles) {
  if (candles.length < 20) return null;
  const recent = candles.slice(-20);
  const avgVol = recent.reduce((s, c) => s + c.v, 0) / recent.length;
  const lastVol = recent[recent.length - 1].v;
  const last5Vol = recent.slice(-5).reduce((s, c) => s + c.v, 0) / 5;
  const prev5Vol = recent.slice(-10, -5).reduce((s, c) => s + c.v, 0) / 5;

  let trend = 'normal';
  if (last5Vol > prev5Vol * 1.5) trend = 'increasing';
  if (last5Vol < prev5Vol * 0.6) trend = 'decreasing';

  // OBV trend
  let obvUp = 0, obvDown = 0;
  for (let i = recent.length - 10; i < recent.length; i++) {
    if (recent[i].c > recent[i - 1].c) obvUp += recent[i].v;
    else obvDown += recent[i].v;
  }

  return {
    average: Math.round(avgVol * 100) / 100,
    current: Math.round(lastVol * 100) / 100,
    ratio: Math.round(lastVol / avgVol * 100) / 100,
    trend,
    obvBias: obvUp > obvDown * 1.2 ? 'bullish' : obvDown > obvUp * 1.2 ? 'bearish' : 'neutral',
  };
}

// ─── Trend Detection ──────────────────────────────────────
function detectTrend(candles) {
  if (candles.length < 50) return { direction: 'unknown', strength: 0 };

  const ema20 = calcEMA(candles, 20);
  const ema50 = calcEMA(candles, 50);
  const ema200 = calcEMA(candles, 200);

  const price = candles[candles.length - 1].c;
  let score = 0;

  // EMA alignment
  if (ema20.length > 0 && ema20[ema20.length - 1] > price) score -= 1;
  if (ema20.length > 0 && ema20[ema20.length - 1] < price) score += 1;
  if (ema50.length > 0 && ema50[ema50.length - 1] > price) score -= 1;
  if (ema50.length > 0 && ema50[ema50.length - 1] < price) score += 1;
  if (ema200.length > 0 && ema200[ema200.length - 1] > price) score -= 2;
  if (ema200.length > 0 && ema200[ema200.length - 1] < price) score += 2;

  // EMA cross
  if (ema20.length > 0 && ema50.length > 0) {
    if (ema20[ema20.length - 1] > ema50[ema50.length - 1]) score += 1;
    else score -= 1;
  }

  const direction = score > 0 ? 'bullish' : score < 0 ? 'bearish' : 'neutral';
  const strength = Math.min(Math.abs(score) / 5 * 100, 100);

  return { direction, strength: Math.round(strength), score };
}

// ─── Predictions ──────────────────────────────────────────
function generatePrediction(candles, trend, tech, levels, atr) {
  const price = candles[candles.length - 1].c;
  const recentHigh = Math.max(...candles.slice(-10).map(c => c.h));
  const recentLow = Math.min(...candles.slice(-10).map(c => c.l));

  // ATR-based range
  const expectedRange = atr ? atr * 1.2 : price * 0.01;

  // Scenarios based on trend + key levels
  const scenarios = [];

  if (trend.direction === 'bullish') {
    // Scenario A: Continue bullish
    const target = levels.resistance[0]?.price || price + expectedRange;
    const invalidation = levels.support[0]?.price || price - expectedRange;
    scenarios.push({
      name: 'Bullish Continuation',
      probability: 55 + trend.strength * 0.2,
      entry: price,
      target,
      invalidation,
      riskReward: Math.round((target - price) / (price - invalidation) * 100) / 100,
    });
    // Scenario B: Pullback
    const pullbackTarget = levels.support[0]?.price || price - expectedRange * 0.5;
    scenarios.push({
      name: 'Pullback to Support',
      probability: 30,
      entry: pullbackTarget,
      target: price + expectedRange * 0.5,
      invalidation: pullbackTarget - expectedRange * 0.5,
      riskReward: Math.round(((price + expectedRange * 0.5) - pullbackTarget) / (pullbackTarget - (pullbackTarget - expectedRange * 0.5)) * 100) / 100,
    });
  } else if (trend.direction === 'bearish') {
    // Scenario A: Continue bearish
    const target = levels.support[0]?.price || price - expectedRange;
    const invalidation = levels.resistance[0]?.price || price + expectedRange;
    scenarios.push({
      name: 'Bearish Continuation',
      probability: 55 + trend.strength * 0.2,
      entry: price,
      target,
      invalidation,
      riskReward: Math.round((price - target) / (invalidation - price) * 100) / 100,
    });
    // Scenario B: Bounce
    const bounceTarget = levels.resistance[0]?.price || price + expectedRange * 0.5;
    scenarios.push({
      name: 'Bounce from Support',
      probability: 30,
      entry: bounceTarget,
      target: price - expectedRange * 0.5,
      invalidation: bounceTarget + expectedRange * 0.5,
      riskReward: Math.round((bounceTarget - (price - expectedRange * 0.5)) / ((bounceTarget + expectedRange * 0.5) - bounceTarget) * 100) / 100,
    });
  } else {
    // Ranging
    scenarios.push({
      name: 'Range Play - Long',
      probability: 45,
      entry: levels.support[0]?.price || price - expectedRange * 0.5,
      target: levels.resistance[0]?.price || price + expectedRange * 0.5,
      invalidation: (levels.support[0]?.price || price - expectedRange * 0.5) - expectedRange * 0.3,
      riskReward: 1.5,
    });
    scenarios.push({
      name: 'Range Play - Short',
      probability: 45,
      entry: levels.resistance[0]?.price || price + expectedRange * 0.5,
      target: levels.support[0]?.price || price - expectedRange * 0.5,
      invalidation: (levels.resistance[0]?.price || price + expectedRange * 0.5) + expectedRange * 0.3,
      riskReward: 1.5,
    });
  }

  // Normalize probabilities
  const totalProb = scenarios.reduce((s, sc) => s + sc.probability, 0);
  scenarios.forEach(sc => sc.probability = Math.round(sc.probability / totalProb * 100));

  return {
    expectedHigh: Math.round((price + expectedRange) * 100) / 100,
    expectedLow: Math.round((price - expectedRange) * 100) / 100,
    currentPrice: price,
    expectedRange: Math.round(expectedRange * 100) / 100,
    scenarios: scenarios.sort((a, b) => b.probability - a.probability),
  };
}

// ─── Main Analysis ────────────────────────────────────────
async function analyzeXAUUSD(timeframe = 'D1') {
  console.log(`[XAU Analysis] Running deep analysis for ${timeframe}...`);

  // Fetch candles for multiple timeframes
  const [d1Candles, h4Candles, h1Candles] = await Promise.all([
    getCandles('XAUUSD', 'D1', 200),
    getCandles('XAUUSD', 'H4', 100),
    getCandles('XAUUSD', 'H1', 100),
  ]);

  if (d1Candles.length < 30) {
    console.log('[XAU Analysis] Insufficient data');
    return null;
  }


  // Fetch live price from MT5 Feed API
  let livePrice = d1Candles[d1Candles.length - 1].c;
  try {
    const resp = await fetch("https://mt5-feed.aegisterminal.app/price?symbol=XAUUSD", {
      headers: { "X-API-Key": "ThLNeGzMMCRcPsLSicfq9OCHkfIiJdrcVJaN0d8d9Mo" }
    });
    const priceData = await resp.json();
    if (priceData.bid) livePrice = parseFloat(priceData.bid);
  } catch (e) { console.log("[XAU] MT5 price fetch failed, using D1 close"); }

  const currentPrice = livePrice;

  // Trend analysis
  const d1Trend = detectTrend(d1Candles);
  const h4Trend = detectTrend(h4Candles);
  const h1Trend = detectTrend(h1Candles);

  // Technical indicators
  const rsi = calcRSI(d1Candles);
  const macd = calcMACD(d1Candles);
  const bb = calcBollinger(d1Candles);
  const atr = calcATR(d1Candles);

  // SMC analysis
  const d1Swings = findSwings(d1Candles);
  const d1BOS = detectBOS(d1Candles, d1Swings);
  const d1FVGs = detectFVGs(d1Candles);
  const d1OBs = detectOrderBlocks(d1Candles);

  const h4Swings = findSwings(h4Candles);
  const h4BOS = detectBOS(h4Candles, h4Swings);
  const h4FVGs = detectFVGs(h4Candles);
  const h4OBs = detectOrderBlocks(h4Candles);

  // Key levels
  const keyLevels = findKeyLevels(d1Candles, d1Swings);

  // Volume analysis
  const d1Volume = analyzeVolume(d1Candles);
  const h4Volume = analyzeVolume(h4Candles);

  // Generate prediction
  const prediction = generatePrediction(d1Candles, d1Trend, { rsi, macd, bb }, keyLevels, atr);

  // Confluence score
  let bullishCount = 0, bearishCount = 0;
  if (d1Trend.direction === 'bullish') bullishCount++;
  if (d1Trend.direction === 'bearish') bearishCount++;
  if (h4Trend.direction === 'bullish') bullishCount++;
  if (h4Trend.direction === 'bearish') bearishCount++;
  if (rsi && rsi > 50) bullishCount++;
  if (rsi && rsi < 50) bearishCount++;
  if (macd.histogram > 0) bullishCount++;
  if (macd.histogram < 0) bearishCount++;
  if (d1Volume?.obvBias === 'bullish') bullishCount++;
  if (d1Volume?.obvBias === 'bearish') bearishCount++;

  const overallBias = bullishCount > bearishCount ? 'bullish' : bearishCount > bullishCount ? 'bearish' : 'neutral';
  const confluenceScore = Math.round(Math.max(bullishCount, bearishCount) / (bullishCount + bearishCount) * 100);

  const result = {
    symbol: 'XAUUSD',
    currentPrice,
    timestamp: new Date().toISOString(),

    // Overall assessment
    bias: overallBias,
    confluenceScore,

    // Trend analysis
    trend: {
      daily: d1Trend,
      h4: h4Trend,
      h1: h1Trend,
    },

    // Technical indicators
    technicals: {
      rsi: { value: rsi, interpretation: rsi > 70 ? 'overbought' : rsi < 30 ? 'oversold' : rsi > 55 ? 'bullish' : rsi < 45 ? 'bearish' : 'neutral' },
      macd: { ...macd, interpretation: macd.histogram > 0 ? 'bullish' : macd.histogram < 0 ? 'bearish' : 'neutral' },
      bollinger: bb,
      atr,
    },

    // SMC analysis
    smc: {
      daily: {
        swings: d1Swings,
        bos: d1BOS,
        fvgs: d1FVGs,
        orderBlocks: d1OBs,
      },
      h4: {
        swings: h4Swings,
        bos: h4BOS,
        fvgs: h4FVGs,
        orderBlocks: h4OBs,
      },
    },

    // Key levels
    keyLevels,

    // Volume
    volume: {
      daily: d1Volume,
      h4: h4Volume,
    },

    // Prediction
    prediction,
  };

  console.log(`[XAU Analysis] Bias: ${overallBias} (${confluenceScore}%) | RSI: ${rsi} | ATR: ${atr}`);
  return result;
}

module.exports = { analyzeXAUUSD, pool };
