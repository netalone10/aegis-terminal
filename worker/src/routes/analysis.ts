import { Hono } from 'hono';
import { Cache } from '../cache';
import type { Bindings } from '../index';

export const analysisRoutes = new Hono<{ Bindings: Bindings }>();

// --- Helpers ---

// Simple SMA
function sma(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    const slice = data.slice(i - period + 1, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return result;
}

// EMA
function ema(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    if (i === period - 1) {
      result.push(data.slice(0, period).reduce((a, b) => a + b, 0) / period);
      continue;
    }
    const prev = result[i - 1]!;
    result.push(data[i] * k + prev * (1 - k));
  }
  return result;
}

// RSI
function rsi(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  for (let i = 0; i < closes.length; i++) {
    if (i < period) { result.push(null); continue; }
    const gSlice = gains.slice(i - period, i);
    const lSlice = losses.slice(i - period, i);
    const avgGain = gSlice.reduce((a, b) => a + b, 0) / period;
    const avgLoss = lSlice.reduce((a, b) => a + b, 0) / period;
    if (avgLoss === 0) { result.push(100); continue; }
    const rs = avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}

// MACD
function macd(closes: number[]): { macdLine: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (ema12[i] == null || ema26[i] == null) { macdLine.push(null); continue; }
    macdLine.push(ema12[i]! - ema26[i]!);
  }
  const validMacd = macdLine.filter(v => v != null) as number[];
  const signalEma = ema(validMacd, 9);
  const signal: (number | null)[] = [];
  let j = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] == null) { signal.push(null); continue; }
    signal.push(signalEma[j] ?? null);
    j++;
  }
  const histogram: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (macdLine[i] == null || signal[i] == null) { histogram.push(null); continue; }
    histogram.push(macdLine[i]! - signal[i]!);
  }
  return { macdLine, signal, histogram };
}

// ATR (14)
function atr(highs: number[], lows: number[], closes: number[], period = 14): (number | null)[] {
  const trs: number[] = [highs[0] - lows[0]];
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    trs.push(tr);
  }
  return sma(trs, period);
}

// Bollinger Bands
function bollinger(closes: number[], period = 20, mult = 2): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const mid = sma(closes, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (mid[i] == null) { upper.push(null); lower.push(null); continue; }
    const slice = closes.slice(i - period + 1, i + 1);
    const std = Math.sqrt(slice.reduce((s, v) => s + (v - mid[i]!) ** 2, 0) / period);
    upper.push(mid[i]! + mult * std);
    lower.push(mid[i]! - mult * std);
  }
  return { upper, middle: mid, lower };
}

// Fetch Yahoo chart data
async function fetchChart(symbol: string, interval: string, range: string): Promise<any> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'AegisTerminal/1.0' } });
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  return res.json();
}

