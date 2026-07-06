// btc-scalp-scanner.js — BTC Scalping Scanner
// Runs every 5 min via cron
// Agent 1: Generates signals, stores to DB

const { generateScalpSignal, storeScalpSignal, pool } = require('./btc-scalp-engine');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

function formatTelegramMessage(signal) {
  const emoji = signal.bias === 'bullish' ? '🟢' : '🔴';
  const confBar = '█'.repeat(Math.floor(signal.confidence / 10)) + '░'.repeat(10 - Math.floor(signal.confidence / 10));

  let msg = `${emoji} **BTC SCALP** — ${signal.bias.toUpperCase()} (${signal.confidence}%)\n`;
  msg += `Confidence: [${confBar}]\n`;
  msg += `Price: $${signal.price?.toFixed(2) || 'N/A'}\n`;

  msg += `\n🎯 **Scalp Plan:**\n`;
  msg += `• Entry: $${signal.entry?.toFixed(2) || 'N/A'}\n`;
  msg += `• SL: $${signal.sl?.toFixed(2) || 'N/A'}\n`;
  msg += `• TP: $${signal.tp?.toFixed(2) || 'N/A'}\n`;
  msg += `• R:R: ${signal.rr || 'N/A'}\n`;

  if (signal.confluence?.layers) {
    msg += `\n📊 **Layers:**\n`;
    msg += `• SMC: ${signal.confluence.layers.smc.bias} (${signal.confluence.layers.smc.confidence}%)\n`;
    msg += `• Tech: ${signal.confluence.layers.technical.bias} (${signal.confluence.layers.technical.confidence}%)\n`;
    msg += `• Vol: ${signal.confluence.layers.volume.bias} (${signal.confluence.layers.volume.confidence}%)\n`;
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
  console.log('=== BTC Scalping Scanner ===');

  try {
    const signal = await generateScalpSignal();
    if (!signal) {
      console.log('No signal generated');
      await pool.end();
      process.exit(0);
    }

    const id = await storeScalpSignal(signal);
    if (id) {
      console.log(`Stored signal: id=${id}`);

      // Send Telegram alert
      const msg = formatTelegramMessage(signal);
      await sendTelegram(msg);
      console.log('Telegram alert sent');
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Scanner error:', err);
    await pool.end();
    process.exit(1);
  }
}

main();
