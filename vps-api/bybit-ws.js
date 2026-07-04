const WebSocket = require('ws');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'aegis_terminal',
  user: 'aegis',
  password: 'aegis_terminal_2026',
});

const BYBIT_WS = 'wss://stream.bybit.com/v5/public/linear';
const KLINE_INTERVALS = { '5': 'M5', '15': 'M15', '60': 'H1', '240': 'H4' };

class BybitWebSocket {
  constructor(onKlineClose) {
    this.ws = null;
    this.onKlineClose = onKlineClose;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.subscribedSymbols = new Set();
  }

  connect() {
    console.log('Connecting to Bybit WebSocket...');
    this.ws = new WebSocket(BYBIT_WS);

    this.ws.on('open', () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.resubscribe();
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        this.handleMessage(msg);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    });

    this.ws.on('close', () => {
      console.log('WebSocket closed, reconnecting...');
      this.reconnect();
    });

    this.ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });
  }

  handleMessage(msg) {
    if (msg.topic && msg.topic.startsWith('kline.')) {
      const kline = msg.data[0];
      if (kline) {
        this.processKline(msg.topic, kline);
      }
    }
  }

  async processKline(topic, kline) {
    // Parse topic: "kline.60.BTCUSDT"
    const parts = topic.split('.');
    const interval = parts[1];
    const symbol = parts[2];
    const timeframe = KLINE_INTERVALS[interval];

    if (!timeframe) {
      console.error('Unknown interval:', interval);
      return;
    }

    // Convert Bybit data to our format
    const candle = {
      symbol,
      timeframe,
      open: parseFloat(kline.open),
      high: parseFloat(kline.high),
      low: parseFloat(kline.low),
      close: parseFloat(kline.close),
      volume: parseFloat(kline.volume),
      timestamp: Math.floor(kline.start / 1000), // Convert ms to seconds
      isClosed: kline.confirm, // True when candle is closed
    };

    // Store candle
    await this.storeCandle(candle);

    // Emit event if candle is closed
    if (candle.isClosed && this.onKlineClose) {
      this.onKlineClose(candle);
    }
  }

  async storeCandle(candle) {
    try {
      await pool.query(
        `INSERT INTO crypto_candles (symbol, timeframe, open, high, low, close, volume, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (symbol, timeframe, timestamp)
         DO UPDATE SET open=$3, high=$4, low=$5, close=$6, volume=$7`,
        [candle.symbol, candle.timeframe, candle.open, candle.high,
         candle.low, candle.close, candle.volume, candle.timestamp]
      );
    } catch (err) {
      console.error('Failed to store candle:', err);
    }
  }

  subscribe(symbols) {
    // Always track symbols for resubscription
    symbols.forEach(s => this.subscribedSymbols.add(s));

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('WebSocket not connected yet, will subscribe on connect');
      return;
    }

    // Subscribe to kline for each symbol and interval
    const args = [];
    for (const symbol of symbols) {
      for (const interval of Object.keys(KLINE_INTERVALS)) {
        args.push(`kline.${interval}.${symbol}`);
      }
    }

    this.ws.send(JSON.stringify({ op: 'subscribe', args }));
    console.log(`Subscribed to ${symbols.length} symbols`);
  }

  resubscribe() {
    if (this.subscribedSymbols.size > 0) {
      this.subscribe(Array.from(this.subscribedSymbols));
    }
  }

  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => this.connect(), delay);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

module.exports = { BybitWebSocket, KLINE_INTERVALS };
