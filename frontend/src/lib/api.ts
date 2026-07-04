// Dual API: CF Workers (existing) + VPS (engines + AI)
const CF_API = 'https://aegis-terminal-api.akbar-rm10.workers.dev';
const VPS_API = 'https://engine.aegisterminal.app';

// Routes that go to VPS engine API
const VPS_PREFIXES = [
  '/api/unified-signal',
  '/api/weekly-profile',
  '/api/h4-profile',
  '/api/h1-confirm',
  '/api/entry',
  '/api/fundamental-context',
  '/api/economic-calendar',
  '/api/week-type',
  '/api/smt',
  '/api/candles',
  '/api/event-release',
  '/api/signals/history',
  '/api/query',
  '/api/macro',
  '/api/context/weekly',
  '/api/context/daily',
  '/api/ai/narrative',
  '/api/fundamental',
];

function getBase(path: string): string {
  if (path.startsWith('http')) return '';
  if (VPS_PREFIXES.some(p => path.startsWith(p))) return VPS_API;
  return CF_API;
}

export async function api<T = any>(path: string, options?: RequestInit): Promise<T> {
  const base = getBase(path);
  const url = path.startsWith('http') ? path : `${base}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`API error ${res.status}: ${error}`);
  }
  const json = await res.json();
  return json.data !== undefined ? json.data : json;
}
