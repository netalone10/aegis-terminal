// Aegis Terminal — Centralized Configuration
// All hardcoded values live here. Change once,生效 everywhere.

// ── API URLs ──────────────────────────────────────────────────
export const API = {
  CF_WORKERS: 'https://aegis-terminal-api.akbar-rm10.workers.dev',
  VPS_ENGINE: 'https://engine.aegisterminal.app',
  WS_PRICES: 'wss://engine.aegisterminal.app/ws/prices',
  WS_VPS: 'wss://engine.aegisterminal.app/ws/vps',
  VPS_API: 'https://engine.aegisterminal.app/api/vps',
} as const

// Routes that go to VPS engine API (rest goes to CF Workers)
export const VPS_PREFIXES = [
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
  '/api/mt5',
  '/api/vps',
  '/api/bot',
] as const

// ── Symbols ───────────────────────────────────────────────────
export const SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSD'] as const
export type Symbol = (typeof SYMBOLS)[number]

// MT5 symbol mapping (broker-specific suffix)
export const MT5_SYMBOL: Record<string, string> = {
  XAUUSD: 'XAUUSD.vxc',
  EURUSD: 'EURUSD.vxc',
  GBPUSD: 'GBPUSD.vxc',
  USDJPY: 'USDJPY.vxc',
  BTCUSD: 'BTCUSD.vxc',
}

// ── Kill Zones (UTC minutes from midnight) ────────────────────
export interface KillZone {
  name: string
  startMin: number   // UTC minutes from midnight
  endMin: number
  session: string
}

export const KILL_ZONES: KillZone[] = [
  { name: 'Tokyo Open',    startMin: 0,    endMin: 180,  session: 'Asia' },
  { name: 'London Open',   startMin: 420,  endMin: 600,  session: 'London' },
  { name: 'NY Open',       startMin: 720,  endMin: 900,  session: 'New York' },
  { name: 'London Close',  startMin: 900,  endMin: 1020, session: 'London' },
]

// ── Forex Market Hours (UTC) ──────────────────────────────────
// Forex opens Sun 17:00 ET, closes Fri 17:00 ET
// DST: UTC-4 (EDT), Standard: UTC-5 (EST)
export const FOREX = {
  // DST boundaries (approximate)
  DST_START_MONTH: 2,  // March
  DST_START_DAY: 8,    // Second Sunday
  DST_END_MONTH: 10,   // November
  DST_END_DAY: 1,      // First Sunday
  OPEN_HOUR_DST: 21,   // 17:00 ET in UTC during DST
  OPEN_HOUR_STD: 22,   // 17:00 ET in UTC during standard
} as const
