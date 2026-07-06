// smc-analysis.js — Smart Money Concepts analysis for crypto candles
// Input: array of { o, h, l, c, v, t } objects (oldest first)

function findSwings(candles, lookback = 3) {
  const swingHighs = [];
  const swingLows = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true, isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i].h <= candles[i - j].h || candles[i].h <= candles[i + j].h) isHigh = false;
      if (candles[i].l >= candles[i - j].l || candles[i].l >= candles[i + j].l) isLow = false;
    }
    if (isHigh) swingHighs.push({ index: i, price: candles[i].h, time: candles[i].t });
    if (isLow) swingLows.push({ index: i, price: candles[i].l, time: candles[i].t });
  }

  return { swingHighs, swingLows };
}

function detectBOS(candles, swings) { // Break of Structure
  const { swingHighs, swingLows } = swings;
  const signals = [];

  // Bullish BOS: price breaks above previous swing high
  for (const sh of swingHighs) {
    const futureCandles = candles.slice(sh.index + 1);
    for (const fc of futureCandles) {
      if (fc.c > sh.price) {
        signals.push({ type: 'bullish_bos', level: sh.price, time: fc.t });
        break;
      }
    }
  }

  // Bearish BOS: price breaks below previous swing low
  for (const sl of swingLows) {
    const futureCandles = candles.slice(sl.index + 1);
    for (const fc of futureCandles) {
      if (fc.c < sl.price) {
        signals.push({ type: 'bearish_bos', level: sl.price, time: fc.t });
        break;
      }
    }
  }

  return signals.slice(-5); // Last 5 BOS signals
}

function detectCHoCH(candles, swings) { // Change of Character
  const { swingHighs, swingLows } = swings;
  const signals = [];

  if (swingLows.length < 2 || swingHighs.length < 2) return signals;

  // Bullish CHoCH: higher high after series of lower lows
  const recentLows = swingLows.slice(-3);
  if (recentLows.length >= 2) {
    const lastLow = recentLows[recentLows.length - 1];
    const prevLow = recentLows[recentLows.length - 2];
    // Check if we were making lower lows before
    for (let i = recentLows.length - 2; i >= 1; i--) {
      if (recentLows[i].price < recentLows[i - 1].price) {
        // Was in downtrend, now check for bullish CHoCH
        const lastHigh = swingHighs[swingHighs.length - 1];
        const prevHigh = swingHighs.length >= 2 ? swingHighs[swingHighs.length - 2] : null;
        if (prevHigh && lastHigh.price > prevHigh.price) {
          signals.push({ type: 'bullish_choch', level: prevHigh.price, time: lastHigh.time });
        }
        break;
      }
    }
  }

  // Bearish CHoCH: lower low after series of higher lows
  const recentHighs = swingHighs.slice(-3);
  if (recentHighs.length >= 2) {
    for (let i = recentHighs.length - 2; i >= 1; i--) {
      if (recentHighs[i].price > recentHighs[i - 1].price) {
        const lastLow = swingLows[swingLows.length - 1];
        const prevLow = swingLows.length >= 2 ? swingLows[swingLows.length - 2] : null;
        if (prevLow && lastLow.price < prevLow.price) {
          signals.push({ type: 'bearish_choch', level: prevLow.price, time: lastLow.time });
        }
        break;
      }
    }
  }

  return signals.slice(-3);
}

function findFVGs(candles) { // Fair Value Gaps
  const fvgs = [];
  for (let i = 2; i < candles.length; i++) {
    // Bullish FVG: gap between candle[0].high and candle[2].low
    if (candles[i - 2].h < candles[i].l) {
      fvgs.push({
        type: 'bullish_fvg',
        top: candles[i].l,
        bottom: candles[i - 2].h,
        time: candles[i - 1].t,
        filled: false,
      });
    }
    // Bearish FVG: gap between candle[2].high and candle[0].low
    if (candles[i - 2].l > candles[i].h) {
      fvgs.push({
        type: 'bearish_fvg',
        top: candles[i - 2].l,
        bottom: candles[i].h,
        time: candles[i - 1].t,
        filled: false,
      });
    }
  }

  // Check which FVGs are filled
  const price = candles[candles.length - 1]?.c;
  for (const fvg of fvgs) {
    if (fvg.type === 'bullish_fvg' && price <= fvg.bottom) fvg.filled = true;
    if (fvg.type === 'bearish_fvg' && price >= fvg.top) fvg.filled = true;
  }

  return fvgs.filter(f => !f.filled).slice(-5); // Last 5 unfilled FVGs
}

function findOrderBlocks(candles, swings) {
  const { swingHighs, swingLows } = swings;
  const obs = [];

  // Bullish OB: last bearish candle before bullish impulse (swing low)
  for (const sl of swingLows.slice(-5)) {
    for (let i = sl.index - 1; i >= Math.max(0, sl.index - 5); i--) {
      if (candles[i].c < candles[i].o) { // Bearish candle
        obs.push({
          type: 'bullish_ob',
          high: candles[i].h,
          low: candles[i].l,
          time: candles[i].t,
          mitigation: false,
        });
        break;
      }
    }
  }

  // Bearish OB: last bullish candle before bearish impulse (swing high)
  for (const sh of swingHighs.slice(-5)) {
    for (let i = sh.index - 1; i >= Math.max(0, sh.index - 5); i--) {
      if (candles[i].c > candles[i].o) { // Bullish candle
        obs.push({
          type: 'bearish_ob',
          high: candles[i].h,
          low: candles[i].l,
          time: candles[i].t,
          mitigation: false,
        });
        break;
      }
    }
  }

  // Check mitigation
  const price = candles[candles.length - 1]?.c;
  for (const ob of obs) {
    if (ob.type === 'bullish_ob' && price < ob.low) ob.mitigation = true;
    if (ob.type === 'bearish_ob' && price > ob.high) ob.mitigation = true;
  }

  return obs.filter(o => !o.mitigation).slice(-5);
}

function getSMCAnalysis(candles) {
  const swings = findSwings(candles, 3);
  const bos = detectBOS(candles, swings);
  const choch = detectCHoCH(candles, swings);
  const fvgs = findFVGs(candles);
  const orderBlocks = findOrderBlocks(candles, swings);

  // Determine structure bias
  let structureBias = 'neutral';
  const lastBOS = bos[bos.length - 1];
  const lastCHoCH = choch[choch.length - 1];

  if (lastCHoCH) {
    structureBias = lastCHoCH.type === 'bullish_choch' ? 'bullish' : 'bearish';
  } else if (lastBOS) {
    structureBias = lastBOS.type === 'bullish_bos' ? 'bullish' : 'bearish';
  }

  // Liquidity zones (from swing points)
  const liquidityZones = [];
  for (const sh of swings.swingHighs.slice(-3)) {
    liquidityZones.push({ type: 'buy_side', price: sh.price, time: sh.time });
  }
  for (const sl of swings.swingLows.slice(-3)) {
    liquidityZones.push({ type: 'sell_side', price: sl.price, time: sl.time });
  }

  return {
    bias: structureBias,
    swings: {
      highs: swings.swingHighs.slice(-5).map(s => ({ price: s.price, time: s.time })),
      lows: swings.swingLows.slice(-5).map(s => ({ price: s.price, time: s.time })),
    },
    bos: bos.slice(-3),
    choch: choch.slice(-2),
    fvgs,
    orderBlocks,
    liquidityZones,
  };
}

module.exports = {
  findSwings, detectBOS, detectCHoCH, findFVGs, findOrderBlocks, getSMCAnalysis
};