// GET /api/analysis/technical/:symbol — full TA suite
analysisRoutes.get('/technical/:symbol', async (c) => {
  const symbol = c.req.param('symbol');
  const interval = c.req.query('interval') ?? '1d';
  const range = c.req.query('range') ?? '6mo';
  const cache = new Cache(c.env.AEGIS_CACHE, 300);

  try {
    const key = `ta:${symbol}:${interval}:${range}`;
    const data = await cache.getOrSet(key, async () => {
      const chart = await fetchChart(symbol, interval, range);
      const result = chart.chart?.result?.[0];
      if (!result) return null;
      const q = result.indicators?.quote?.[0] ?? {};
      const closes: number[] = (q.close ?? []).filter((v: number | null) => v != null);
      const highs: number[] = (q.high ?? []).filter((v: number | null) => v != null);
      const lows: number[] = (q.low ?? []).filter((v: number | null) => v != null);
      const volumes: number[] = (q.volume ?? []).filter((v: number | null) => v != null);
      if (closes.length < 26) return null;

      const ema20 = ema(closes, 20);
      const ema50 = ema(closes, 50);
      const sma200 = sma(closes, 200);
      const rsiValues = rsi(closes, 14);
      const macdValues = macd(closes);
      const atrValues = atr(highs, lows, closes, 14);
      const bb = bollinger(closes, 20, 2);

      const last = closes.length - 1;
      const currentPrice = closes[last];

      // Support/resistance from recent pivots
      const recentHighs = highs.slice(-30);
      const recentLows = lows.slice(-30);
      const resistance = Math.max(...recentHighs);
      const support = Math.min(...recentLows);

      // Volume analysis
      const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length);
      const currentVol = volumes[volumes.length - 1];
      const volRatio = avgVol20 > 0 ? currentVol / avgVol20 : 1;

      // Trend detection
      let trend = 'neutral';
      if (currentPrice > (ema20[last] ?? 0) && (ema20[last] ?? 0) > (ema50[last] ?? 0)) trend = 'bullish';
      else if (currentPrice < (ema20[last] ?? 0) && (ema20[last] ?? 0) < (ema50[last] ?? 0)) trend = 'bearish';

      // Recommendation
      let recommendation = 'hold';
      const currentRsi = rsiValues[last];
      const currentMacd = macdValues.macdLine[last];
      const currentSignal = macdValues.signal[last];
      if (currentRsi && currentRsi < 30 && currentMacd != null && currentSignal != null && currentMacd > currentSignal) recommendation = 'strong_buy';
      else if (currentRsi && currentRsi < 40) recommendation = 'buy';
      else if (currentRsi && currentRsi > 70 && currentMacd != null && currentSignal != null && currentMacd < currentSignal) recommendation = 'strong_sell';
      else if (currentRsi && currentRsi > 60) recommendation = 'sell';

      return {
        symbol: result.meta.symbol,
        price: currentPrice,
        trend,
        recommendation,
        indicators: {
          rsi: currentRsi ? Math.round(currentRsi * 100) / 100 : null,
          macd: { line: macdValues.macdLine[last], signal: macdValues.signal[last], histogram: macdValues.histogram[last] },
          ema20: ema20[last],
          ema50: ema50[last],
          sma200: sma200[last],
          atr: atrValues[last],
          bollinger: { upper: bb.upper[last], middle: bb.middle[last], lower: bb.lower[last] },
          support: Math.round(support * 100) / 100,
          resistance: Math.round(resistance * 100) / 100,
        },
        volume: { current: currentVol, avg20: Math.round(avgVol20), ratio: Math.round(volRatio * 100) / 100 },
        meta: { interval, range, dataPoints: closes.length },
      };
    }, { ttl: 300 });

    if (!data) return c.json({ error: 'Insufficient data' }, 404);
    return c.json({ status: 'ok', data });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/analysis/backtest/:symbol — simple backtest (RSI strategy)
analysisRoutes.get('/backtest/:symbol', async (c) => {
  const symbol = c.req.param('symbol');
  const strategy = c.req.query('strategy') ?? 'rsi';
  const range = c.req.query('range') ?? '1y';
  const initialCapital = parseFloat(c.req.query('capital') ?? '10000');
  const cache = new Cache(c.env.AEGIS_CACHE, 600);

  try {
    const key = `bt:${symbol}:${strategy}:${range}:${initialCapital}`;
    const data = await cache.getOrSet(key, async () => {
      const chart = await fetchChart(symbol, '1d', range);
      const result = chart.chart?.result?.[0];
      if (!result) return null;
      const q = result.indicators?.quote?.[0] ?? {};
      const closes: number[] = (q.close ?? []).filter((v: number | null) => v != null);
      if (closes.length < 30) return null;

      const rsiValues = rsi(closes, 14);
      const ema20Values = ema(closes, 20);
      const ema50Values = ema(closes, 50);

      let capital = initialCapital;
      let position = 0;
      let entryPrice = 0;
      let trades = 0;
      let wins = 0;
      let peak = capital;
      let maxDrawdown = 0;
      const equityCurve: number[] = [];

      for (let i = 30; i < closes.length; i++) {
        const price = closes[i];
        const currentRsi = rsiValues[i];
        const currentEma20 = ema20Values[i];
        const currentEma50 = ema50Values[i];

        if (strategy === 'rsi') {
          if (position === 0 && currentRsi != null && currentRsi < 30) {
            position = Math.floor(capital / price);
            entryPrice = price;
            capital -= position * price;
          } else if (position > 0 && currentRsi != null && currentRsi > 70) {
            capital += position * price;
            if (price > entryPrice) wins++;
            trades++;
            position = 0;
          }
        } else if (strategy === 'ema_cross') {
          if (position === 0 && currentEma20 != null && currentEma50 != null && currentEma20 > currentEma50) {
            position = Math.floor(capital / price);
            entryPrice = price;
            capital -= position * price;
          } else if (position > 0 && currentEma20 != null && currentEma50 != null && currentEma20 < currentEma50) {
            capital += position * price;
            if (price > entryPrice) wins++;
            trades++;
            position = 0;
          }
        }

        const totalValue = capital + position * price;
        equityCurve.push(Math.round(totalValue * 100) / 100);
        if (totalValue > peak) peak = totalValue;
        const dd = (peak - totalValue) / peak;
        if (dd > maxDrawdown) maxDrawdown = dd;
      }

      // Close remaining position
      if (position > 0) {
        capital += position * closes[closes.length - 1];
        if (closes[closes.length - 1] > entryPrice) wins++;
        trades++;
      }

      const finalValue = capital;
      const totalReturn = ((finalValue - initialCapital) / initialCapital) * 100;

      return {
        symbol,
        strategy,
        range,
        initialCapital,
        finalValue: Math.round(finalValue * 100) / 100,
        totalReturn: Math.round(totalReturn * 100) / 100,
        totalTrades: trades,
        winningTrades: wins,
        winRate: trades > 0 ? Math.round((wins / trades) * 10000) / 100 : 0,
        maxDrawdown: Math.round(maxDrawdown * 10000) / 100,
        sharpeRatio: null, // would need risk-free rate
        dataPoints: closes.length,
        equityCurve: equityCurve.slice(-30), // last 30 points
      };
    }, { ttl: 600 });

    if (!data) return c.json({ error: 'Insufficient data for backtest' }, 404);
    return c.json({ status: 'ok', data });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/analysis/decision?symbol=BBCA — multi-source signal aggregation
analysisRoutes.get('/decision', async (c) => {
  const symbol = c.req.query('symbol') ?? 'BBCA';
  const cache = new Cache(c.env.AEGIS_CACHE, 300);

  try {
    const data = await cache.getOrSet(`decision:${symbol}`, async () => {
      // Fetch technical data from Yahoo
      const yahooSymbol = symbol.includes('.') ? symbol : `${symbol}.JK`;
      const chart = await fetchChart(yahooSymbol, '1d', '6mo');
      const result = chart.chart?.result?.[0];
      if (!result) return null;

      const q = result.indicators?.quote?.[0] ?? {};
      const closes: number[] = (q.close ?? []).filter((v: number | null) => v != null);
      const highs: number[] = (q.high ?? []).filter((v: number | null) => v != null);
      const lows: number[] = (q.low ?? []).filter((v: number | null) => v != null);
      const volumes: number[] = (q.volume ?? []).filter((v: number | null) => v != null);
      if (closes.length < 50) return null;

      const last = closes.length - 1;
      const price = closes[last];

      // Signal 1: RSI
      const rsiValues = rsi(closes, 14);
      const currentRsi = rsiValues[last] ?? 50;
      let rsiSignal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
      let rsiStrength = 50;
      if (currentRsi < 30) { rsiSignal = 'BUY'; rsiStrength = 80 + (30 - currentRsi); }
      else if (currentRsi < 40) { rsiSignal = 'BUY'; rsiStrength = 60; }
      else if (currentRsi > 70) { rsiSignal = 'SELL'; rsiStrength = 80 + (currentRsi - 70); }
      else if (currentRsi > 60) { rsiSignal = 'SELL'; rsiStrength = 60; }
      else { rsiStrength = 40; }

      // Signal 2: MACD
      const macdValues = macd(closes);
      const macdLine = macdValues.macdLine[last];
      const signalLine = macdValues.signal[last];
      const hist = macdValues.histogram[last];
      let macdSignal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
      let macdStrength = 50;
      if (macdLine != null && signalLine != null) {
        if (macdLine > signalLine && hist != null && hist > 0) { macdSignal = 'BUY'; macdStrength = 70; }
        else if (macdLine < signalLine && hist != null && hist < 0) { macdSignal = 'SELL'; macdStrength = 70; }
      }

      // Signal 3: Trend (EMA cross)
      const ema20Values = ema(closes, 20);
      const ema50Values = ema(closes, 50);
      const sma200Values = sma(closes, 200);
      const currentEma20 = ema20Values[last];
      const currentEma50 = ema50Values[last];
      const currentSma200 = sma200Values[last];
      let trendSignal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
      let trendStrength = 50;
      if (currentEma20 != null && currentEma50 != null) {
        if (currentEma20 > currentEma50 && price > currentEma20) { trendSignal = 'BUY'; trendStrength = 75; }
        else if (currentEma20 < currentEma50 && price < currentEma20) { trendSignal = 'SELL'; trendStrength = 75; }
      }
      // Golden/death cross bonus
      if (currentEma50 != null && currentSma200 != null) {
        if (currentEma50 > currentSma200 && trendSignal === 'BUY') trendStrength = 85;
        else if (currentEma50 < currentSma200 && trendSignal === 'SELL') trendStrength = 85;
      }

      // Signal 4: Volume
      const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length);
      const currentVol = volumes[volumes.length - 1];
      const volRatio = avgVol20 > 0 ? currentVol / avgVol20 : 1;
      let volSignal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
      let volStrength = 50;
      if (volRatio > 2 && price > closes[last - 1]) { volSignal = 'BUY'; volStrength = 70; }
      else if (volRatio > 2 && price < closes[last - 1]) { volSignal = 'SELL'; volStrength = 70; }
      else { volStrength = 40; }

      // Signal 5: Bollinger Bands
      const bb = bollinger(closes, 20, 2);
      const bbUpper = bb.upper[last];
      const bbLower = bb.lower[last];
      const bbMiddle = bb.middle[last];
      let bbSignal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
      let bbStrength = 50;
      if (bbLower != null && price <= bbLower) { bbSignal = 'BUY'; bbStrength = 75; }
      else if (bbUpper != null && price >= bbUpper) { bbSignal = 'SELL'; bbStrength = 75; }

      // Signal 6: Support/Resistance proximity
      const recentHighs = highs.slice(-30);
      const recentLows = lows.slice(-30);
      const resistance = Math.max(...recentHighs);
      const support = Math.min(...recentLows);
      let srSignal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
      let srStrength = 50;
      const distToSupport = (price - support) / price;
      const distToResistance = (resistance - price) / price;
      if (distToSupport < 0.02) { srSignal = 'BUY'; srStrength = 70; }
      else if (distToResistance < 0.02) { srSignal = 'SELL'; srStrength = 70; }

      // Aggregate
      const signals = [
        { source: 'RSI (14)', signal: rsiSignal, strength: Math.min(rsiStrength, 100), reasoning: `RSI = ${currentRsi.toFixed(1)} — ${currentRsi < 30 ? 'oversold' : currentRsi > 70 ? 'overbought' : 'neutral zone'}` },
        { source: 'MACD', signal: macdSignal, strength: macdStrength, reasoning: `MACD ${macdLine != null ? (macdLine > (signalLine ?? 0) ? 'above' : 'below') : 'near'} signal, histogram ${hist != null && hist > 0 ? 'positive' : 'negative'}` },
        { source: 'Trend (EMA)', signal: trendSignal, strength: trendStrength, reasoning: `EMA20 ${currentEma20 != null && currentEma50 != null ? (currentEma20 > currentEma50 ? '>' : '<') : '?'} EMA50, price ${price > (currentEma20 ?? 0) ? 'above' : 'below'} EMA20` },
        { source: 'Volume', signal: volSignal, strength: volStrength, reasoning: `Volume ratio: ${volRatio.toFixed(1)}x avg — ${volRatio > 1.5 ? 'above average' : 'normal'}` },
        { source: 'Bollinger', signal: bbSignal, strength: bbStrength, reasoning: `Price ${bbLower != null && price <= bbLower ? 'at lower band (oversold)' : bbUpper != null && price >= bbUpper ? 'at upper band (overbought)' : 'within bands'}` },
        { source: 'Support/Resistance', signal: srSignal, strength: srStrength, reasoning: `Support: ${support.toFixed(0)}, Resistance: ${resistance.toFixed(0)}, Price: ${price.toFixed(0)}` },
      ];

      // Score calculation (weighted)
      const weights: Record<string, number> = { 'RSI (14)': 0.2, 'MACD': 0.2, 'Trend (EMA)': 0.25, 'Volume': 0.1, 'Bollinger': 0.15, 'Support/Resistance': 0.1 };
      let score = 50; // neutral baseline
      for (const s of signals) {
        const w = weights[s.source] ?? 0.15;
        if (s.signal === 'BUY') score += (s.strength - 50) * w;
        else if (s.signal === 'SELL') score -= (s.strength - 50) * w;
      }
      score = Math.max(0, Math.min(100, Math.round(score)));

      let overall: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
      if (score >= 65) overall = 'BUY';
      else if (score <= 35) overall = 'SELL';

      return {
        symbol,
        overall,
        score,
        signals,
        price,
        timestamp: new Date().toISOString(),
      };
    }, { ttl: 300 });

    if (!data) return c.json({ error: 'Insufficient data' }, 404);
    return c.json({ status: 'ok', data });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/analysis/sentiment/:symbol — Reddit sentiment via proxy (placeholder uses CoinGecko community data)
analysisRoutes.get('/sentiment/:symbol', async (c) => {
  const symbol = c.req.param('symbol').toLowerCase();
  const cache = new Cache(c.env.AEGIS_CACHE, 600);

  try {
    const data = await cache.getOrSet(`sentiment:${symbol}`, async () => {
      // Try CoinGecko for crypto
      const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(symbol)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
      const json: any = await res.json();
      const community = json.community_data ?? {};
      const sentiment = json.sentiment_votes_up_pct ?? 50;
      return {
        symbol,
        name: json.name,
        sentiment: { upPct: sentiment, downPct: 100 - sentiment },
        community: {
          twitterFollowers: community.twitter_followers,
          redditSubscribers: community.reddit_subscribers,
          redditAvgPosts48h: community.reddit_average_posts_48h,
          redditAvgComments48h: community.reddit_average_comments_48h,
        },
        publicInterest: json.public_interest_score ?? null,
        marketCapRank: json.market_cap_rank,
        score: json.coingecko_score,
      };
    }, { ttl: 600 });

    return c.json({ status: 'ok', data });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/analysis/news/:symbol — news for symbol
analysisRoutes.get('/news/:symbol', async (c) => {
  const symbol = c.req.param('symbol');
  const cache = new Cache(c.env.AEGIS_CACHE, 300);

  try {
    const data = await cache.getOrSet(`news:${symbol}`, async () => {
      // CoinGecko trending news (no direct news API, use trending as proxy)
      const url = `https://api.coingecko.com/api/v3/search/trending`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const json: any = await res.json();
      return (json.coins ?? []).map((item: any) => ({
        name: item.item.name,
        symbol: item.item.symbol,
        marketCapRank: item.item.market_cap_rank,
        thumb: item.item.thumb,
        score: item.item.score,
      }));
    }, { ttl: 300 });

    return c.json({ status: 'ok', symbol, data });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});
