import { Hono } from 'hono';
import { Cache } from '../cache';
import type { Bindings } from '../index';
import { getMultiTFData, analyzeSMC } from './smc';

export const planRoutes = new Hono<{ Bindings: Bindings }>();

const ACCOUNT_SIZE = 10000;
const RISK_PCT = 2;
const CHECKLIST = [
  'HTF bias confirmed (Daily + 4H aligned)',
  'Key level identified (OB / FVG / Liquidity)',
  'Kill Zone active for entry pair',
  'No high-impact news within 1 hour',
  'R:R ≥ 1:2 on planned setup',
  'Stop loss placed beyond structure',
  'Position sized within risk budget',
  'Trade thesis documented in journal',
];

function getActiveKillZones(): string[] {
  const now = new Date();
  const wibHour = (now.getUTCHours() + 7) % 24;
  const zones: string[] = [];
  if (wibHour >= 7 && wibHour < 11) zones.push('Asian (07:00–11:00 WIB)');
  if (wibHour >= 13 && wibHour < 17) zones.push('London (13:00–17:00 WIB)');
  if (wibHour >= 19 && wibHour < 23) zones.push('New York AM (19:00–23:00 WIB)');
  if (wibHour >= 0 && wibHour < 3) zones.push('New York PM (00:00–03:00 WIB)');
  return zones;
}

function isForexMarketOpen(): boolean {
  const now = new Date();
  const utcDay = now.getUTCDay();
  const utcHour = now.getUTCHours();
  if (utcDay === 6) return false;
  if (utcDay === 0 && utcHour < 22) return false;
  return true;
}

function getRiskMood(pairs: any[]): 'risk-on' | 'risk-off' | 'mixed' {
  let bullCount = 0;
  let bearCount = 0;
  for (const p of pairs) {
    if (p.bias === 'bullish') bullCount++;
    else if (p.bias === 'bearish') bearCount++;
  }
  const total = bullCount + bearCount;
  if (total === 0) return 'mixed';
  if (bullCount / total > 0.65) return 'risk-on';
  if (bearCount / total > 0.65) return 'risk-off';
  return 'mixed';
}

planRoutes.get('/daily', async (c) => {
  const cache = new Cache(c.env.AEGIS_CACHE, 21600);

  try {
    // Clear stale cache if it contains an error
    const cached = await cache.get<any>('plan:daily');
    if (cached && cached.error) {
      await cache.delete('plan:daily');
    }

    const data = await cache.getOrSet('plan:daily:v2', async () => {
      // Direct SMC analysis — no internal fetch needed
      const symbols = [
        { name: 'XAUUSD', label: 'XAU/USD', market: 'cfd' },
        { name: 'EURUSD', label: 'EUR/USD', market: 'forex' },
        { name: 'GBPUSD', label: 'GBP/USD', market: 'forex' },
        { name: 'USDJPY', label: 'USD/JPY', market: 'forex' },
        { name: 'USDIDR', label: 'USD/IDR', market: 'forex' },
        { name: 'USDCHF', label: 'USD/CHF', market: 'forex' },
      ];

      const pairs: any[] = [];
      for (const s of symbols) {
        try {
          const raw = await getMultiTFData(s.name, s.market, '1D');
          const analysis = raw ? analyzeSMC(raw) : null;
          if (analysis) pairs.push({ symbol: s.label, ...analysis });
        } catch { /* skip */ }
      }

      // Fetch calendar
      let events: any[] = [];
      try {
        const calRes = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json');
        if (calRes.ok) {
          const calData: any = await calRes.json();
          events = (Array.isArray(calData) ? calData : []).map((e: any) => ({
            title: e.title,
            currency: e.currency,
            impact: e.impact,
            date: e.date,
            forecast: e.forecast,
            previous: e.previous,
            actual: e.actual,
          }));
        }
      } catch { /* no calendar */ }

      let bullCount = 0, bearCount = 0;
      for (const p of pairs) {
        if (p.bias === 'bullish') bullCount++;
        else if (p.bias === 'bearish') bearCount++;
      }
      const total = bullCount + bearCount;
      let overallBias = 'neutral';
      if (bullCount > bearCount) overallBias = 'bullish';
      else if (bearCount > bullCount) overallBias = 'bearish';

      const riskMood = getRiskMood(pairs);
      const marketOpen = isForexMarketOpen();
      const killZones = getActiveKillZones();

      const today = new Date().toISOString().slice(0, 10);
      const todayEvents = events.filter((e: any) => {
        if (!e.date) return false;
        const evDate = new Date(e.date).toISOString().slice(0, 10);
        return evDate === today;
      });

      const pairCards = pairs.map((p: any) => {
        const action = p.bias === 'neutral' ? 'WAIT' : p.bias === 'bullish' ? 'BUY' : 'SELL';
        const keyLevels = (p.levels ?? []).slice(0, 4).map((l: any) => ({
          type: l.type, label: l.label, zone: l.zone, strength: l.strength,
        }));
        return {
          symbol: p.symbol, bias: p.bias, confidence: p.confidence,
          premiumDiscount: p.premiumDiscount, action, keyLevels,
          tradeSetup: p.tradeSetup, signals: (p.signals ?? []).slice(0, 3), meta: p.meta,
        };
      });

      const bestPair = [...pairCards]
        .filter((p) => p.bias !== 'neutral' && p.tradeSetup)
        .sort((a, b) => b.confidence - a.confidence)[0] ?? null;

      const maxRisk = ACCOUNT_SIZE * (RISK_PCT / 100);

      return {
        date: new Date().toISOString(),
        overview: { overallBias, riskMood, marketOpen, killZones, pairCount: pairs.length, bullCount, bearCount, neutralCount: pairs.length - total },
        pairs: pairCards,
        news: todayEvents,
        bestSetup: bestPair ? {
          symbol: bestPair.symbol, direction: bestPair.action,
          confidence: bestPair.confidence, entry: bestPair.tradeSetup?.entry,
          sl: bestPair.tradeSetup?.sl, tp1: bestPair.tradeSetup?.tp1,
          tp2: bestPair.tradeSetup?.tp2, rr: bestPair.tradeSetup?.rr1,
          reason: bestPair.signals?.[0] ?? '',
        } : null,
        riskBudget: { accountSize: ACCOUNT_SIZE, riskPct: RISK_PCT, maxRisk, label: `Today max risk: ${RISK_PCT}% = $${maxRisk.toFixed(0)} on $${ACCOUNT_SIZE.toLocaleString()} account` },
        checklist: CHECKLIST,
      };
    }, { ttl: 21600 });

    return c.json({ status: 'ok', data });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});
