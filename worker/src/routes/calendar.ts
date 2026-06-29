import { Hono } from 'hono';
import { Cache } from '../cache';
import type { Bindings } from '../index';

export const calendarRoutes = new Hono<{ Bindings: Bindings }>();

// Currency mapping from country names
const CURRENCY_MAP: Record<string, string> = {
  'USD': 'USD',
  'EUR': 'EUR',
  'GBP': 'GBP',
  'JPY': 'JPY',
  'CAD': 'CAD',
  'AUD': 'AUD',
  'NZD': 'NZD',
  'CHF': 'CHF',
  'CNY': 'CNY',
};

// Impact color mapping
const IMPACT_COLOR: Record<string, string> = {
  high: 'red',
  medium: 'amber',
  low: 'grey',
};

interface FFEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast: string;
  previous: string;
  actual: string;
}

interface CalendarEvent {
  title: string;
  currency: string;
  date: string;
  impact: string;
  impactColor: string;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  countdown: number;
}

// Map country code to currency
function countryToCurrency(country: string): string {
  const upper = country.toUpperCase().trim();
  // Direct match
  if (CURRENCY_MAP[upper]) return CURRENCY_MAP[upper];
  // Country-to-currency fallback
  const countryMap: Record<string, string> = {
    'US': 'USD',
    'United States': 'USD',
    'EU': 'EUR',
    'Euro Zone': 'EUR',
    'Eurozone': 'EUR',
    'Germany': 'EUR',
    'France': 'EUR',
    'Italy': 'EUR',
    'Spain': 'EUR',
    'UK': 'GBP',
    'United Kingdom': 'GBP',
    'Japan': 'JPY',
    'Canada': 'CAD',
    'Australia': 'AUD',
    'New Zealand': 'NZD',
    'Switzerland': 'CHF',
    'China': 'CNY',
  };
  return countryMap[upper] || upper;
}

// Parse a FF event into normalized calendar event
function parseEvent(ev: FFEvent): CalendarEvent {
  const dateMs = new Date(ev.date).getTime();
  const now = Date.now();
  return {
    title: ev.title,
    currency: countryToCurrency(ev.country),
    date: new Date(dateMs).toISOString(),
    impact: ev.impact,
    impactColor: IMPACT_COLOR[ev.impact.toLowerCase()] || 'grey',
    forecast: ev.forecast || null,
    previous: ev.previous || null,
    actual: ev.actual || null,
    countdown: Math.max(0, dateMs - now),
  };
}

// Fetch and parse the full calendar from forexfactory
async function fetchCalendar(cache: Cache): Promise<CalendarEvent[]> {
  return cache.getOrSet<CalendarEvent[]>(
    'calendar:thisweek',
    async () => {
      const res = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json');
      if (!res.ok) throw new Error(`FF Calendar fetch failed: ${res.status}`);
      const raw: FFEvent[] = await res.json() as FFEvent[];
      return raw
        .map(parseEvent)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    },
    { ttl: 21600 } // 6 hours
  );
}

// GET /api/calendar — all events, optional ?impact=high|medium|low
calendarRoutes.get('/', async (c) => {
  const cache = new Cache(c.env.AEGIS_CACHE, 21600);
  const impactFilter = c.req.query('impact');

  try {
    const events = await fetchCalendar(cache);

    const filtered = impactFilter
      ? events.filter((e) => e.impact.toLowerCase() === impactFilter.toLowerCase())
      : events;

    return c.json({
      status: 'ok',
      count: filtered.length,
      events: filtered,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/calendar/next-high — next upcoming HIGH impact event
calendarRoutes.get('/next-high', async (c) => {
  const cache = new Cache(c.env.AEGIS_CACHE, 21600);

  try {
    const events = await fetchCalendar(cache);
    const now = Date.now();

    const nextHigh = events.find(
      (e) => e.impact.toLowerCase() === 'high' && new Date(e.date).getTime() > now
    );

    if (!nextHigh) {
      return c.json({ status: 'ok', event: null, message: 'No upcoming high-impact events this week' });
    }

    // Recalculate live countdown
    nextHigh.countdown = Math.max(0, new Date(nextHigh.date).getTime() - now);

    return c.json({ status: 'ok', event: nextHigh });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});
