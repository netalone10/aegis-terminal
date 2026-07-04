// vps-api/indicators.js
// Pure utility module — no external dependencies beyond basic math.

function calcEMA(data, period) {
  if (data.length < period) return [];
  const multiplier = 2 / (period + 1);
  const ema = [data.slice(0, period).reduce((a, b) => a + b, 0) / period];

  for (let i = period; i < data.length; i++) {
    ema.push(data[i] * multiplier + ema[ema.length - 1] * (1 - multiplier));
  }
  return ema;
}

function calcSMA(data, period) {
  if (data.length < period) return [];
  const sma = [];
  for (let i = period - 1; i < data.length; i++) {
    sma.push(data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period);
  }
  return sma;
}

function calcRSI(candles, period = 14) {
  if (candles.length < period + 1) return null;

  const changes = [];
  for (let i = 1; i < candles.length; i++) {
    changes.push(candles[i].close - candles[i - 1].close);
  }

  const gains = changes.filter(c => c > 0);
  const losses = changes.filter(c => c < 0).map(c => Math.abs(c));

  const avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calcMACD(candles, fast = 12, slow = 26, signal = 9) {
  if (candles.length < slow + signal) return null;

  const closes = candles.map(c => c.close);
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);

  // Align arrays
  const offset = slow - fast;
  const macdLine = [];
  for (let i = 0; i < emaSlow.length; i++) {
    macdLine.push(emaFast[i + offset] - emaSlow[i]);
  }

  const signalLine = calcEMA(macdLine, signal);
  const histogram = macdLine[macdLine.length - 1] - signalLine[signalLine.length - 1];

  return {
    macd: macdLine[macdLine.length - 1],
    signal: signalLine[signalLine.length - 1],
    histogram,
  };
}

function calcBollingerBands(candles, period = 20, stdDev = 2) {
  if (candles.length < period) return null;

  const closes = candles.map(c => c.close);
  const sma = calcSMA(closes, period);
  const lastSma = sma[sma.length - 1];

  const recentCloses = closes.slice(-period);
  const variance = recentCloses.reduce((sum, c) => sum + Math.pow(c - lastSma, 2), 0) / period;
  const std = Math.sqrt(variance);

  return {
    upper: lastSma + stdDev * std,
    middle: lastSma,
    lower: lastSma - stdDev * std,
    bandwidth: (stdDev * std * 2) / lastSma,
  };
}

function calcATR(candles, period = 14) {
  if (candles.length < period + 1) return null;

  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const pc = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - pc.close),
      Math.abs(c.low - pc.close)
    );
    trs.push(tr);
  }

  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcOBV(candles) {
  if (candles.length < 2) return [];

  const obv = [0];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) {
      obv.push(obv[obv.length - 1] + candles[i].volume);
    } else if (candles[i].close < candles[i - 1].close) {
      obv.push(obv[obv.length - 1] - candles[i].volume);
    } else {
      obv.push(obv[obv.length - 1]);
    }
  }
  return obv;
}

function calcVWAP(candles) {
  if (candles.length === 0) return null;

  let cumulativeTPV = 0;
  let cumulativeVolume = 0;

  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumulativeTPV += tp * c.volume;
    cumulativeVolume += c.volume;
  }

  return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : null;
}

function calcVolumeProfile(candles, numBins = 20) {
  if (candles.length === 0) return null;

  const prices = candles.map(c => (c.high + c.low) / 2);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice;

  if (range === 0) return null;

  const binSize = range / numBins;
  const bins = Array(numBins).fill(0);

  for (let i = 0; i < candles.length; i++) {
    const binIndex = Math.min(Math.floor((prices[i] - minPrice) / binSize), numBins - 1);
    bins[binIndex] += candles[i].volume;
  }

  const maxVolume = Math.max(...bins);
  const pocIndex = bins.indexOf(maxVolume);
  const poc = minPrice + (pocIndex + 0.5) * binSize;

  // Value area (70% of volume)
  const totalVolume = bins.reduce((a, b) => a + b, 0);
  const targetVolume = totalVolume * 0.7;

  let accumulated = bins[pocIndex];
  let vaLow = pocIndex;
  let vaHigh = pocIndex;

  while (accumulated < targetVolume && (vaLow > 0 || vaHigh < numBins - 1)) {
    const lowVol = vaLow > 0 ? bins[vaLow - 1] : 0;
    const highVol = vaHigh < numBins - 1 ? bins[vaHigh + 1] : 0;

    if (lowVol >= highVol && vaLow > 0) {
      vaLow--;
      accumulated += bins[vaLow];
    } else if (vaHigh < numBins - 1) {
      vaHigh++;
      accumulated += bins[vaHigh];
    } else {
      break;
    }
  }

  return {
    poc,
    vah: minPrice + (vaHigh + 1) * binSize,
    val: minPrice + vaLow * binSize,
  };
}

module.exports = {
  calcEMA,
  calcSMA,
  calcRSI,
  calcMACD,
  calcBollingerBands,
  calcATR,
  calcOBV,
  calcVWAP,
  calcVolumeProfile,
};
