import { Hono } from 'hono';
import { Cache } from '../cache';
import type { Bindings } from '../index';

export const sessionRoutes = new Hono<{ Bindings: Bindings }>();

// ── Types ──────────────────────────────────────────────────────────

interface SnapshotField {
  value: number | string | null;
  source: string;
  asOf: string;
  status: 'live' | 'delayed' | 'unavailable';
}

interface SessionSnapshot {
  session: 'asia' | 'london' | 'ny';
  generatedAt: string;
  dxy: SnapshotField;
  xauusd: SnapshotField & { changePct?: number; rsi?: number; ema20?: number; ema50?: number };
  eurusd: SnapshotField & { changePct?: number };
  gbpusd: SnapshotField & { changePct?: number };
  usdjpy: SnapshotField & { changePct?: number };
  yield10y: SnapshotField;
  yield2y: SnapshotField;
  spread2y10y: SnapshotField;
  calendarEvents: Array<{
    title: string;
    currency: string;
    impact: string;
    date: string;
    actual?: string;
    forecast?: string;
    previous?: string;
  }>;
  headlines: Array<{ title: string; source: string; pubDate: string }>;
}

interface AnalysisResult {
  regime: 'risk_on' | 'risk_off' | 'neutral' | 'volatile';
  regimeReason: string;
  usdStrength: 'strong' | 'weak' | 'neutral';
  usdStrengthReason: string;
  bias: {
    xauusd: { direction: 'bullish' | 'bearish' | 'neutral'; confidence: number; reason: string };
    eurusd: { direction: 'bullish' | 'bearish' | 'neutral'; confidence: number; reason: string };
    gbpusd: { direction: 'bullish' | 'bearish' | 'neutral'; confidence: number; reason: string };
    usdjpy: { direction: 'bullish' | 'bearish' | 'neutral'; confidence: number; reason: string };
  };
  riskLabel: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';
  riskFactors: string[];
  keyLevels: {
    xauusd: { support: number | null; resistance: number | null };
  };
}

export interface SessionReport {
  session: string;
  generatedAt: string;
  dataAsOf: string;
  status: 'LIVE' | 'DELAYED' | 'PARTIAL';
  confidence: number;
  snapshot: SessionSnapshot;
  analysis: AnalysisResult;
  narrative: {
    summary: string;
    perAssetNotes: Record<string, string>;
    calendarCallouts: string[];
    tags: string[];
  };
  sources: string[];
}

// ── Helpers ────────────────────────────────────────────────────────

// TV Scanner single-symbol fetch
async function tvScanOne(symbol: string, market: string): Promise<any> {
  const res = await fetch('https://scanner.tradingview.com/global/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      columns: ['name', 'description', 'close', 'change', 'RSI', 'EMA20', 'EMA50'],
      filter: [{ left: 'name', operation: 'equal', right: symbol }],
      markets: [market],
      range: [0, 1],
      sort: { sortBy: 'close', sortOrder: 'desc' },
    }),
  });
  if (!res.ok) throw new Error(`TV Scanner ${res.status}`);
  const json: any = await res.json();
  const rows = json?.data ?? [];
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    tvSymbol: r.s,
    name: r.d?.[1],
    price: r.d?.[2],
    changePct: r.d?.[3],
    rsi: r.d?.[4],
    ema20: r.d?.[5],
    ema50: r.d?.[6],
  };
}

