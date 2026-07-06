// outcome-tracker.js — Full lifecycle alert system
// States: new → entry_pending → entry_hit → closed
// Max 3 alerts per signal: new_signal, entry_hit, outcome(tp/sl)
// NO duplicate alerts. NO alerts after closed.

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost', port: 5432, database: 'aegis_terminal',
  user: 'aegis', password: 'aegis_terminal_2026',
});

const SIGNAL_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Queries ─────────────────────────────────────────────

async function getActiveSignals() {
  const result = await pool.query(`
    SELECT id, symbol, bias, entry_price, stop_loss, take_profit,
           price as signal_price, alert_state, created_at
    FROM crypto_signals
    WHERE status = 'active'
    ORDER BY created_at ASC
  `);
  return result.rows;
}

async function getCurrentPrice(symbol) {
  const result = await pool.query(
    `SELECT close FROM crypto_candles
     WHERE symbol = $1 AND timeframe = 'M5'
     ORDER BY timestamp DESC LIMIT 1`,
    [symbol]
  );
  return result.rows[0] ? parseFloat(result.rows[0].close) : null;
}

async function queueAlert(signalId, alertType, symbol, data) {
  // Prevent duplicate: check if this alert type already queued/sent for this signal
  const exists = await pool.query(
    `SELECT id FROM crypto_alert_queue
     WHERE signal_id = $1 AND alert_type = $2 AND sent = true`,
    [signalId, alertType]
  );
  if (exists.rows.length > 0) {
    console.log(`  [dedup] ${alertType} already sent for signal ${signalId}, skipping`);
    return false;
  }

  // Also check pending (not yet sent)
  const pending = await pool.query(
    `SELECT id FROM crypto_alert_queue
     WHERE signal_id = $1 AND alert_type = $2 AND sent = false`,
    [signalId, alertType]
  );
  if (pending.rows.length > 0) {
    console.log(`  [dedup] ${alertType} already queued for signal ${signalId}, skipping`);
    return false;
  }

  await pool.query(
    `INSERT INTO crypto_alert_queue (alert_type, symbol, data, signal_id)
     VALUES ($1, $2, $3, $4)`,
    [alertType, symbol, JSON.stringify(data), signalId]
  );
  console.log(`  [alert] Queued: ${alertType} for ${symbol}`);
  return true;
}

function calcPnl(entry, exit, bias) {
  if (!entry || !exit) return 0;
  const direction = bias === 'bullish' ? 1 : -1;
  return Math.round(((exit - entry) / entry) * 100 * direction * 100) / 100;
}

// ─── Entry Hit Detection ─────────────────────────────────
// Bullish: price drops to/below entry (buy the dip)
// Bearish: price rises to/above entry (sell the rally)

function didHitEntry(currentPrice, entryPrice, bias) {
  if (!currentPrice || !entryPrice) return false;
  if (bias === 'bullish') {
    return currentPrice <= entryPrice;
  } else {
    return currentPrice >= entryPrice;
  }
}

// ─── Main Tracker ────────────────────────────────────────

