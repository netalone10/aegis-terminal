// vps-api/crypto-signal-engine.js
// Signal engine combining SMC analysis, technical indicators, and volume analysis
// into confluence-scored trading signals.

const { calcRSI, calcMACD, calcBollingerBands, calcATR, calcOBV, calcVWAP, calcVolumeProfile } = require('./indicators');
const { detectSwings, detectFVGs, detectOBs, detectBOS, getTrend, getZone } = require('./smc-analysis');

function analyzeSMC(candles) {
  const swings = detectSwings(candles);
  const fvgs = detectFVGs(candles);
  const obs = detectOBs(candles);
  const { bos, choch } = detectBOS(swings);
  const trend = getTrend(swings);
  
  const recentHigh = Math.max(...swings.filter(s => s.type === 'HH' || s.type === 'SH').map(s => s.price).slice(-3));
  const recentLow = Math.min(...swings.filter(s => s.type === 'LL' || s.type === 'SL').map(s => s.price).slice(-3));
  const zone = getZone(candles[candles.length - 1].close, recentHigh, recentLow);
  
  return { trend, bos, choch, fvgs, obs, swings, recentHigh, recentLow, zone };
}

function analyzeTechnical(candles) {
  const rsi = calcRSI(candles);
  const macd = calcMACD(candles);
  const bb = calcBollingerBands(candles);
  const atr = calcATR(candles);
  
  const closes = candles.map(c => c.close);
  const lastClose = closes[closes.length - 1];
  
  let rsiZone = 'neutral';
  if (rsi > 70) rsiZone = 'overbought';
  else if (rsi < 30) rsiZone = 'oversold';
  
  let macdSignal = 'neutral';
  if (macd.histogram > 0 && macd.macd > macd.signal) macdSignal = 'bullish';
  else if (macd.histogram < 0 && macd.macd < macd.signal) macdSignal = 'bearish';
  
  let bbPosition = 'middle';
  if (lastClose > bb.upper) bbPosition = 'above_upper';
  else if (lastClose < bb.lower) bbPosition = 'below_lower';
  
  return {
    rsi: { value: rsi, zone: rsiZone },
    macd: { signal: macdSignal, histogram: macd.histogram },
    bollinger: { position: bbPosition, squeeze: bb.bandwidth < 0.05 },
    atr,
  };
}

function analyzeVolume(candles) {
  const obv = calcOBV(candles);
  const vwap = calcVWAP(candles);
  const volumeProfile = calcVolumeProfile(candles);
  
  const recentOBV = obv.slice(-5);
  const obvTrend = recentOBV[recentOBV.length - 1] > recentOBV[0] ? 'rising' : 'falling';
  
  const avgVolume = candles.slice(-20).reduce((a, c) => a + c.volume, 0) / 20;
  const currentVolume = candles[candles.length - 1].volume;
  const volumeSpike = currentVolume > avgVolume * 2;
  
  return {
    poc: volumeProfile?.poc,
    vwap,
    obvTrend,
    volumeSpike,
    volumeProfile,
  };
}

function voteDirection(smc, technical, volume, price) {
  const votes = [];
  
  // SMC vote
  if (smc.trend === 'bullish') votes.push(1);
  else if (smc.trend === 'bearish') votes.push(-1);
  else votes.push(0);
  
  // Technical vote
  const techBullish = (technical.rsi.zone === 'oversold' || technical.macd.signal === 'bullish');
  const techBearish = (technical.rsi.zone === 'overbought' || technical.macd.signal === 'bearish');
  if (techBullish && !techBearish) votes.push(1);
  else if (techBearish && !techBullish) votes.push(-1);
  else votes.push(0);
  
  // Volume vote
  if (volume.obvTrend === 'rising' && price > volume.vwap) votes.push(1);
  else if (volume.obvTrend === 'falling' && price < volume.vwap) votes.push(-1);
  else votes.push(0);
  
  return votes;
}

