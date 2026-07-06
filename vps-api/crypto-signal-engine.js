// crypto-signal-engine.js — 3-layer confluence signal engine
// Layers: SMC Structure, Technical Indicators, Volume Analysis
// Min 1 layer agrees to generate signal

const { Pool } = require('pg');
const { getTechnicals } = require('./indicators');
const { getSMCAnalysis } = require('./smc-analysis');

const pool = new Pool({
  host: 'localhost', port: 5432, database: 'aegis_terminal',
  user: 'aegis', password: 'aegis_terminal_2026',
});

// Min candles needed per timeframe
const MIN_CANDLES = 30;

async function getCandles(symbol, timeframe, limit = 200) {
  const result = await pool.query(
    `SELECT open as o, high as h, low as l, close as c, volume as v, timestamp as t
     FROM crypto_candles
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

// ─── Layer 1: SMC Structure ───────────────────────────────
function analyzeSMCLayer(smcs) { // smcs = { h4: smcData, h1: smcData, m15: smcData }
  let bullishScore = 0, bearishScore = 0;
  const reasons = [];

  for (const [tf, smc] of Object.entries(smcs)) {
    const weight = tf === 'h4' ? 3 : tf === 'h1' ? 2 : 1;

    if (smc.bias === 'bullish') { bullishScore += weight; reasons.push(`${tf.toUpperCase()} SMC bullish`); }
    if (smc.bias === 'bearish') { bearishScore += weight; reasons.push(`${tf.toUpperCase()} SMC bearish`); }

    // BOS confirmation
    const lastBOS = smc.bos[smc.bos.length - 1];
    if (lastBOS) {
      if (lastBOS.type === 'bullish_bos') { bullishScore += weight; reasons.push(`${tf.toUpperCase()} bullish BOS`); }
      if (lastBOS.type === 'bearish_bos') { bearishScore += weight; reasons.push(`${tf.toUpperCase()} bearish BOS`); }
    }

    // FVGs
    const bullishFVGs = smc.fvgs.filter(f => f.type === 'bullish_fvg').length;
    const bearishFVGs = smc.fvgs.filter(f => f.type === 'bearish_fvg').length;
    if (bullishFVGs > bearishFVGs) { bullishScore += 1; }
    if (bearishFVGs > bullishFVGs) { bearishScore += 1; }

    // Order blocks
    const bullishOBs = smc.orderBlocks.filter(o => o.type === 'bullish_ob').length;
    const bearishOBs = smc.orderBlocks.filter(o => o.type === 'bearish_ob').length;
    if (bullishOBs > bearishOBs) { bullishScore += 1; }
    if (bearishOBs > bullishOBs) { bearishScore += 1; }
  }

  const total = bullishScore + bearishScore || 1;
  return {
    direction: bullishScore > bearishScore ? 'bullish' : bearishScore > bullishScore ? 'bearish' : 'neutral',
    confidence: Math.round(Math.max(bullishScore, bearishScore) / total * 100),
    reasons,
    bullishScore, bearishScore,
  };
}

// ─── Layer 2: Technical Indicators ────────────────────────
function analyzeTechnicalLayer(technicals) { // technicals = { h4, h1, m15 }
  let bullishScore = 0, bearishScore = 0;
  const reasons = [];

  for (const [tf, tech] of Object.entries(technicals)) {
    const weight = tf === 'h4' ? 2 : tf === 'h1' ? 1.5 : 1;
    if (!tech || tech.rsi === null) continue;

    // RSI
    if (tech.rsi > 60) { bullishScore += weight; reasons.push(`${tf.toUpperCase()} RSI ${tech.rsi} bullish`); }
    if (tech.rsi < 40) { bearishScore += weight; reasons.push(`${tf.toUpperCase()} RSI ${tech.rsi} bearish`); }
    if (tech.rsi > 70) { bearishScore += 1; reasons.push(`${tf.toUpperCase()} RSI overbought`); }
    if (tech.rsi < 30) { bullishScore += 1; reasons.push(`${tf.toUpperCase()} RSI oversold`); }

    // MACD
    if (tech.macdHist !== null) {
      if (tech.macdHist > 0) { bullishScore += weight * 0.8; reasons.push(`${tf.toUpperCase()} MACD bullish`); }
      if (tech.macdHist < 0) { bearishScore += weight * 0.8; reasons.push(`${tf.toUpperCase()} MACD bearish`); }
    }

    // EMA trend
    if (tech.ema20 && tech.ema50) {
      if (tech.ema20 > tech.ema50) { bullishScore += weight * 0.6; }
      if (tech.ema20 < tech.ema50) { bearishScore += weight * 0.6; }
    }

    // BB position
    if (tech.bbUpper && tech.bbLower && tech.price) {
      if (tech.price > tech.bbUpper) { bearishScore += 0.5; reasons.push(`${tf.toUpperCase()} above BB upper`); }
      if (tech.price < tech.bbLower) { bullishScore += 0.5; reasons.push(`${tf.toUpperCase()} below BB lower`); }
    }

    // Stochastic
    if (tech.stochK !== null && tech.stochD !== null) {
      if (tech.stochK > 80 && tech.stochK > tech.stochD) { bearishScore += 0.5; }
      if (tech.stochK < 20 && tech.stochK < tech.stochD) { bullishScore += 0.5; }
    }
  }

  const total = bullishScore + bearishScore || 1;
  return {
    direction: bullishScore > bearishScore ? 'bullish' : bearishScore > bullishScore ? 'bearish' : 'neutral',
    confidence: Math.round(Math.max(bullishScore, bearishScore) / total * 100),
    reasons,
    bullishScore, bearishScore,
  };
}

// ─── Layer 3: Volume Analysis ─────────────────────────────
function analyzeVolumeLayer(candlesMap) { // candlesMap = { h4: [...], h1: [...], m15: [...] }
  let bullishScore = 0, bearishScore = 0;
  const reasons = [];

  for (const [tf, candles] of Object.entries(candlesMap)) {
    if (candles.length < 20) continue;
    const weight = tf === 'h4' ? 2 : tf === 'h1' ? 1.5 : 1;
    const recent = candles.slice(-20);
    const avgVol = recent.reduce((s, c) => s + c.v, 0) / recent.length;
    const lastVol = recent[recent.length - 1].v;
    const priceChange = (recent[recent.length - 1].c - recent[0].c) / recent[0].c * 100;

    // Volume spike
    if (lastVol > avgVol * 1.5) {
      if (priceChange > 0) { bullishScore += weight; reasons.push(`${tf.toUpperCase()} volume spike + bullish`); }
      else { bearishScore += weight; reasons.push(`${tf.toUpperCase()} volume spike + bearish`); }
    }

    // Declining volume on move
    const volTrend = recent.slice(-5).reduce((s, c) => s + c.v, 0) / 5;
    const volPrev = recent.slice(-10, -5).reduce((s, c) => s + c.v, 0) / 5;
    if (volTrend < volPrev * 0.7 && Math.abs(priceChange) > 2) {
      reasons.push(`${tf.toUpperCase()} declining volume on move`);
    }

    // OBV trend from last 10 candles
    let obvUp = 0, obvDown = 0;
    for (let i = recent.length - 10; i < recent.length; i++) {
      if (recent[i].c > recent[i - 1].c) obvUp += recent[i].v;
      else obvDown += recent[i].v;
    }
    if (obvUp > obvDown * 1.2) { bullishScore += weight * 0.5; }
    if (obvDown > obvUp * 1.2) { bearishScore += weight * 0.5; }
  }

  const total = bullishScore + bearishScore || 1;
  return {
    direction: bullishScore > bearishScore ? 'bullish' : bearishScore > bullishScore ? 'bearish' : 'neutral',
    confidence: Math.round(Math.max(bullishScore, bearishScore) / total * 100),
    reasons,
    bullishScore, bearishScore,
  };
}

// ─── Confluence Scoring ───────────────────────────────────
function calculateConfluence(smc, tech, vol) {
  const layers = [smc, tech, vol];
  const directions = layers.map(l => l.direction).filter(d => d !== 'neutral');

  if (directions.length === 0) return null;

  const bulls = directions.filter(d => d === 'bullish').length;
  const bears = directions.filter(d => d === 'bearish').length;
  const agreeCount = Math.max(bulls, bears);

  let bias, confidence;
  if (agreeCount === 3) {
    bias = bulls > bears ? 'bullish' : 'bearish';
    confidence = 80 + Math.round((smc.confidence + tech.confidence + vol.confidence) / 30);
  } else if (agreeCount === 2) {
    bias = bulls > bears ? 'bullish' : 'bearish';
    confidence = 60 + Math.round((smc.confidence + tech.confidence + vol.confidence) / 50);
  } else if (agreeCount === 1) {
    bias = bulls > bears ? 'bullish' : 'bearish';
    confidence = 40 + Math.round((smc.confidence + tech.confidence + vol.confidence) / 70);
  } else {
    return null;
  }

  confidence = Math.min(confidence, 95);

  return {
    bias,
    confidence,
    agreeCount,
    layers: {
      smc: { bias: smc.direction, confidence: smc.confidence, reasons: smc.reasons },
      technical: { bias: tech.direction, confidence: tech.confidence, reasons: tech.reasons },
      volume: { bias: vol.direction, confidence: vol.confidence, reasons: vol.reasons },
    },
  };
}

// ─── Main Signal Generator ────────────────────────────────
async function generateSignals(symbol) {
  const candlesMap = {};
  const smcs = {};
  const technicals = {};

  for (const tf of ['h4', 'h1', 'm15']) {
    const candles = await getCandles(symbol, tf.toUpperCase());
    candlesMap[tf] = candles;

    if (candles.length < MIN_CANDLES) {
      console.log(`  ${symbol} ${tf}: only ${candles.length}/${MIN_CANDLES} candles — skipping`);
      return null;
    }

    smcs[tf] = getSMCAnalysis(candles);
    technicals[tf] = getTechnicals(candles);
  }

  const smcResult = analyzeSMCLayer(smcs);
  const techResult = analyzeTechnicalLayer(technicals);
  const volResult = analyzeVolumeLayer(candlesMap);

  const confluence = calculateConfluence(smcResult, techResult, volResult);
  if (!confluence) {
    console.log(`  ${symbol}: no confluence — skipping`);
    return null;
  }

  // Get latest price
  const price = technicals.m15?.price || technicals.h1?.price || technicals.h4?.price;
  const atr = technicals.m15?.atr || technicals.h1?.atr || technicals.h4?.atr;

  // Extract setups with entry/SL/TP
  const setups = extractSetups(smcs, technicals, candlesMap, price, confluence.bias, atr);
  const primarySetup = setups.find(s => s.type === 'primary');

  // Build signal
  const signal = {
    symbol,
    timeframe: 'multi',
    bias: confluence.bias,
    confidence: confluence.confidence,
    price,
    entry: primarySetup?.entry || price,
    sl: primarySetup?.sl,
    tp: primarySetup?.tp,
    rr: primarySetup?.rr,
    structure: smcs,
    technicals: technicals,
    volume: { m15: candlesMap.m15.slice(-10), h1: candlesMap.h1.slice(-10), h4: candlesMap.h4.slice(-10) },
    confluence: confluence,
    setups,
    reasoning: buildReasoning(smcResult, techResult, volResult, confluence),
  };

  return signal;
}

function calculateEntrySLTP(price, bias, atr, smcs, technicals) {
  // Calculate proper entry, SL, TP from structure
  if (!price || !atr) return null;

  const isBuy = bias === 'bullish';

  // Entry: use nearest structure level closest to current price
  let entry = price;
  let entrySource = 'market';

  // Find nearest FVG or OB near price
  for (const [tf, smc] of Object.entries(smcs)) {
    for (const fvg of smc.fvgs) {
      if (isBuy && fvg.type === 'bullish_fvg' && fvg.top <= price && fvg.bottom >= price * 0.95) {
        entry = (fvg.top + fvg.bottom) / 2;
        entrySource = `M15 FVG ${fvg.bottom.toFixed(4)}-${fvg.top.toFixed(4)}`;
        break;
      }
      if (!isBuy && fvg.type === 'bearish_fvg' && fvg.bottom >= price && fvg.top <= price * 1.05) {
        entry = (fvg.top + fvg.bottom) / 2;
        entrySource = `M15 FVG ${fvg.bottom.toFixed(4)}-${fvg.top.toFixed(4)}`;
        break;
      }
    }
    if (entrySource !== 'market') break;
  }

  // If no FVG found, check OBs
  if (entrySource === 'market') {
    for (const [tf, smc] of Object.entries(smcs)) {
      for (const ob of smc.orderBlocks) {
        if (isBuy && ob.type === 'bullish_ob' && ob.high <= price && ob.low >= price * 0.97) {
          entry = (ob.high + ob.low) / 2;
          entrySource = `${tf.toUpperCase()} OB ${ob.low.toFixed(4)}-${ob.high.toFixed(4)}`;
          break;
        }
        if (!isBuy && ob.type === 'bearish_ob' && ob.low >= price && ob.high <= price * 1.03) {
          entry = (ob.high + ob.low) / 2;
          entrySource = `${tf.toUpperCase()} OB ${ob.low.toFixed(4)}-${ob.high.toFixed(4)}`;
          break;
        }
      }
      if (entrySource !== 'market') break;
    }
  }

  // SL: beyond the zone + ATR buffer
  const atrBuffer = atr * 0.5;
  let sl;
  if (isBuy) {
    // Find nearest support below entry
    let nearestLow = entry - atr * 2;
    for (const [tf, smc] of Object.entries(smcs)) {
      for (const sl of smc.swingLows || []) {
        if (sl.price < entry && sl.price > nearestLow) nearestLow = sl.price;
      }
    }
    sl = nearestLow - atrBuffer;
  } else {
    // Find nearest resistance above entry
    let nearestHigh = entry + atr * 2;
    for (const [tf, smc] of Object.entries(smcs)) {
      for (const sh of smc.swingHighs || []) {
        if (sh.price > entry && sh.price < nearestHigh) nearestHigh = sh.price;
      }
    }
    sl = nearestHigh + atrBuffer;
  }

  // TP: 1:2 R:R minimum
  const risk = Math.abs(entry - sl);
  let tp;
  if (isBuy) {
    tp = entry + risk * 2;
    // Extend to next resistance if available
    for (const [tf, tech] of Object.entries(technicals)) {
      if (tech?.bbUpper && tech.bbUpper > entry && tech.bbUpper < tp * 1.5) {
        tp = tech.bbUpper;
      }
    }
  } else {
    tp = entry - risk * 2;
    for (const [tf, tech] of Object.entries(technicals)) {
      if (tech?.bbLower && tech.bbLower < entry && tech.bbLower > tp * 0.5) {
        tp = tech.bbLower;
      }
    }
  }

  const rr = risk > 0 ? Math.abs(tp - entry) / risk : 0;

  return {
    entry: Math.round(entry * 1e8) / 1e8,
    entrySource,
    sl: Math.round(sl * 1e8) / 1e8,
    tp: Math.round(tp * 1e8) / 1e8,
    rr: Math.round(rr * 10) / 10,
    risk,
    riskPct: (risk / price * 100),
  };
}

function extractSetups(smcs, technicals, candlesMap, price, bias, atr) {
  const setups = [];

  // Calculate primary entry/SL/TP
  const primary = calculateEntrySLTP(price, bias, atr, smcs, technicals);
  if (primary) {
    setups.push({
      type: 'primary',
      direction: bias === 'bullish' ? 'buy' : 'sell',
      entry: primary.entry,
      sl: primary.sl,
      tp: primary.tp,
      rr: primary.rr,
      riskPct: primary.riskPct,
      source: primary.entrySource,
      timeframe: 'multi',
    });
  }

  // FVG entry setup
  for (const [tf, smc] of Object.entries(smcs)) {
    for (const fvg of smc.fvgs) {
      const isBuy = fvg.type === 'bullish_fvg';
      const zoneMid = (fvg.top + fvg.bottom) / 2;
      const zoneSize = fvg.top - fvg.bottom;

      setups.push({
        type: 'fvg_entry',
        direction: isBuy ? 'buy' : 'sell',
        zone: { top: fvg.top, bottom: fvg.bottom },
        entry: Math.round(zoneMid * 1e8) / 1e8,
        sl: isBuy ? Math.round((fvg.bottom - zoneSize * 0.5) * 1e8) / 1e8 : Math.round((fvg.top + zoneSize * 0.5) * 1e8) / 1e8,
        tp: isBuy ? Math.round((zoneMid + zoneSize * 3) * 1e8) / 1e8 : Math.round((zoneMid - zoneSize * 3) * 1e8) / 1e8,
        rr: 3,
        timeframe: tf.toUpperCase(),
      });
    }
  }

  // OB entry setup
  for (const [tf, smc] of Object.entries(smcs)) {
    for (const ob of smc.orderBlocks) {
      const isBuy = ob.type === 'bullish_ob';
      const zoneMid = (ob.high + ob.low) / 2;
      const zoneSize = ob.high - ob.low;

      setups.push({
        type: 'ob_entry',
        direction: isBuy ? 'buy' : 'sell',
        zone: { top: ob.high, bottom: ob.low },
        entry: Math.round(zoneMid * 1e8) / 1e8,
        sl: isBuy ? Math.round((ob.low - zoneSize * 0.3) * 1e8) / 1e8 : Math.round((ob.high + zoneSize * 0.3) * 1e8) / 1e8,
        tp: isBuy ? Math.round((zoneMid + zoneSize * 2.5) * 1e8) / 1e8 : Math.round((zoneMid - zoneSize * 2.5) * 1e8) / 1e8,
        rr: 2.5,
        timeframe: tf.toUpperCase(),
      });
    }
  }

  // RSI divergence (simplified)
  for (const [tf, tech] of Object.entries(technicals)) {
    if (tech && tech.rsi) {
      if (tech.rsi < 30) setups.push({ type: 'rsi_oversold', direction: 'buy', rsi: tech.rsi, timeframe: tf.toUpperCase() });
      if (tech.rsi > 70) setups.push({ type: 'rsi_overbought', direction: 'sell', rsi: tech.rsi, timeframe: tf.toUpperCase() });
    }
  }

  return setups;
}

function buildReasoning(smc, tech, vol, confluence) {
  const parts = [];
  parts.push(`Bias: ${confluence.bias.toUpperCase()} (${confluence.confidence}% confidence, ${confluence.agreeCount}/3 layers agree)`);
  if (smc.reasons.length > 0) parts.push(`SMC: ${smc.reasons.join(', ')}`);
  if (tech.reasons.length > 0) parts.push(`Technical: ${tech.reasons.join(', ')}`);
  if (vol.reasons.length > 0) parts.push(`Volume: ${vol.reasons.join(', ')}`);
  return parts.join('\n');
}

// ─── Store Signal ─────────────────────────────────────────
async function storeSignal(signal) {
  // DEDUP: Check if active signal already exists for same symbol + bias
  const existing = await pool.query(
    `SELECT id, confidence, entry_price FROM crypto_signals
     WHERE symbol = $1 AND bias = $2 AND status = 'active'
     ORDER BY created_at DESC LIMIT 1`,
    [signal.symbol, signal.bias]
  );

  if (existing.rows.length > 0) {
    const old = existing.rows[0];
    const confDiff = signal.confidence - old.confidence;

    // If confidence is significantly higher (>10%), REPLACE old signal
    if (confDiff > 10) {
      console.log(`[dedup] ${signal.symbol}: replacing old signal (id=${old.id}) — new conf ${signal.confidence}% vs old ${old.confidence}%`);
      await pool.query(
        `UPDATE crypto_signals SET status = 'replaced', closed_at = NOW(), alert_state = 'closed'
         WHERE id = $1`,
        [old.id]
      );
      // Fall through to INSERT below
    } else {
      // Same or similar — skip
      console.log(`[dedup] ${signal.symbol}: skipping — active signal exists (id=${old.id}, conf=${old.confidence}%, new=${signal.confidence}%)`);
      return null;
    }
  }

  const result = await pool.query(
    `INSERT INTO crypto_signals (symbol, timeframe, bias, confidence, price, entry_price, stop_loss, take_profit, risk_reward, structure, technical, volume, setups, confluence, confluence_score, reasoning, status, adjustments)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'active', $17)
     RETURNING id`,
    [
      signal.symbol, signal.timeframe, signal.bias, signal.confidence,
      signal.price,
      signal.entry || signal.price,
      signal.sl || null,
      signal.tp || null,
      signal.rr || null,
      JSON.stringify(signal.structure),
      JSON.stringify(signal.technicals),
      JSON.stringify(signal.volume),
      JSON.stringify(signal.setups),
      JSON.stringify(signal.confluence),
      signal.confidence,
      signal.reasoning,
      JSON.stringify(signal.adjustments || null),
    ]
  );
  return result.rows[0].id;
}

module.exports = { generateSignals, storeSignal, getCandles, pool };
