// scan-all.js — Run signal engine on all coins with adaptive scoring
// Usage: node scan-all.js [--dry-run] [--min-confidence 60]

const { generateSignals, storeSignal, pool } = require('./crypto-signal-engine');
const { getWeights, applyAdaptation } = require('./adaptive-scoring');
const { trackOutcomes } = require('./outcome-tracker');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

async function getTopCoins() {
  const result = await pool.query('SELECT symbol FROM crypto_top_coins ORDER BY rank');
  if (result.rows.length > 0) return result.rows.map(r => r.symbol);
  return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'BNBUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT'];
}

function formatTelegramMessage(signal) {
  const emoji = signal.bias === 'bullish' ? '🟢' : signal.bias === 'bearish' ? '🔴' : '⚪';
  const confBar = '█'.repeat(Math.floor(signal.confidence / 10)) + '░'.repeat(10 - Math.floor(signal.confidence / 10));

  let msg = `${emoji} **${signal.symbol}** — ${signal.bias.toUpperCase()} (${signal.confidence}%)\n`;
  msg += `Confidence: [${confBar}]\n`;
  msg += `Price: $${signal.price?.toFixed(4) || 'N/A'}\n`;

  // Entry/SL/TP
  const primary = signal.setups?.find(s => s.type === 'primary');
  if (primary) {
    msg += `\n🎯 **Trade Plan:**\n`;
    msg += `• Entry: $${primary.entry?.toFixed(6) || 'N/A'}\n`;
    msg += `• SL: $${primary.sl?.toFixed(6) || 'N/A'}\n`;
    msg += `• TP: $${primary.tp?.toFixed(6) || 'N/A'}\n`;
    msg += `• R:R: ${primary.rr || 'N/A'}\n`;
  }

  if (signal.adjustments) {
    msg += `\n📊 Adaptive: ${signal.adjustments.total > 0 ? '+' : ''}${signal.adjustments.total}%\n`;
  }

  msg += `\n📊 **Layers:**\n`;
  const layers = signal.confluence?.layers;
  if (layers) {
    msg += `• SMC: ${layers.smc.bias} (${layers.smc.confidence}%)\n`;
    msg += `• Tech: ${layers.technical.bias} (${layers.technical.confidence}%)\n`;
    msg += `• Vol: ${layers.volume.bias} (${layers.volume.confidence}%)\n`;
  }

  return msg;
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'Markdown',
      }),
    });
  } catch (err) {
    console.error('Telegram send failed:', err.message);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const minConfIdx = args.indexOf('--min-confidence');
  const minConfidence = minConfIdx >= 0 ? parseInt(args[minConfIdx + 1]) : 60;

  console.log('=== Aegis Crypto Signal Scanner (Adaptive) ===');
  console.log(`Dry run: ${dryRun}`);

  // Step 1: Track outcomes for existing signals
  console.log('\n--- Step 1: Outcome Tracking ---');
  try {
    const outcome = await trackOutcomes();
    if (outcome.closed > 0) {
      console.log(`Closed ${outcome.closed} signals`);
    }
  } catch (err) {
    console.error('Outcome tracking failed:', err.message);
  }

  // Step 2: Get adaptive weights
  console.log('\n--- Step 2: Loading Adaptive Weights ---');
  let weights;
  try {
    weights = await getWeights();
    console.log(`Weights loaded (sample: ${weights.sample_size} signals)`);
    console.log(`Min confidence: ${weights.min_confidence}%`);
    console.log(`Layer weights: SMC=${weights.smc_weight}, Tech=${weights.tech_weight}, Vol=${weights.vol_weight}`);
  } catch (err) {
    console.error('Weight loading failed:', err.message);
    weights = null;
  }

  // Step 3: Scan all coins
  console.log('\n--- Step 3: Signal Generation ---');
  const symbols = await getTopCoins();
  console.log(`Scanning ${symbols.length} coins...`);

  let signalsGenerated = 0;
  let signalsStored = 0;
  let signalsSent = 0;

  for (const symbol of symbols) {
    console.log(`\n--- ${symbol} ---`);
    try {
      let signal = await generateSignals(symbol);
      if (!signal) {
        console.log(`  No signal`);
        continue;
      }

      // Apply adaptive scoring
      if (weights) {
        signal = await applyAdaptation(signal, weights);
        // Also apply layer weights to confluence
        if (signal.confluence?.layers) {
          signal.confluence.layers.smc.weight = weights.smc_weight;
          signal.confluence.layers.technical.weight = weights.tech_weight;
          signal.confluence.layers.volume.weight = weights.vol_weight;
        }
      }

      signalsGenerated++;
      const effectiveConf = signal.confidence;
      const effectiveThreshold = Math.max(minConfidence, weights?.min_confidence || 60);

      console.log(`  Signal: ${signal.bias} (${effectiveConf}%${signal.adjustments?.total ? ` adj: ${signal.adjustments.total > 0 ? '+' : ''}${signal.adjustments.total}%` : ''})`);

      if (!dryRun && effectiveConf >= effectiveThreshold) {
        // Store with adaptive data
        signal.confluence_score = signal.confidence;
        const id = await storeSignal(signal);
        if (!id) {
          console.log(`  Skipped (dedup)`);
          continue;
        }
        signalsStored++;
        console.log(`  Stored: id=${id}`);

        // Send Telegram alert
        const msg = formatTelegramMessage(signal);
        await sendTelegram(msg);
        signalsSent++;
        console.log(`  Telegram sent`);
      } else if (effectiveConf < effectiveThreshold) {
        console.log(`  Below threshold (${effectiveConf} < ${effectiveThreshold})`);
      }
    } catch (err) {
      console.error(`  Error: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n=== Scan Complete ===`);
  console.log(`Generated: ${signalsGenerated}`);
  console.log(`Stored: ${signalsStored}`);
  console.log(`Sent: ${signalsSent}`);

  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error('Scan failed:', err);
  pool.end();
  process.exit(1);
});