// FRED series fetch
async function fredSeries(seriesId: string, apiKey: string, limit = 5): Promise<any> {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED ${res.status} for ${seriesId}`);
  return res.json();
}

// RSS parser (minimal)
function parseRSS(xml: string, limit: number): any[] {
  const items: any[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < limit) {
    const block = match[1];
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/i);
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/i);
    items.push({
      title: title?.[1] ?? title?.[2] ?? '',
      pubDate: pubDate?.[1] ?? null,
    });
  }
  if (items.length === 0) {
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    while ((match = entryRegex.exec(xml)) !== null && items.length < limit) {
      const block = match[1];
      const title = block.match(/<title[^>]*>(.*?)<\/title>/i);
      const updated = block.match(/<updated>(.*?)<\/updated>/i);
      items.push({
        title: title?.[1] ?? '',
        pubDate: updated?.[1] ?? null,
      });
    }
  }
  return items;
}

// Session time windows (UTC hours)
const SESSION_WINDOWS: Record<string, { start: number; end: number }> = {
  asia: { start: 0, end: 8 },
  london: { start: 6, end: 14 },
  ny: { start: 12, end: 21 },
};

function isEventInSession(eventDate: string, session: string): boolean {
  const d = new Date(eventDate);
  const utcHour = d.getUTCHours();
  const window = SESSION_WINDOWS[session];
  if (!window) return false;
  if (window.start < window.end) return utcHour >= window.start && utcHour < window.end;
  return utcHour >= window.start || utcHour < window.end;
}

function snapshotField(value: number | string | null, source: string, status: 'live' | 'delayed' | 'unavailable' = 'live'): SnapshotField {
  return { value, source, asOf: new Date().toISOString(), status };
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Snapshot Builder ───────────────────────────────────────────────

async function buildSessionSnapshot(session: string, env: Bindings): Promise<SessionSnapshot> {
  const now = new Date().toISOString();

  // Parallel fetch: DXY, forex pairs, yields, calendar, headlines
  const [dxyResult, xauResult, eurResult, gbpResult, jpyResult, yieldsResult, calendarResult, headlinesResult] = await Promise.allSettled([
    tvScanOne('TVC:DXY', 'cfd'),
    tvScanOne('XAUUSD', 'cfd'),
    tvScanOne('EURUSD', 'forex'),
    tvScanOne('GBPUSD', 'forex'),
    tvScanOne('USDJPY', 'forex'),
    (async () => {
      if (!env.FRED_API_KEY) return null;
      const [raw10y, raw2y] = await Promise.all([
        fredSeries('DGS10', env.FRED_API_KEY, 5),
        fredSeries('DGS2', env.FRED_API_KEY, 5),
      ]);
      const obs10y = (raw10y as any)?.observations ?? [];
      const obs2y = (raw2y as any)?.observations ?? [];
      const latest10y = obs10y.find((o: any) => o.value !== '.');
      const latest2y = obs2y.find((o: any) => o.value !== '.');
      const v10y = latest10y ? parseFloat(latest10y.value) : null;
      const v2y = latest2y ? parseFloat(latest2y.value) : null;
      const spread = v10y != null && v2y != null ? parseFloat((v10y - v2y).toFixed(2)) : null;
      return { v10y, v2y, spread };
    })(),
    (async () => {
      const res = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json');
      if (!res.ok) return [];
      const raw: any[] = await res.json() as any[];
      return raw.map((e: any) => ({
        title: e.title,
        currency: e.currency ?? '',
        impact: e.impact ?? 'low',
        date: e.date,
        actual: e.actual ?? undefined,
        forecast: e.forecast ?? undefined,
        previous: e.previous ?? undefined,
      }));
    })(),
    (async () => {
      const feeds = [
        'https://www.investing.com/rss/news.rss',
        'https://www.cnbc.com/id/100003114/device/rss/rss.html',
      ];
      const items: Array<{ title: string; source: string; pubDate: string }> = [];
      await Promise.all(feeds.map(async (url) => {
        try {
          const res = await fetch(url, {
            headers: { 'User-Agent': 'AegisTerminal/1.0' },
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) return;
          const xml = await res.text();
          const parsed = parseRSS(xml, 5);
          const source = url.includes('investing') ? 'Investing.com' : 'CNBC';
          for (const item of parsed) {
            items.push({ title: item.title, source, pubDate: item.pubDate ?? '' });
          }
        } catch { /* skip */ }
      }));
      return items.slice(0, 5);
    })(),
  ]);

  // DXY
  const dxyData = dxyResult.status === 'fulfilled' ? dxyResult.value : null;
  const dxy: SnapshotField = dxyData
    ? snapshotField(dxyData.price, 'TradingView Scanner')
    : snapshotField(null, 'TradingView Scanner', 'unavailable');

  // Forex pairs
  const makeForexField = (result: PromiseSettledResult<any>, fallbackSymbol: string) => {
    const data = result.status === 'fulfilled' ? result.value : null;
    if (!data) return { ...snapshotField(null, 'TradingView Scanner', 'unavailable'), changePct: undefined, rsi: undefined, ema20: undefined, ema50: undefined };
    return {
      ...snapshotField(data.price, 'TradingView Scanner'),
      changePct: data.changePct ?? undefined,
      rsi: data.rsi ?? undefined,
      ema20: data.ema20 ?? undefined,
      ema50: data.ema50 ?? undefined,
    };
  };

  const xauusd = makeForexField(xauResult, 'XAUUSD');
  const eurusd = makeForexField(eurResult, 'EURUSD');
  const gbpusd = makeForexField(gbpResult, 'GBPUSD');
  const usdjpy = makeForexField(jpyResult, 'USDJPY');

  // Yields
  const yieldsData = yieldsResult.status === 'fulfilled' ? yieldsResult.value : null;
  const yield10y: SnapshotField = yieldsData?.v10y != null
    ? snapshotField(yieldsData.v10y, 'FRED')
    : snapshotField(null, 'FRED', 'unavailable');
  const yield2y: SnapshotField = yieldsData?.v2y != null
    ? snapshotField(yieldsData.v2y, 'FRED')
    : snapshotField(null, 'FRED', 'unavailable');
  const spread2y10y: SnapshotField = yieldsData?.spread != null
    ? snapshotField(yieldsData.spread, 'FRED (computed)')
    : snapshotField(null, 'FRED', 'unavailable');

  // Calendar events filtered to session window
  const allEvents = calendarResult.status === 'fulfilled' ? calendarResult.value : [];
  const calendarEvents = allEvents.filter((e: any) => isEventInSession(e.date, session));

  // Headlines
  const headlines = headlinesResult.status === 'fulfilled' ? headlinesResult.value : [];

  return {
    session: session as 'asia' | 'london' | 'ny',
    generatedAt: now,
    dxy,
    xauusd: xauusd as SessionSnapshot['xauusd'],
    eurusd: eurusd as SessionSnapshot['eurusd'],
    gbpusd: gbpusd as SessionSnapshot['gbpusd'],
    usdjpy: usdjpy as SessionSnapshot['usdjpy'],
    yield10y,
    yield2y,
    spread2y10y,
    calendarEvents,
    headlines,
  };
}

// ── Deterministic Analysis ─────────────────────────────────────────

function runDeterministicAnalysis(snapshot: SessionSnapshot): AnalysisResult {
  const dxy = snapshot.dxy.value != null ? Number(snapshot.dxy.value) : null;
  const xauPrice = snapshot.xauusd.value != null ? Number(snapshot.xauusd.value) : null;
  const eurPrice = snapshot.eurusd.value != null ? Number(snapshot.eurusd.value) : null;
  const gbpPrice = snapshot.gbpusd.value != null ? Number(snapshot.gbpusd.value) : null;
  const jpyPrice = snapshot.usdjpy.value != null ? Number(snapshot.usdjpy.value) : null;
  const yield10 = snapshot.yield10y.value != null ? Number(snapshot.yield10y.value) : null;
  const yield2 = snapshot.yield2y.value != null ? Number(snapshot.yield2y.value) : null;
  const xauChange = snapshot.xauusd.changePct ?? 0;
  const eurChange = snapshot.eurusd.changePct ?? 0;
  const gbpChange = snapshot.gbpusd.changePct ?? 0;
  const jpyChange = snapshot.usdjpy.changePct ?? 0;
  const xauRsi = snapshot.xauusd.rsi ?? null;

  // ── USD Strength ──
  let usdStrength: 'strong' | 'weak' | 'neutral' = 'neutral';
  let usdStrengthReason = '';

  if (dxy != null) {
    if (dxy > 105) { usdStrength = 'strong'; usdStrengthReason = `DXY ${dxy.toFixed(1)} > 105`; }
    else if (dxy < 100) { usdStrength = 'weak'; usdStrengthReason = `DXY ${dxy.toFixed(1)} < 100`; }
    else { usdStrengthReason = `DXY ${dxy.toFixed(1)} in neutral range`; }
  } else {
    // Composite fallback
    let score = 0;
    if (eurChange < 0) score++; else if (eurChange > 0) score--;
    if (gbpChange < 0) score++; else if (gbpChange > 0) score--;
    if (jpyChange > 0) score++; else if (jpyChange < 0) score--;
    if (score >= 2) { usdStrength = 'strong'; usdStrengthReason = 'Composite: EUR/GBP down + USD/JPY up'; }
    else if (score <= -2) { usdStrength = 'weak'; usdStrengthReason = 'Composite: EUR/GBP up + USD/JPY down'; }
    else { usdStrengthReason = 'Composite: mixed signals'; }
  }

  // ── Regime ──
  let regime: 'risk_on' | 'risk_off' | 'neutral' | 'volatile' = 'neutral';
  let regimeReason = '';

  const hasHighEventSoon = snapshot.calendarEvents.some(e => {
    if (e.impact.toLowerCase() !== 'high') return false;
    const ms = new Date(e.date).getTime() - Date.now();
    return ms > 0 && ms < 2 * 3600000;
  });

  if (hasHighEventSoon) {
    regime = 'volatile';
    regimeReason = 'High-impact event within 2 hours';
  } else if (yield10 != null && xauPrice != null) {
    const yieldsRising = yield10 > 4.5; // rough threshold
    const goldFlat = Math.abs(xauChange) < 0.5;
    const goldUp = xauChange > 0.5;

    if (yieldsRising && goldFlat && usdStrength !== 'strong') {
      regime = 'risk_on';
      regimeReason = 'Yields rising, gold flat, USD neutral';
    } else if (!yieldsRising && goldUp && usdStrength !== 'weak') {
      regime = 'risk_off';
      regimeReason = 'Yields falling, gold rising (flight to safety)';
    } else {
      regimeReason = 'Mixed signals across yields/gold/USD';
    }
  } else {
    regimeReason = 'Insufficient data for regime classification';
  }

  // ── Bias per asset ──
  const biasConfidence = (base: number, factors: number[]) => {
    const sum = factors.reduce((a, b) => a + b, 0);
    return Math.min(90, Math.max(10, base + sum));
  };

  const xauBias = (): AnalysisResult['bias']['xauusd'] => {
    if (usdStrength === 'weak' || regime === 'risk_off') {
      const conf = biasConfidence(55, [
        usdStrength === 'weak' ? 15 : 0,
        regime === 'risk_off' ? 10 : 0,
        xauRsi != null && xauRsi < 40 ? 10 : xauRsi != null && xauRsi > 60 ? -5 : 0,
        snapshot.xauusd.ema20 != null && snapshot.xauusd.ema50 != null && snapshot.xauusd.ema20 > snapshot.xauusd.ema50 ? 5 : 0,
      ]);
      return { direction: 'bullish', confidence: conf, reason: `USD ${usdStrength} + ${regime} regime favors gold` };
    }
    if (usdStrength === 'strong' && regime === 'risk_on') {
      const conf = biasConfidence(55, [
        15,
        xauRsi != null && xauRsi > 60 ? 10 : xauRsi != null && xauRsi < 40 ? -5 : 0,
      ]);
      return { direction: 'bearish', confidence: conf, reason: `Strong USD + risk-on pressures gold lower` };
    }
    return { direction: 'neutral', confidence: 35, reason: 'No clear directional signal' };
  };

  const eurBias = (): AnalysisResult['bias']['eurusd'] => {
    if (usdStrength === 'weak') return { direction: 'bullish', confidence: 65, reason: 'Weak USD = bullish EUR/USD' };
    if (usdStrength === 'strong') return { direction: 'bearish', confidence: 65, reason: 'Strong USD = bearish EUR/USD' };
    return { direction: 'neutral', confidence: 40, reason: 'USD neutral' };
  };

  const gbpBias = (): AnalysisResult['bias']['gbpusd'] => {
    if (usdStrength === 'weak') return { direction: 'bullish', confidence: 55, reason: 'Weak USD supportive for GBP/USD' };
    if (usdStrength === 'strong') return { direction: 'bearish', confidence: 55, reason: 'Strong USD pressures GBP/USD' };
    return { direction: 'neutral', confidence: 35, reason: 'USD neutral' };
  };

  const jpyBias = (): AnalysisResult['bias']['usdjpy'] => {
    if (usdStrength === 'strong') return { direction: 'bullish', confidence: 60, reason: 'Strong USD = bullish USD/JPY' };
    if (usdStrength === 'weak') return { direction: 'bearish', confidence: 60, reason: 'Weak USD = bearish USD/JPY' };
    return { direction: 'neutral', confidence: 38, reason: 'USD neutral' };
  };

  // ── Risk label ──
  const riskFactors: string[] = [];
  let riskLabel: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME' = 'LOW';

  const hasHighEvent = snapshot.calendarEvents.some(e => e.impact.toLowerCase() === 'high');
  const hasMedEvent = snapshot.calendarEvents.some(e => e.impact.toLowerCase() === 'medium');
  const highEventWithin1h = snapshot.calendarEvents.some(e => {
    if (e.impact.toLowerCase() !== 'high') return false;
    const ms = new Date(e.date).getTime() - Date.now();
    return ms > 0 && ms < 3600000;
  });

  if (highEventWithin1h) {
    riskLabel = 'EXTREME';
    riskFactors.push('High-impact event within 1 hour');
  } else if (hasHighEvent) {
    riskLabel = 'HIGH';
    riskFactors.push('High-impact event in session window');
  } else if (hasMedEvent) {
    riskLabel = 'MODERATE';
    riskFactors.push('Medium-impact event in session');
  }

  // Check conflicting signals
  const biases = [xauBias().direction, eurBias().direction, gbpBias().direction, jpyBias().direction];
  const bullCount = biases.filter(b => b === 'bullish').length;
  const bearCount = biases.filter(b => b === 'bearish').length;
  if (bullCount >= 2 && bearCount >= 2) {
    if (riskLabel === 'LOW') riskLabel = 'MODERATE';
    riskFactors.push('Conflicting signals across 3+ pairs');
  }

  if (regime === 'volatile') {
    if (riskLabel === 'LOW') riskLabel = 'HIGH';
    riskFactors.push('Volatile regime detected');
  }

  if (riskFactors.length === 0) riskFactors.push('No elevated risk factors');

  // ── Key levels ──
  const xauSupport = xauPrice != null && snapshot.xauusd.ema50 != null ? snapshot.xauusd.ema50 : null;
  const xauResistance = xauPrice != null && snapshot.xauusd.ema20 != null ? snapshot.xauusd.ema20 : null;

  return {
    regime,
    regimeReason,
    usdStrength,
    usdStrengthReason,
    bias: {
      xauusd: xauBias(),
      eurusd: eurBias(),
      gbpusd: gbpBias(),
      usdjpy: jpyBias(),
    },
    riskLabel,
    riskFactors,
    keyLevels: {
      xauusd: { support: xauSupport, resistance: xauResistance },
    },
  };
}

// ── Narrative Composer (Groq) ──────────────────────────────────────

async function composeNarrative(snapshot: SessionSnapshot, analysis: AnalysisResult, groqKey: string): Promise<SessionReport['narrative']> {
  const systemPrompt = `You are Aegis Session Analyst. Write a concise market session report.
RULES:
- Use ONLY the numbers provided in the JSON. If a field is null, say "data not available".
- Never invent numbers, dates, or events.
- Be concise and actionable.
- Use markdown bold for emphasis.`;

  const input = JSON.stringify({ snapshot, analysis }, null, 2);

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analyze this session data and respond in JSON format with: { "summary": string (2-3 sentences), "perAssetNotes": { "XAUUSD": string, "EURUSD": string, "GBPUSD": string, "USDJPY": string }, "calendarCallouts": string[] (max 3), "tags": string[] (max 5, e.g. "risk-off", "USD-strength", "gold-bullish") }\n\n${input}` },
      ],
      temperature: 0.3,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Groq narrative error:', res.status, errText);
    return buildFallbackNarrative(snapshot, analysis);
  }

  const data: any = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '{}';

  try {
    const parsed = JSON.parse(content);
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'Session analysis generated.',
      perAssetNotes: parsed.perAssetNotes ?? {},
      calendarCallouts: Array.isArray(parsed.calendarCallouts) ? parsed.calendarCallouts : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    };
  } catch {
    return buildFallbackNarrative(snapshot, analysis);
  }
}

