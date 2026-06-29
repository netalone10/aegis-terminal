import { Hono } from 'hono';
import { Cache } from '../cache';
import type { Bindings } from '../index';

export const sentimentRoutes = new Hono<{ Bindings: Bindings }>();

const COT_API = 'https://publicreporting.cftc.gov/resource/gpe5-46if.json';
const COT_TTL = 43200; // 12 hours

const CURRENCIES = [
  { search: 'EURO FX', label: 'EUR/USD', pair: 'EURUSD' },
  { search: 'GOLD', label: 'XAU/USD', pair: 'XAUUSD' },
  { search: 'JAPANESE YEN', label: 'USD/JPY', pair: 'USDJPY' },
  { search: 'BRITISH POUND', label: 'GBP/USD', pair: 'GBPUSD' },
  { search: 'SWISS FRANC', label: 'USD/CHF', pair: 'USDCHF' },
  { search: 'AUSTRALIAN DOLLAR', label: 'AUD/USD', pair: 'AUDUSD' },
  { search: 'CANADIAN DOLLAR', label: 'USD/CAD', pair: 'USDCAD' },
  { search: 'NZ DOLLAR', label: 'NZD/USD', pair: 'NZDUSD' },
];

interface CotRaw {
  market_and_exchange_names: string;
  report_date_as_yyyy_mm_dd: string;
  noncomm_positions_long_all: string;
  noncomm_positions_short_all: string;
  noncomm_positions_spread_all: string;
  change_in_noncomm_long_all: string;
  change_in_noncomm_short_all: string;
  comm_positions_long_all: string;
  comm_positions_short_all: string;
  open_interest_all: string;
}

interface CotParsed {
  pair: string;
  label: string;
  reportDate: string;
  netPosition: number;
  longs: number;
  shorts: number;
  spread: number;
  changeLong: number;
  changeShort: number;
  netChange: number;
  openInterest: number;
  pctLong: number;
  pctShort: number;
  bias: 'bullish' | 'bearish' | 'neutral';
  commercialNet: number;
}

// GET /api/sentiment/cot
sentimentRoutes.get('/cot', async (c) => {
  const cache = new Cache(c.env.AEGIS_CACHE, COT_TTL);

  try {
    const data = await cache.getOrSet<CotParsed[]>('sentiment:cot', async () => {
      const where = CURRENCIES.map(
        cur => `market_and_exchange_names like '%${cur.search}%'`
      ).join(' OR ');

      const url = `${COT_API}?$where=${encodeURIComponent(where)}&$order=report_date_as_yyyy_mm_dd DESC&$limit=200`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`CFTC API ${res.status}`);
      const raw: CotRaw[] = await res.json() as any;

      // Group by currency, take latest 2 per currency (current + previous week)
      const byPair: Record<string, CotRaw[]> = {};
      for (const row of raw) {
        const cur = CURRENCIES.find(c => row.market_and_exchange_names.includes(c.search));
        if (!cur) continue;
        if (!byPair[cur.pair]) byPair[cur.pair] = [];
        if (byPair[cur.pair].length < 2) byPair[cur.pair].push(row);
      }

      const result: CotParsed[] = [];
      for (const cur of CURRENCIES) {
        const rows = byPair[cur.pair];
        if (!rows || rows.length === 0) continue;

        const latest = rows[0];
        const prev = rows[1] ?? rows[0];

        const longs = parseInt(latest.noncomm_positions_long_all) || 0;
        const shorts = parseInt(latest.noncomm_positions_short_all) || 0;
        const spread = parseInt(latest.noncomm_positions_spread_all) || 0;
        const net = longs - shorts;
        const oi = parseInt(latest.open_interest_all) || 1;
        const commLong = parseInt(latest.comm_positions_long_all) || 0;
        const commShort = parseInt(latest.comm_positions_short_all) || 0;

        const prevLongs = parseInt(prev.noncomm_positions_long_all) || 0;
        const prevShorts = parseInt(prev.noncomm_positions_short_all) || 0;
        const prevNet = prevLongs - prevShorts;
        const netChange = net - prevNet;

        const pctLong = Math.round((longs / oi) * 100);
        const pctShort = Math.round((shorts / oi) * 100);

        let bias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
        if (net > oi * 0.15) bias = 'bullish';
        else if (net < -oi * 0.15) bias = 'bearish';

        result.push({
          pair: cur.pair,
          label: cur.label,
          reportDate: latest.report_date_as_yyyy_mm_dd?.slice(0, 10) ?? '',
          netPosition: net,
          longs,
          shorts,
          spread,
          changeLong: parseInt(latest.change_in_noncomm_long_all) || 0,
          changeShort: parseInt(latest.change_in_noncomm_short_all) || 0,
          netChange,
          openInterest: oi,
          pctLong,
          pctShort,
          bias,
          commercialNet: commLong - commShort,
        });
      }

      return result;
    }, { ttl: COT_TTL });

    return c.json({ status: 'ok', data });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});
