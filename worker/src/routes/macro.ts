import { Hono } from 'hono';
import { Cache } from '../cache';
import type { Bindings } from '../index';

export const macroRoutes = new Hono<{ Bindings: Bindings }>();

// FRED API helper
async function fredSeries(seriesId: string, apiKey: string, limit = 10): Promise<any> {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED ${res.status} for ${seriesId}`);
  return res.json();
}

// GET /api/macro/indicators — key macro indicators from FRED
macroRoutes.get('/indicators', async (c) => {
  const apiKey = c.env.FRED_API_KEY;
  if (!apiKey) return c.json({ error: 'FRED_API_KEY not configured' }, 500);
  const cache = new Cache(c.env.AEGIS_CACHE, 3600); // 1 hour TTL

  const series: Record<string, string> = {
    'GDP': 'GDP',
    'CPI': 'CPIAUCSL',
    'Unemployment': 'UNRATE',
    'FedFunds': 'FEDFUNDS',
    'Treasury10Y': 'DGS10',
    'Treasury2Y': 'DGS2',
    'Treasury3M': 'DTB3',
    'VIX': 'VIXCLS',
    'SP500': 'SP500',
    'M2': 'M2SL',
    'PCE': 'PCE',
    'IndustrialProd': 'INDPRO',
  };

  try {
    const data = await cache.getOrSet('macro:indicators', async () => {
      const results: Record<string, any> = {};
      const entries = Object.entries(series);
      const promises = entries.map(async ([name, id]) => {
        try {
          const raw = await fredSeries(id, apiKey, 5);
          const observations = (raw as any)?.observations ?? [];
          const latest = observations[0];
          const prev = observations[1];
          results[name] = {
            seriesId: id,
            latest: latest ? { date: latest.date, value: latest.value } : null,
            previous: prev ? { date: prev.date, value: prev.value } : null,
            change: latest && prev && latest.value !== '.' && prev.value !== '.'
              ? (parseFloat(latest.value) - parseFloat(prev.value)).toFixed(2)
              : null,
          };
        } catch { results[name] = { seriesId: id, error: 'fetch failed' }; }
      });
      await Promise.all(promises);
      return results;
    }, { ttl: 3600 });

    return c.json({ status: 'ok', data });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/macro/rates — yield curve + rate analysis
macroRoutes.get('/rates', async (c) => {
  const apiKey = c.env.FRED_API_KEY;
  if (!apiKey) return c.json({ error: 'FRED_API_KEY not configured' }, 500);
  const cache = new Cache(c.env.AEGIS_CACHE, 1800);

  try {
    const data = await cache.getOrSet('macro:rates', async () => {
      const rateSeries: Record<string, string> = {
        '3M': 'DTB3',
        '6M': 'DTB6',
        '1Y': 'DGS1',
        '2Y': 'DGS2',
        '5Y': 'DGS5',
        '10Y': 'DGS10',
        '30Y': 'DGS30',
      };

      const rates: Record<string, any> = {};
      await Promise.all(Object.entries(rateSeries).map(async ([name, id]) => {
        try {
          const raw = await fredSeries(id, apiKey, 5);
          const obs = (raw as any)?.observations ?? [];
          const latest = obs.find((o: any) => o.value !== '.');
          rates[name] = latest ? parseFloat(latest.value) : null;
        } catch { rates[name] = null; }
      }));

      // Yield curve shape
      const spread_2_10 = rates['10Y'] != null && rates['2Y'] != null
        ? (rates['10Y'] - rates['2Y']).toFixed(2) : null;
      const spread_3m_10y = rates['10Y'] != null && rates['3M'] != null
        ? (rates['10Y'] - rates['3M']).toFixed(2) : null;

      let curveShape = 'unknown';
      if (spread_2_10 != null) {
        const sp = parseFloat(spread_2_10);
        if (sp > 0.5) curveShape = 'normal';
        else if (sp > 0) curveShape = 'flat';
        else if (sp > -0.5) curveShape = 'slightly_inverted';
        else curveShape = 'inverted';
      }

      return { rates, spreads: { '2Y-10Y': spread_2_10, '3M-10Y': spread_3m_10y }, curveShape };
    }, { ttl: 1800 });

    return c.json({ status: 'ok', data });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/macro/regime — market regime detection
macroRoutes.get('/regime', async (c) => {
  const apiKey = c.env.FRED_API_KEY;
  if (!apiKey) return c.json({ error: 'FRED_API_KEY not configured' }, 500);
  const cache = new Cache(c.env.AEGIS_CACHE, 1800);

  try {
    const data = await cache.getOrSet('macro:regime', async () => {
      // Fetch key regime indicators
      const indicators: Record<string, { series: string; lookback: number }> = {
        'VIX': { series: 'VIXCLS', lookback: 10 },
        'SP500': { series: 'SP500', lookback: 30 },
        'FedFunds': { series: 'FEDFUNDS', lookback: 5 },
        'Treasury10Y': { series: 'DGS10', lookback: 10 },
        'CPI': { series: 'CPIAUCSL', lookback: 5 },
      };

      const results: Record<string, any> = {};
      await Promise.all(Object.entries(indicators).map(async ([name, { series, lookback }]) => {
        try {
          const raw = await fredSeries(series, apiKey, lookback);
          results[name] = (raw as any)?.observations?.filter((o: any) => o.value !== '.').map((o: any) => ({
            date: o.date,
            value: parseFloat(o.value),
          })) ?? [];
        } catch { results[name] = []; }
      }));

      const vixData = results['VIX'] ?? [];
      const spData = results['SP500'] ?? [];
      const latestVix = vixData[0]?.value ?? 20;
      const latestSp = spData[0]?.value ?? 0;
      const spReturn30d = spData.length >= 2 && spData[spData.length - 1]?.value > 0
        ? ((latestSp - spData[spData.length - 1].value) / spData[spData.length - 1].value * 100).toFixed(2)
        : null;

      // Regime classification
      let regime = 'neutral';
      let riskLevel = 'moderate';
      if (latestVix < 15 && parseFloat(spReturn30d ?? '0') > 2) {
        regime = 'risk_on';
        riskLevel = 'low';
      } else if (latestVix > 25 && parseFloat(spReturn30d ?? '0') < -3) {
        regime = 'risk_off';
        riskLevel = 'high';
      } else if (latestVix > 20) {
        regime = 'volatile';
        riskLevel = 'elevated';
      }

      return {
        regime,
        riskLevel,
        signals: {
          vix: { current: latestVix, regime: latestVix < 15 ? 'complacent' : latestVix > 25 ? 'fearful' : 'normal' },
          sp500: { current: latestSp, return30d: spReturn30d ? parseFloat(spReturn30d) : null },
        },
        timestamp: new Date().toISOString(),
      };
    }, { ttl: 1800 });

    return c.json({ status: 'ok', data });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/macro/calendar — economic calendar (placeholder: upcoming FRED releases)
macroRoutes.get('/calendar', async (c) => {
  const apiKey = c.env.FRED_API_KEY;
  if (!apiKey) return c.json({ error: 'FRED_API_KEY not configured' }, 500);
  const cache = new Cache(c.env.AEGIS_CACHE, 7200);

  try {
    const data = await cache.getOrSet('macro:calendar', async () => {
      // FRED releases endpoint
      const url = `https://api.stlouisfed.org/fred/releases/dates?api_key=${apiKey}&file_type=json&sort_order=desc&limit=20&include_release_dates_with_no_data=true`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`FRED ${res.status}`);
      const json: any = await res.json();
      return (json.release_dates ?? []).map((r: any) => ({
        releaseId: r.release_id,
        name: r.release_name,
        date: r.date,
      }));
    }, { ttl: 7200 });

    return c.json({ status: 'ok', data });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});