function buildFallbackNarrative(snapshot: SessionSnapshot, analysis: AnalysisResult): SessionReport['narrative'] {
  const { bias, regime, usdStrength, riskLabel } = analysis;
  const summary = `Session: ${snapshot.session.toUpperCase()}. Regime: ${regime}. USD: ${usdStrength}. Risk: ${riskLabel}.`;

  const perAssetNotes: Record<string, string> = {};
  for (const [key, b] of Object.entries(bias)) {
    perAssetNotes[key.toUpperCase()] = `${b.direction} (${b.confidence}%) — ${b.reason}`;
  }

  const calendarCallouts = snapshot.calendarEvents
    .filter(e => e.impact.toLowerCase() === 'high')
    .slice(0, 3)
    .map(e => `${e.currency} ${e.title}`);

  const tags = [regime, `USD-${usdStrength}`, riskLabel.toLowerCase()];

  return { summary, perAssetNotes, calendarCallouts, tags };
}

// ── Report Validator ───────────────────────────────────────────────

function validateReport(
  narrative: SessionReport['narrative'],
  snapshot: SessionSnapshot,
  analysis: AnalysisResult,
): { valid: boolean; issues: string[]; cleanedNarrative: SessionReport['narrative'] } {
  const issues: string[] = [];

  // Sanity bounds
  const bounds: Record<string, [number, number]> = {
    DXY: [85, 125],
    XAUUSD: [1000, 5000],
    EURUSD: [0.8, 1.5],
    GBPUSD: [1.0, 1.5],
    USDJPY: [100, 200],
    YIELD: [0, 15],
  };

  const checkBound = (name: string, val: number | null | undefined, range: [number, number]) => {
    if (val == null) return;
    if (val < range[0] || val > range[1]) {
      issues.push(`${name} value ${val} outside sanity range [${range[0]}, ${range[1]}]`);
    }
  };

  checkBound('DXY', snapshot.dxy.value as number, bounds.DXY);
  checkBound('XAUUSD', snapshot.xauusd.value as number, bounds.XAUUSD);
  checkBound('EURUSD', snapshot.eurusd.value as number, bounds.EURUSD);
  checkBound('GBPUSD', snapshot.gbpusd.value as number, bounds.GBPUSD);
  checkBound('USDJPY', snapshot.usdjpy.value as number, bounds.USDJPY);
  checkBound('YIELD10Y', snapshot.yield10y.value as number, bounds.YIELD);

  // Check data freshness
  const generatedMs = new Date(snapshot.generatedAt).getTime();
  const ageHours = (Date.now() - generatedMs) / 3600000;
  if (ageHours > 24) issues.push('Data older than 24 hours');

  // Extract numbers from narrative text and validate against snapshot
  const allText = [
    narrative.summary,
    ...Object.values(narrative.perAssetNotes),
    ...narrative.calendarCallouts,
  ].join(' ');

  const numberRegex = /[\d,]+\.?\d*/g;
  const narrativeNumbers = (allText.match(numberRegex) ?? [])
    .map(s => parseFloat(s.replace(/,/g, '')))
    .filter(n => !isNaN(n) && n > 0);

  // Known snapshot values for grounding check
  const knownValues = new Set<number>();
  const addVal = (v: number | string | null | undefined) => {
    if (v != null && typeof v === 'number') knownValues.add(Math.round(v * 100) / 100);
  };
  addVal(snapshot.dxy.value as number);
  addVal(snapshot.xauusd.value as number);
  addVal(snapshot.eurusd.value as number);
  addVal(snapshot.gbpusd.value as number);
  addVal(snapshot.usdjpy.value as number);
  addVal(snapshot.yield10y.value as number);
  addVal(snapshot.yield2y.value as number);
  addVal(snapshot.spread2y10y.value as number);
  addVal(snapshot.xauusd.changePct);
  addVal(snapshot.xauusd.rsi);
  addVal(snapshot.xauusd.ema20);
  addVal(snapshot.xauusd.ema50);

  // Check if narrative numbers are grounded (within 1% of known values)
  for (const n of narrativeNumbers) {
    if (n < 10) continue; // skip small numbers (percentages, counts)
    const grounded = [...knownValues].some(v => Math.abs(v - n) / Math.max(Math.abs(v), 1) < 0.01);
    if (!grounded) {
      issues.push(`Ungrounded number in narrative: ${n}`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    cleanedNarrative: narrative, // In production, strip ungrounded numbers
  };
}

// ── Report Status ──────────────────────────────────────────────────

function computeStatus(snapshot: SessionSnapshot): 'LIVE' | 'DELAYED' | 'PARTIAL' {
  const now = Date.now();
  const generated = new Date(snapshot.generatedAt).getTime();
  const ageHours = (now - generated) / 3600000;

  if (ageHours > 6) return 'PARTIAL';
  if (ageHours > 2) return 'DELAYED';

  // Check if any key field is unavailable
  const unavailable = [snapshot.dxy, snapshot.xauusd, snapshot.eurusd, snapshot.yield10y]
    .filter(f => f.status === 'unavailable').length;
  if (unavailable >= 2) return 'PARTIAL';

  return 'LIVE';
}

function computeConfidence(analysis: AnalysisResult, snapshot: SessionSnapshot): number {
  let conf = 60;
  if (snapshot.dxy.status === 'live') conf += 10;
  if (snapshot.yield10y.status === 'live') conf += 10;
  if (snapshot.calendarEvents.length > 0) conf += 5;
  if (analysis.regime !== 'neutral') conf += 5;
  if (snapshot.xauusd.rsi != null) conf += 5;
  return Math.min(100, conf);
}

// ── Full Pipeline ──────────────────────────────────────────────────

async function generateReport(session: string, env: Bindings): Promise<SessionReport> {
  const snapshot = await buildSessionSnapshot(session, env);
  const analysis = runDeterministicAnalysis(snapshot);

  let narrative: SessionReport['narrative'];
  if (env.GROQ_API_KEY && env.GROQ_API_KEY.trim() !== '') {
    try {
      narrative = await composeNarrative(snapshot, analysis, env.GROQ_API_KEY);
    } catch {
      narrative = buildFallbackNarrative(snapshot, analysis);
    }
  } else {
    narrative = buildFallbackNarrative(snapshot, analysis);
  }

  const validation = validateReport(narrative, snapshot, analysis);
  if (!validation.valid) {
    console.warn('Report validation issues:', validation.issues);
  }

  const status = computeStatus(snapshot);
  const confidence = computeConfidence(analysis, snapshot);
  const sources = ['TradingView Scanner', 'FRED', 'ForexFactory', 'RSS Feeds'];

  return {
    session,
    generatedAt: new Date().toISOString(),
    dataAsOf: snapshot.generatedAt,
    status,
    confidence,
    snapshot,
    analysis,
    narrative: validation.cleanedNarrative,
    sources,
  };
}

// ── Routes ─────────────────────────────────────────────────────────

// GET /api/session/report?session=asia|london|ny
sessionRoutes.get('/report', async (c) => {
  const session = c.req.query('session') ?? 'asia';
  if (!['asia', 'london', 'ny'].includes(session)) {
    return c.json({ error: 'Invalid session. Use: asia, london, ny' }, 400);
  }

  const cache = new Cache(c.env.AEGIS_CACHE, 1800);
  const key = `session:report:${session}:${todayKey()}`;

  try {
    const data = await cache.get<SessionReport>(key);
    if (!data) {
      return c.json({ status: 'ok', data: null, message: 'No report generated yet. POST /api/session/report/refresh to generate.' });
    }
    return c.json({ status: 'ok', data });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// POST /api/session/report/refresh?session=asia|london|ny
sessionRoutes.post('/report/refresh', async (c) => {
  const session = c.req.query('session') ?? 'asia';
  if (!['asia', 'london', 'ny'].includes(session)) {
    return c.json({ error: 'Invalid session. Use: asia, london, ny' }, 400);
  }

  const cache = new Cache(c.env.AEGIS_CACHE, 1800);

  try {
    const report = await generateReport(session, c.env);
    const key = `session:report:${session}:${todayKey()}`;
    await cache.set(key, report, { ttl: 1800 });
    return c.json({ status: 'ok', data: report });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/session/report/archive?session=asia|london|ny
sessionRoutes.get('/report/archive', async (c) => {
  const session = c.req.query('session') ?? 'asia';
  if (!['asia', 'london', 'ny'].includes(session)) {
    return c.json({ error: 'Invalid session. Use: asia, london, ny' }, 400);
  }

  // KV doesn't support list with prefix easily, so return today's report
  const cache = new Cache(c.env.AEGIS_CACHE, 1800);
  const key = `session:report:${session}:${todayKey()}`;

  try {
    const data = await cache.get<SessionReport>(key);
    return c.json({
      status: 'ok',
      data: data ? [data] : [],
      message: data ? '1 report found for today' : 'No reports found for today',
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});