function generateSetups(bias, price, smc, technical) {
  const setups = [];
  
  if (bias === 'bullish') {
    // Find nearest bull FVG or OB
    const bullFVGs = smc.fvgs.filter(f => f.type === 'bull' && f.top < price);
    const bullOBs = smc.obs.filter(o => o.type === 'bull_ob' && o.high < price);
    
    if (bullFVGs.length > 0) {
      const fvg = bullFVGs[bullFVGs.length - 1];
      const entry = fvg.top;
      const sl = entry - technical.atr;
      const tp = smc.recentHigh;
      setups.push({
        type: 'long',
        entry,
        sl,
        tp,
        rr: Math.round((tp - entry) / (entry - sl) * 10) / 10,
        reason: `Bull FVG fill at ${fvg.bottom.toFixed(2)}-${fvg.top.toFixed(2)}`,
        confluence: [`FVG gap: ${fvg.gap.toFixed(2)}`, `Zone: ${smc.zone}`],
        status: price > entry + technical.atr * 0.5 ? 'active' : 'waiting',
      });
    }
  }
  
  if (bias === 'bearish') {
    const bearOBs = smc.obs.filter(o => o.type === 'bear_ob' && o.low > price);
    
    if (bearOBs.length > 0) {
      const ob = bearOBs[bearOBs.length - 1];
      const entry = ob.low;
      const sl = entry + technical.atr;
      const tp = smc.recentLow;
      setups.push({
        type: 'short',
        entry,
        sl,
        tp,
        rr: Math.round((entry - tp) / (sl - entry) * 10) / 10,
        reason: `Bear OB at ${ob.low.toFixed(2)}-${ob.high.toFixed(2)}`,
        confluence: ['Order Block supply zone', `Zone: ${smc.zone}`],
        status: price < entry - technical.atr * 0.5 ? 'active' : 'waiting',
      });
    }
  }
  
  return setups;
}

function generateReasoning(bias, confidence, smc, technical, volume) {
  const parts = [];
  
  parts.push(`${confidence}% confidence ${bias} bias`);
  
  if (smc.bos) parts.push(`BOS confirmed`);
  if (smc.choch) parts.push(`CHoCH detected`);
  if (technical.rsi.zone !== 'neutral') parts.push(`RSI ${technical.rsi.value.toFixed(0)} (${technical.rsi.zone})`);
  if (technical.macd.signal !== 'neutral') parts.push(`MACD ${technical.macd.signal}`);
  if (volume.volumeSpike) parts.push('Volume spike detected');
  
  return parts.join('. ') + '.';
}

function generateSignal(symbol, timeframe, h4Candles, h1Candles, m15Candles) {
  // Analyze each layer
  const smc = analyzeSMC(h1Candles);
  const technical = analyzeTechnical(h1Candles);
  const volume = analyzeVolume(m15Candles);
  
  const price = h1Candles[h1Candles.length - 1].close;
  
  // Vote
  const votes = voteDirection(smc, technical, volume, price);
  const sumVotes = votes.reduce((a, b) => a + b, 0);
  
  // Check minimum 1 vote
  if (votes.every(v => v <= 0)) {
    return null; // No signal
  }
  
  // Determine bias
  let bias = 'neutral';
  if (sumVotes > 0) bias = 'bullish';
  else if (sumVotes < 0) bias = 'bearish';
  
  // Calculate confidence
  const agreeCount = votes.filter(v => v === (sumVotes > 0 ? 1 : -1)).length;
  let confidence;
  if (agreeCount === 3) confidence = 80 + Math.floor(Math.random() * 15);
  else if (agreeCount === 2) confidence = 60 + Math.floor(Math.random() * 20);
  else confidence = 40 + Math.floor(Math.random() * 20);
  
  // Generate setups
  const setups = generateSetups(bias, price, smc, technical);
  
  // Generate reasoning
  const reasoning = generateReasoning(bias, confidence, smc, technical, volume);
  
  return {
    symbol,
    timeframe,
    bias,
    confidence,
    price,
    structure: {
      trend: smc.trend,
      bos: smc.bos,
      choch: smc.choch,
      fvgs: smc.fvgs.slice(-5),
      orderBlocks: smc.obs.slice(-5),
      swings: smc.swings.slice(-10),
    },
    technical,
    volume,
    setups,
    confluenceScore: Math.round((sumVotes / 3 + 1) / 2 * 100),
    reasoning,
    timestamp: Math.floor(Date.now() / 1000),
  };
}

module.exports = { generateSignal, analyzeSMC, analyzeTechnical, analyzeVolume };
