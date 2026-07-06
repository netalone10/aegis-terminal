// ws-runner.js — Standalone WebSocket feed for BTCUSDT
const { BybitWebSocket } = require('./bybit-ws');

const SYMBOLS = ['BTCUSDT'];

async function onKlineClose(candle) {
  if (candle.symbol === 'BTCUSDT') {
    console.log('[WS] ' + candle.symbol + ' ' + candle.timeframe + ' close=' + candle.close);
  }
}

const ws = new BybitWebSocket(onKlineClose);
ws.connect();

// Subscribe after connect
setTimeout(() => {
  ws.subscribe(SYMBOLS);
  console.log('[WS] Subscribed to ' + SYMBOLS.join(', ') + ' (M1,M5,M15,H1,H4)');
}, 2000);

// Reconnect on disconnect
setInterval(() => {
  if (!ws.ws || ws.ws.readyState !== 1) {
    console.log('[WS] Connection lost, reconnecting...');
    ws.connect();
    setTimeout(() => ws.resubscribe(), 2000);
  }
}, 30000);

console.log('[WS] Runner started');
