const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const sentSignals = new Map(); // signalId -> timestamp

function formatSignal(signal) {
  const emoji = signal.bias === 'bullish' ? '🟢' : signal.bias === 'bearish' ? '🔴' : '⚪';
  const layers = [
    signal.structure.bos ? 'BOS' : null,
    signal.structure.choch ? 'CHoCH' : null,
    signal.technical.rsi.zone !== 'neutral' ? `RSI ${signal.technical.rsi.value.toFixed(0)} (${signal.technical.rsi.zone})` : null,
    signal.technical.macd.signal !== 'neutral' ? `MACD ${signal.technical.macd.signal}` : null,
    signal.volume.volumeSpike ? 'Volume spike' : null,
    signal.volume.obvTrend !== 'neutral' ? `OBV ${signal.volume.obvTrend}` : null,
  ].filter(Boolean).join(' + ');

  const setups = signal.setups.map(s => 
    `${s.type.toUpperCase()} @ $${s.entry.toFixed(2)}\n` +
    `SL: $${s.sl.toFixed(2)} (-${((Math.abs(s.entry - s.sl) / s.entry) * 100).toFixed(2)}%)\n` +
    `TP: $${s.tp.toFixed(2)} (+${((Math.abs(s.tp - s.entry) / s.entry) * 100).toFixed(2)}%)\n` +
    `R:R: ${s.rr}\n` +
    `Reason: ${s.reason}`
  ).join('\n\n');

  return [
    `${emoji} ${signal.symbol} — ${signal.bias.toUpperCase()} SIGNAL`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━',
    `📊 Confidence: ${signal.confidence}% (${signal.confluenceScore}/100 confluence)`,
    `💰 Price: $${signal.price.toFixed(2)}`,
    `📈 Bias: ${signal.bias}`,
    `⏰ Timeframe: ${signal.timeframe}`,
    '',
    '🔧 CONFLUENCE:',
    `├── SMC: ${layers}`,
    `├── Technical: RSI ${signal.technical.rsi.value.toFixed(0)} (${signal.technical.rsi.zone})`,
    `└── Volume: ${signal.volume.obvTrend} trend${signal.volume.volumeSpike ? ' + spike' : ''}`,
    '',
    '🎯 SETUPS:',
    setups,
    '',
    '📝 Reasoning:',
    signal.reasoning,
  ].join('\n');
}

async function sendTelegramAlert(signal) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Telegram credentials not set');
    return false;
  }

  // Dedup check
  const signalKey = `${signal.symbol}_${signal.timeframe}_${signal.bias}`;
  const lastSent = sentSignals.get(signalKey);
  if (lastSent && Date.now() - lastSent < 3600000) { // 1 hour dedup
    console.log('Skipping duplicate signal:', signalKey);
    return false;
  }

  const message = formatSignal(signal);
  
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'HTML',
        }),
      }
    );
    
    const result = await response.json();
    if (result.ok) {
      sentSignals.set(signalKey, Date.now());
      console.log('Telegram alert sent for', signal.symbol);
      return true;
    } else {
      console.error('Telegram API error:', result.description);
      return false;
    }
  } catch (err) {
    console.error('Failed to send Telegram alert:', err);
    return false;
  }
}

module.exports = { sendTelegramAlert, formatSignal };