async function trackOutcomes() {
  const signals = await getActiveSignals();
  if (signals.length === 0) {
    console.log('[Tracker] No active signals');
    return { checked: 0, closed: 0, details: [] };
  }

  console.log(`[Tracker] Checking ${signals.length} active signals...`);
  let closed = 0;
  const details = [];

  for (const sig of signals) {
    const currentPrice = await getCurrentPrice(sig.symbol);
    if (!currentPrice) {
      console.log(`  ${sig.symbol}: no price data, skipping`);
      continue;
    }

    const entry = parseFloat(sig.entry_price);
    const sl = parseFloat(sig.stop_loss);
    const tp = parseFloat(sig.take_profit);
    const bias = sig.bias;
    const isBuy = bias === 'bullish';
    const state = sig.alert_state || 'new';

    let hitTP = false, hitSL = false;
    if (isBuy) {
      if (tp && currentPrice >= tp) hitTP = true;
      if (sl && currentPrice <= sl) hitSL = true;
    } else {
      if (tp && currentPrice <= tp) hitTP = true;
      if (sl && currentPrice >= sl) hitSL = true;
    }

    const entryHit = didHitEntry(currentPrice, entry, bias);
    const age = Date.now() - new Date(sig.created_at).getTime();
    const expired = age > SIGNAL_MAX_AGE_MS;

    const baseData = {
      symbol: sig.symbol,
      bias: sig.bias,
      entry,
      sl,
      tp,
      current_price: currentPrice,
      signal_price: parseFloat(sig.signal_price),
    };

    // ─── State Machine ────────────────────────────────────

    if (state === 'new') {
      if (entryHit) {
        // Price already at/below entry — skip entry alert, go straight to monitoring TP/SL
        await pool.query(
          `UPDATE crypto_signals
           SET alert_state = 'entry_hit', entry_hit_at = NOW()
           WHERE id = $1`,
          [sig.id]
        );
        // Queue entry alert
        await queueAlert(sig.id, 'entry_hit', sig.symbol, {
          ...baseData,
          duration_min: Math.round(age / 60000),
        });
        console.log(`  ${sig.symbol}: ENTRY HIT (skipped pending) → entry_hit`);

        // Also check if TP/SL hit in same tick
        if (hitTP) {
          const pnl = calcPnl(entry, tp, bias);
          await closeSignal(sig.id, tp, 'tp', pnl);
          await queueAlert(sig.id, 'tp_hit', sig.symbol, {
            ...baseData, exit: tp, pnl, result: 'tp',
            duration_min: Math.round(age / 60000),
          });
          closed++;
          details.push({ symbol: sig.symbol, result: 'tp', pnl, price: currentPrice });
          console.log(`  ${sig.symbol}: TP HIT in same tick ✅ PnL: ${pnl}%`);
          continue;
        } else if (hitSL) {
          const pnl = calcPnl(entry, sl, bias);
          await closeSignal(sig.id, sl, 'sl', pnl);
          await queueAlert(sig.id, 'sl_hit', sig.symbol, {
            ...baseData, exit: sl, pnl, result: 'sl',
            duration_min: Math.round(age / 60000),
          });
          closed++;
          details.push({ symbol: sig.symbol, result: 'sl', pnl, price: currentPrice });
          console.log(`  ${sig.symbol}: SL HIT in same tick ❌ PnL: ${pnl}%`);
          continue;
        }
      } else {
        // Entry not hit yet — transition to entry_pending
        if (state !== 'entry_pending') {
          await pool.query(
            `UPDATE crypto_signals SET alert_state = 'entry_pending' WHERE id = $1`,
            [sig.id]
          );
        }
        details.push({ symbol: sig.symbol, result: 'awaiting_entry', price: currentPrice });
        console.log(`  ${sig.symbol}: waiting for entry (price: ${currentPrice}, entry: ${entry})`);
      }
    }

    else if (state === 'entry_pending') {
      if (entryHit) {
        await pool.query(
          `UPDATE crypto_signals
           SET alert_state = 'entry_hit', entry_hit_at = NOW()
           WHERE id = $1`,
          [sig.id]
        );
        await queueAlert(sig.id, 'entry_hit', sig.symbol, {
          ...baseData,
          duration_min: Math.round(age / 60000),
        });
        console.log(`  ${sig.symbol}: ENTRY HIT → entry_hit`);

        // Check TP/SL in same tick
        if (hitTP) {
          const pnl = calcPnl(entry, tp, bias);
          await closeSignal(sig.id, tp, 'tp', pnl);
          await queueAlert(sig.id, 'tp_hit', sig.symbol, {
            ...baseData, exit: tp, pnl, result: 'tp',
            duration_min: Math.round(age / 60000),
          });
          closed++;
          details.push({ symbol: sig.symbol, result: 'tp', pnl, price: currentPrice });
          console.log(`  ${sig.symbol}: TP HIT in same tick ✅ PnL: ${pnl}%`);
          continue;
        } else if (hitSL) {
          const pnl = calcPnl(entry, sl, bias);
          await closeSignal(sig.id, sl, 'sl', pnl);
          await queueAlert(sig.id, 'sl_hit', sig.symbol, {
            ...baseData, exit: sl, pnl, result: 'sl',
            duration_min: Math.round(age / 60000),
          });
          closed++;
          details.push({ symbol: sig.symbol, result: 'sl', pnl, price: currentPrice });
          console.log(`  ${sig.symbol}: SL HIT in same tick ❌ PnL: ${pnl}%`);
          continue;
        }
      } else {
        details.push({ symbol: sig.symbol, result: 'awaiting_entry', price: currentPrice });
        console.log(`  ${sig.symbol}: still waiting for entry (price: ${currentPrice})`);
      }
    }

    else if (state === 'entry_hit') {
      // Entry was hit — now monitoring for TP/SL outcome
      if (hitTP) {
        const pnl = calcPnl(entry, tp, bias);
        await closeSignal(sig.id, tp, 'tp', pnl);
        await queueAlert(sig.id, 'tp_hit', sig.symbol, {
          ...baseData, exit: tp, pnl, result: 'tp',
          duration_min: Math.round(age / 60000),
        });
        closed++;
        details.push({ symbol: sig.symbol, result: 'tp', pnl, price: currentPrice });
        console.log(`  ${sig.symbol}: TP HIT ✅ PnL: ${pnl}%`);
      } else if (hitSL) {
        const pnl = calcPnl(entry, sl, bias);
        await closeSignal(sig.id, sl, 'sl', pnl);
        await queueAlert(sig.id, 'sl_hit', sig.symbol, {
          ...baseData, exit: sl, pnl, result: 'sl',
          duration_min: Math.round(age / 60000),
        });
        closed++;
        details.push({ symbol: sig.symbol, result: 'sl', pnl, price: currentPrice });
        console.log(`  ${sig.symbol}: SL HIT ❌ PnL: ${pnl}%`);
      } else if (expired) {
        // Expired while in entry_hit — close without outcome alert
        const pnl = calcPnl(entry, currentPrice, bias);
        await closeSignal(sig.id, currentPrice, 'expired', pnl);
        console.log(`  ${sig.symbol}: EXPIRED ⏰ (after entry hit, no outcome alert)`);
        closed++;
        details.push({ symbol: sig.symbol, result: 'expired', pnl, price: currentPrice });
      } else {
        const unrealized = calcPnl(entry, currentPrice, bias);
        details.push({ symbol: sig.symbol, result: 'entry_hit', unrealized, price: currentPrice });
        console.log(`  ${sig.symbol}: entry hit, monitoring TP/SL (unrealized: ${unrealized}%)`);
      }
    }
  }

  console.log(`[Tracker] Done. Closed: ${closed}/${signals.length}`);
  return { checked: signals.length, closed, details };
}

// ─── Close Signal Helper ─────────────────────────────────

async function closeSignal(id, exitPrice, reason, pnlPct) {
  const statusMap = { tp: 'hit_tp', sl: 'hit_sl', expired: 'expired' };
  await pool.query(
    `UPDATE crypto_signals
     SET status = $1, exit_price = $2, closed_at = NOW(), pnl_pct = $3,
         hit_tp = $4, hit_sl = $5, alert_state = 'closed'
     WHERE id = $6`,
    [
      statusMap[reason] || 'closed',
      exitPrice,
      pnlPct,
      reason === 'tp',
      reason === 'sl',
      id,
    ]
  );
}

// ─── Entry ───────────────────────────────────────────────

async function main() {
  try {
    const result = await trackOutcomes();
    if (result.closed > 0) {
      console.log(JSON.stringify(result));
    }
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('[Tracker] Error:', err);
    await pool.end();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} else {
  module.exports = { trackOutcomes };
}
