// indicators.js — Technical indicator calculations for crypto candles
// Input: array of { o, h, l, c, v, t } objects (oldest first)

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
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
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

function calcEMAValues(candles, period) {
  const ema = calcEMA(candles, period);
  return ema.length > 0 ? ema[ema.length - 1] : null;
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
  return { macd, signal: sig, histogram: macd - sig };
}

function calcBollingerBands(candles, period = 20, stdDevMult = 2) {
  if (candles.length < period) return { upper: null, middle: null, lower: null, width: null };
  const slice = candles.slice(-period);
  const mean = slice.reduce((s, c) => s + c.c, 0) / period;
  const variance = slice.reduce((s, c) => s + Math.pow(c.c - mean, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  const upper = mean + stdDevMult * stdDev;
  const lower = mean - stdDevMult * stdDev;
  return { upper, middle: mean, lower, width: (upper - lower) / mean };
}

function calcATR(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].h - candles[i].l,
      Math.abs(candles[i].h - candles[i - 1].c),
      Math.abs(candles[i].l - candles[i - 1].c)
    );
    trs.push(tr);
  }
  if (trs.length < period) return null;
  let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

function calcOBV(candles) {
  if (candles.length < 2) return { trend: 'neutral', value: 0 };
  let obv = 0;
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].c > candles[i - 1].c) obv += candles[i].v;
    else if (candles[i].c < candles[i - 1].c) obv -= candles[i].v;
  }
  const recent = candles.slice(-5);
  const obvTrend = recent.length >= 3 ? (recent[recent.length - 1].c > recent[0].c ? 'up' : 'down') : 'neutral';
  return { trend: obvTrend, value: obv };
}

function calcStochastic(candles, period = 14, smoothK = 3, smoothD = 3) {
  if (candles.length < period + smoothK + smoothD) return { k: null, d: null };
  const rawK = [];
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const high = Math.max(...slice.map(c => c.h));
    const low = Math.min(...slice.map(c => c.l));
    rawK.push(high === low ? 50 : ((candles[i].c - low) / (high - low)) * 100);
  }
  const kValues = [];
  for (let i = smoothK - 1; i < rawK.length; i++) {
    kValues.push(rawK.slice(i - smoothK + 1, i + 1).reduce((s, v) => s + v, 0) / smoothK);
  }
  const dValues = [];
  for (let i = smoothD - 1; i < kValues.length; i++) {
    dValues.push(kValues.slice(i - smoothD + 1, i + 1).reduce((s, v) => s + v, 0) / smoothD);
  }
  return {
    k: kValues.length > 0 ? kValues[kValues.length - 1] : null,
    d: dValues.length > 0 ? dValues[dValues.length - 1] : null,
  };
}

function calcVWAP(candles) {
  if (candles.length === 0) return null;
  let cumVolPrice = 0, cumVol = 0;
  for (const c of candles) {
    const tp = (c.h + c.l + c.c) / 3;
    cumVolPrice += tp * c.v;
    cumVol += c.v;
  }
  return cumVol > 0 ? cumVolPrice / cumVol : null;
}

function getTechnicals(candles) {
  const rsi = calcRSI(candles);
  const macd = calcMACD(candles);
  const bb = calcBollingerBands(candles);
  const atr = calcATR(candles);
  const obv = calcOBV(candles);
  const stoch = calcStochastic(candles);
  const ema20 = calcEMAValues(candles, 20);
  const ema50 = calcEMAValues(candles, 50);
  const ema200 = calcEMAValues(candles, 200);
  const vwap = calcVWAP(candles);
  const price = candles[candles.length - 1]?.c;

  // Trend from EMAs
  let trend = 'neutral';
  if (ema20 && ema50) {
    trend = ema20 > ema50 ? 'bullish' : 'bearish';
  }

  // RSI zones
  let rsiZone = 'neutral';
  if (rsi !== null) {
    if (rsi > 70) rsiZone = 'overbought';
    else if (rsi < 30) rsiZone = 'oversold';
    else if (rsi > 60) rsiZone = 'bullish';
    else if (rsi < 40) rsiZone = 'bearish';
  }

  return {
    rsi: rsi !== null ? Math.round(rsi * 10) / 10 : null,
    rsiZone,
    macd: macd.macd !== null ? Math.round(macd.macd * 1e8) / 1e8 : null,
    macdSignal: macd.signal !== null ? Math.round(macd.signal * 1e8) / 1e8 : null,
    macdHist: macd.histogram !== null ? Math.round(macd.histogram * 1e8) / 1e8 : null,
    bbUpper: bb.upper,
    bbMiddle: bb.middle,
    bbLower: bb.lower,
    bbWidth: bb.width,
    atr,
    atrPct: price > 0 ? (atr / price * 100) : null,
    obvTrend: obv.trend,
    stochK: stoch.k !== null ? Math.round(stoch.k * 10) / 10 : null,
    stochD: stoch.d !== null ? Math.round(stoch.d * 10) / 10 : null,
    ema20, ema50, ema200,
    vwap,
    price,
    trend,
  };
}

module.exports = {
  calcRSI, calcEMA, calcMACD, calcBollingerBands, calcATR,
  calcOBV, calcStochastic, calcVWAP, getTechnicals
};
