// vps-api/smc-analysis.js

function detectSwings(candles) {
  const swings = [];
  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    const isHigh = 
      c.high > candles[i - 1].high && c.high > candles[i + 1].high &&
      c.high > candles[i - 2].high && c.high > candles[i + 2].high;
    const isLow = 
      c.low < candles[i - 1].low && c.low < candles[i + 1].low &&
      c.low < candles[i - 2].low && c.low < candles[i + 2].low;

    if (isHigh) swings.push({ price: c.high, type: 'SH', time: c.timestamp, index: i });
    if (isLow) swings.push({ price: c.low, type: 'SL', time: c.timestamp, index: i });
  }

  // Classify HH/HL/LH/LL
  const classified = [];
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

function detectFVGs(candles) {
  const fvgs = [];
  for (let i = 2; i < candles.length; i++) {
    if (candles[i].low > candles[i - 2].high) {
      fvgs.push({
        type: 'bull',
        top: candles[i].low,
        bottom: candles[i - 2].high,
        time: candles[i - 1].timestamp,
        gap: candles[i].low - candles[i - 2].high,
      });
    }
    if (candles[i].high < candles[i - 2].low) {
      fvgs.push({
        type: 'bear',
        top: candles[i - 2].low,
        bottom: candles[i].high,
        time: candles[i - 1].timestamp,
        gap: candles[i - 2].low - candles[i].high,
      });
    }
  }
  return fvgs;
}

function detectOBs(candles) {
  const obs = [];
  for (let i = 2; i < candles.length; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const body = Math.abs(prev.close - prev.open);
    const move = curr.high - curr.low;

    if (move > body * 2 && body > 0) {
      if (prev.close < prev.open) {
        obs.push({ type: 'bull_ob', high: prev.open, low: prev.low, time: prev.timestamp });
      } else {
        obs.push({ type: 'bear_ob', high: prev.high, low: prev.close, time: prev.timestamp });
      }
    }
  }
  return obs;
}

function detectBOS(swings) {
  if (swings.length < 2) return { bos: false, choch: false };
  
  const lastTwo = swings.slice(-2);
  const prevTwo = swings.slice(-4, -2);
  
  if (prevTwo.length < 2) return { bos: false, choch: false };
  
  // Bullish BOS: price breaks above previous swing high
  const bullishBOS = lastTwo[1].type === 'HH' && lastTwo[0].type === 'HL';
  
  // Bearish BOS: price breaks below previous swing low
  const bearishBOS = lastTwo[1].type === 'LL' && lastTwo[0].type === 'LH';
  
  // CHoCH: first break against prevailing trend
  const prevTrend = prevTwo[1].type === 'HH' || prevTwo[1].type === 'HL' ? 'bullish' : 'bearish';
  const currentTrend = lastTwo[1].type === 'HH' || lastTwo[1].type === 'HL' ? 'bullish' : 'bearish';
  const choch = prevTrend !== currentTrend;
  
  return { bos: bullishBOS || bearishBOS, choch };
}

function getTrend(swings) {
  const recent = swings.slice(-8);
  const hh = recent.filter(s => s.type === 'HH').length;
  const hl = recent.filter(s => s.type === 'HL').length;
  const lh = recent.filter(s => s.type === 'LH').length;
  const ll = recent.filter(s => s.type === 'LL').length;

  if (hh + hl > lh + ll) return 'bullish';
  if (lh + ll > hh + hl) return 'bearish';
  return 'neutral';
}

function getZone(price, high, low) {
  const mid = (high + low) / 2;
  const range = high - low;
  if (price > mid + range * 0.1) return 'premium';
  if (price < mid - range * 0.1) return 'discount';
  return 'equilibrium';
}

module.exports = {
  detectSwings,
  detectFVGs,
  detectOBs,
  detectBOS,
  getTrend,
  getZone,
};
