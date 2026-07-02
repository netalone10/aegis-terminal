import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  Clock, AlertTriangle, ShieldAlert, TrendingUp, TrendingDown, Minus,
  ChevronDown, ChevronUp, Activity, Globe, Landmark, BarChart3,
  ShieldCheck, ArrowUpRight, ArrowDownRight, Shield,
} from 'lucide-react'
import { api } from '../../lib/api'

/* ── types ─────────────────────────────────────────────────────────── */
interface CalendarEvent {
  time: string
  currency: string
  event: string
  impact: 'HIGH' | 'MEDIUM' | 'LOW'
  forecast: string
  previous: string
  actual: string | null
}

interface MacroIndicator {
  seriesId: string
  latest: number | string
  previous: number | string
  change: number
}

interface MacroRates {
  rates: Record<string, number | null>
  spreads: Record<string, string | null>
  curveShape: string
}

interface MacroRegime {
  regime: string
  riskLevel: string
  signals: Record<string, any>
}

interface MacroData {
  dxy?: number; dgs10?: number; dgs2?: number; dtb3?: number; dtb6?: number
  yieldCurve?: number; regime?: string; [key: string]: any
}

interface CotEntry {
  pair: string; label: string; reportDate: string; netPosition: number
  longs: number; shorts: number; spread: number; changeLong: number
  changeShort: number; netChange: number; openInterest: number
  pctLong: number; pctShort: number; bias: 'bullish' | 'bearish' | 'neutral'
  commercialNet: number
}

interface RetailSentiment {
  pair: string; longPct: number; shortPct: number; signal: string
}

interface CbEvent {
  title: string; date: string; time: string; impact: number
  currency: string; forecast: string; previous: string; actual: string
}

/* ── constants ─────────────────────────────────────────────────────── */
const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  CNY: '🇨🇳', IDR: '🇮🇩', AUD: '🇦🇺', NZD: '🇳🇿',
  CAD: '🇨🇦', CHF: '🇨🇭', KRW: '🇰🇷', INR: '🇮🇳',
  BRL: '🇧🇷', MXN: '🇲🇽', ZAR: '🇿🇦', SEK: '🇸🇪',
  NOK: '🇳🇴', SGD: '🇸🇬', HKD: '🇭🇰', TRY: '🇹🇷',
  PLN: '🇵🇱', THB: '🇹🇭', PHP: '🇵🇭', MYR: '🇲🇾',
}

const WIB_OFFSET = 7 * 60 * 60 * 1000
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const REGIME_LABELS: Record<string, { name: string; description: string }> = {
  goldilocks: { name: 'Goldilocks', description: 'Moderate growth with controlled inflation — favorable for risk assets' },
  bull: { name: 'Bull Market', description: 'Strong growth momentum with rising confidence' },
  bear: { name: 'Bear Market', description: 'Contracting growth with elevated risk-off sentiment' },
  neutral: { name: 'Neutral', description: 'Mixed signals with balanced risk and growth indicators' },
  risk_on: { name: 'Risk-On', description: 'Favorable conditions for risk assets with low volatility' },
  risk_off: { name: 'Risk-Off', description: 'Elevated uncertainty driving flight to safety' },
  inflationary: { name: 'Inflationary', description: 'Rising price pressures challenging monetary policy' },
  recession: { name: 'Recession', description: 'Economic contraction with deteriorating data' },
}

const RISK_COLORS: Record<string, string> = {
  low: 'badge-bull', moderate: 'badge-info', high: 'badge-bear', elevated: 'badge-bear',
}

const REGIME_META: Record<string, { label: string; color: string; badge: string; desc: string }> = {
  expansion: { label: 'Expansion', color: 'var(--kt-up)', badge: 'badge-bull', desc: 'Ekonomi tumbuh, risk-on, USD lemah, emas naik' },
  inflation: { label: 'Inflation', color: 'var(--kt-gold)', badge: 'badge-gold', desc: 'Inflasi tinggi, Fed hawkish, yields naik' },
  deflation: { label: 'Deflation', color: 'var(--kt-info)', badge: 'badge-info', desc: 'Permintaan turun, Fed dovish, yields turun' },
  stagflation: { label: 'Stagflation', color: 'var(--kt-dn)', badge: 'badge-bear', desc: 'Pertumbuhan lambat + inflasi tinggi' },
}

const IMPLICATIONS: Record<string, string> = {
  expansion: 'Risk-on. Buy equities, sell USD, buy AUD/NZD. Gold neutral-bullish.',
  inflation: 'Hedge with commodities. Gold bullish. USD mixed. Bonds bearish.',
  deflation: 'Risk-off. Buy bonds, JPY, CHF. Gold bullish on safe-haven.',
  stagflation: 'Defensive. Cash, gold, energy stocks. Avoid growth. Short equities.',
}

const PAIR_BIAS: Record<string, Record<string, string>> = {
  expansion: { 'XAU/USD': 'Neutral-bullish', 'EUR/USD': 'Bullish', 'GBP/USD': 'Bullish', 'USD/JPY': 'Bullish', 'BTC/USD': 'Bullish' },
  inflation: { 'XAU/USD': 'Bullish', 'EUR/USD': 'Bearish', 'GBP/USD': 'Mixed', 'USD/JPY': 'Bullish', 'BTC/USD': 'Volatile' },
  deflation: { 'XAU/USD': 'Bullish', 'EUR/USD': 'Mixed', 'GBP/USD': 'Bearish', 'USD/JPY': 'Bearish', 'BTC/USD': 'Bearish' },
  stagflation: { 'XAU/USD': 'Bullish', 'EUR/USD': 'Bearish', 'GBP/USD': 'Bearish', 'USD/JPY': 'Bearish', 'BTC/USD': 'Bearish' },
}

const CB_LIST = [
  { name: 'FOMC (Fed)', flag: '🇺🇸', rate: 4.50, pairs: 'EUR/USD, DXY, XAU/USD', keywords: ['FOMC', 'Fed', 'Federal Reserve'] },
  { name: 'BOJ', flag: '🇯🇵', rate: 0.50, pairs: 'USD/JPY', keywords: ['BOJ', 'Bank of Japan'] },
  { name: 'BOE', flag: '🇬🇧', rate: 4.50, pairs: 'GBP/USD', keywords: ['BOE', 'Bank of England', 'Official Bank Rate'] },
  { name: 'RBA', flag: '🇦🇺', rate: 3.85, pairs: 'AUD/USD', keywords: ['RBA', 'Reserve Bank of Australia'] },
  { name: 'ECB', flag: '🇪🇺', rate: 2.65, pairs: 'EUR/USD, EUR/GBP', keywords: ['ECB', 'European Central Bank'] },
  { name: 'SNB', flag: '🇨🇭', rate: 0.25, pairs: 'USD/CHF', keywords: ['SNB', 'Swiss National Bank'] },
  { name: 'BI (Indonesia)', flag: '🇮🇩', rate: 5.75, pairs: 'USD/IDR', keywords: ['BI', 'Bank Indonesia'] },
]

const RETAIL: RetailSentiment[] = [
  { pair: 'EUR/USD', longPct: 72, shortPct: 28, signal: 'Bearish' },
  { pair: 'GBP/USD', longPct: 65, shortPct: 35, signal: 'Bearish' },
  { pair: 'USD/JPY', longPct: 38, shortPct: 62, signal: 'Bullish' },
  { pair: 'AUD/USD', longPct: 55, shortPct: 45, signal: 'Neutral' },
  { pair: 'XAU/USD', longPct: 42, shortPct: 58, signal: 'Bullish' },
  { pair: 'NZD/USD', longPct: 61, shortPct: 39, signal: 'Bearish' },
]

/* ── helpers ───────────────────────────────────────────────────────── */
function toWIB(iso: string): Date {
  const d = new Date(iso)
  return new Date(d.getTime() + WIB_OFFSET - d.getTimezoneOffset() * 60000)
}
function wibTime(iso: string): string {
  const d = toWIB(iso)
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
}
function wibDayKey(iso: string): string {
  const d = toWIB(iso)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
function wibDayLabel(iso: string): string {
  const d = toWIB(iso)
  return `${DAY_NAMES[d.getUTCDay()]}, ${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })} ${d.getUTCFullYear()}`
}
function formatCountdown(ms: number): string {
  if (ms <= 0) return 'now'
  const d = Math.floor(ms / 86_400_000), h = Math.floor((ms % 86_400_000) / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000)
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  parts.push(`${m}m`)
  return parts.join(' ')
}
function todayWIB(): string { return wibDayKey(new Date().toISOString()) }
function deriveRegime(d: MacroData): string {
  const curve = d.yieldCurve ?? ((d.dgs10 ?? 0) - (d.dgs2 ?? 0))
  const y10 = d.dgs10 ?? 0
  if (curve > 0.5 && y10 > 4) return 'expansion'
  if (y10 > 4.5 && curve < 0) return 'stagflation'
  if (y10 < 3 && curve > 0) return 'deflation'
  return 'inflation'
}
function findNextMeeting(events: CbEvent[], keywords: string[]): string | null {
  const today = new Date().toISOString().split('T')[0]
  const match = events.find(e => keywords.some(k => e.title.toLowerCase().includes(k.toLowerCase())) && e.date >= today)
  return match ? match.date : null
}
function inferDecision(events: CbEvent[], keywords: string[]): string {
  const past = events.filter(e => keywords.some(k => e.title.toLowerCase().includes(k.toLowerCase())) && e.actual)
  if (past.length === 0) return 'N/A'
  const last = past[past.length - 1]
  if (!last.forecast || !last.actual) return 'HOLD'
  const f = parseFloat(last.forecast), a = parseFloat(last.actual)
  if (isNaN(f) || isNaN(a)) return 'HOLD'
  if (a > f) return 'HIKE'
  if (a < f) return 'CUT'
  return 'HOLD'
}
function decisionColor(d: string) {
  if (d === 'HIKE') return 'var(--kt-dn)'
  if (d === 'CUT') return 'var(--kt-up)'
  return 'var(--kt-muted)'
}

/* ── gold bias logic ──────────────────────────────────────────────── */
type GoldBias = 'bullish' | 'bearish' | 'neutral' | 'volatile'
interface GoldEvent {
  event: string; impact: string; bias: GoldBias; time: string
  forecast: string; actual: string | null; reasoning: string
}
interface GoldBiasResult {
  overall: GoldBias; bullishCount: number; bearishCount: number
  total: number; pct: number; events: GoldEvent[]; summary: string
}

function mapGoldBias(ev: CalendarEvent): GoldBias | null {
  if (ev.currency !== 'USD' || (ev.impact !== 'HIGH' && ev.impact !== 'MEDIUM')) return null
  const name = ev.event.toLowerCase()
  const f = parseFloat(ev.forecast), a = ev.actual ? parseFloat(ev.actual) : null
  if (name.includes('fed') && (name.includes('speech') || name.includes('chair') || name.includes('testimony') || name.includes('powell'))) return 'volatile'
  if (name.includes('fomc') || name.includes('interest rate') || name.includes('fed rate')) return 'volatile'
  if (a === null || isNaN(a) || isNaN(f)) return null
  if (name.includes('non-farm') || name.includes('nonfarm') || name.includes('nfp') || name.includes('employment change'))
    return a < f ? 'bullish' : a > f ? 'bearish' : 'neutral'
  if (name.includes('unemployment rate') || name.includes('jobless') || name.includes('initial claims'))
    return a > f ? 'bullish' : a < f ? 'bearish' : 'neutral'
  if (name.includes('cpi') || name.includes('consumer price'))
    return a < f ? 'bullish' : a > f ? 'bearish' : 'neutral'
  if (name.includes('ppi') || name.includes('producer price'))
    return a < f ? 'bullish' : a > f ? 'bearish' : 'neutral'
  if (name.includes('gdp'))
    return a < f ? 'bullish' : a > f ? 'bearish' : 'neutral'
  if (name.includes('ism') || name.includes('pmi'))
    return a < f ? 'bullish' : a > f ? 'bearish' : 'neutral'
  if (name.includes('retail sales') || name.includes('retail'))
    return a < f ? 'bullish' : a > f ? 'bearish' : 'neutral'
  if (name.includes('consumer confidence') || name.includes('consumer sentiment'))
    return a < f ? 'bullish' : a > f ? 'bearish' : 'neutral'
  return a > f ? 'bearish' : a < f ? 'bullish' : 'neutral'
}

function computeGoldBias(events: CalendarEvent[]): GoldBiasResult {
  const now = Date.now()
  const usdHighMed = events.filter(e =>
    e.currency === 'USD' && (e.impact === 'HIGH' || e.impact === 'MEDIUM') &&
    new Date(e.time).getTime() > now - 24 * 3600_000
  )
  const goldEvents: GoldEvent[] = []
  let bullishCount = 0, bearishCount = 0, volatileCount = 0
  for (const ev of usdHighMed) {
    const bias = mapGoldBias(ev)
    if (bias === null) continue
    goldEvents.push({
      event: ev.event, impact: ev.impact, bias, time: ev.time, forecast: ev.forecast, actual: ev.actual,
      reasoning: bias === 'bullish' ? `Weak USD → Gold bullish` : bias === 'bearish' ? `Strong USD → Gold bearish` : bias === 'volatile' ? 'Fed event — expect volatility' : 'Neutral',
    })
    if (bias === 'bullish') bullishCount++
    else if (bias === 'bearish') bearishCount++
    else if (bias === 'volatile') volatileCount++
  }
  const total = bullishCount + bearishCount
  const pct = total > 0 ? Math.round((Math.max(bullishCount, bearishCount) / total) * 100) : 50
  const overall: GoldBias = bullishCount > bearishCount ? 'bullish' : bearishCount > bullishCount ? 'bearish' : volatileCount > 0 ? 'volatile' : 'neutral'
  const summary = total === 0 ? 'No recent USD data to analyze.' :
    overall === 'bullish' ? `${bullishCount}/${total} USD data weak → Gold bullish.` :
    overall === 'bearish' ? `${bearishCount}/${total} USD data strong → Gold bearish.` :
    overall === 'volatile' ? 'Fed event incoming — expect Gold volatility.' : 'Mixed USD data — Gold neutral.'
  return { overall, bullishCount, bearishCount, total, pct, events: goldEvents, summary }
}

/* ── tiny sub-components ──────────────────────────────────────────── */
function TrendIcon({ change }: { change: number }) {
  if (change > 0) return <TrendingUp size={14} style={{ color: 'var(--kt-up)' }} />
  if (change < 0) return <TrendingDown size={14} style={{ color: 'var(--kt-dn)' }} />
  return <Minus size={14} style={{ color: 'var(--kt-muted)' }} />
}

function DirectionArrow({ value }: { value?: number }) {
  if (value == null) return <span style={{ color: 'var(--kt-muted)' }}>—</span>
  if (value > 0) return <TrendingUp size={14} style={{ color: 'var(--kt-up)' }} />
  if (value < 0) return <TrendingDown size={14} style={{ color: 'var(--kt-dn)' }} />
  return <Minus size={14} style={{ color: 'var(--kt-muted)' }} />
}

function ImpactBadge({ impact }: { impact: string }) {
  const s: React.CSSProperties = { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 'var(--xs, 11px)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', lineHeight: '18px' }
  if (impact === 'HIGH') return <span style={{ ...s, background: 'rgba(239,68,68,.25)', color: '#f87171' }}>HIGH</span>
  if (impact === 'MEDIUM') return <span style={{ ...s, background: 'rgba(245,158,11,.20)', color: '#f59e0b' }}>MED</span>
  return <span style={{ ...s, background: 'rgba(148,163,184,.15)', color: 'var(--kt-muted)' }}>LOW</span>
}

function BiasBadge({ bias }: { bias: string }) {
  if (bias === 'bullish') return <span className="badge-bull">BULLISH</span>
  if (bias === 'bearish') return <span className="badge-bear">BEARISH</span>
  return <span className="badge-neutral">NEUTRAL</span>
}

function SignalBadge({ signal }: { signal: string }) {
  if (signal === 'Bullish') return <span className="badge-bull">↑ BULL</span>
  if (signal === 'Bearish') return <span className="badge-bear">↓ BEAR</span>
  return <span className="badge-neutral">— FLAT</span>
}

function ChangeArrow({ value }: { value: number }) {
  if (value > 0) return <span style={{ color: 'var(--kt-up)', display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)' }}><ArrowUpRight size={12} />+{(value / 1000).toFixed(1)}K</span>
  if (value < 0) return <span style={{ color: 'var(--kt-dn)', display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)' }}><ArrowDownRight size={12} />{(value / 1000).toFixed(1)}K</span>
  return <span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)' }}>—</span>
}

function HeatColor({ value, max }: { value: number; max: number }) {
  const ratio = Math.min(Math.abs(value) / (max || 1), 1)
  if (value > 0) return { background: `rgba(0, 200, 120, ${0.15 + ratio * 0.45})` }
  if (value < 0) return { background: `rgba(255, 60, 60, ${0.15 + ratio * 0.45})` }
  return { background: 'transparent' }
}

/* ── Gold Bias Card ───────────────────────────────────────────────── */
function GoldBiasCard({ result }: { result: GoldBiasResult }) {
  const [expanded, setExpanded] = useState(false)
  const BiasIcon = result.overall === 'bullish' ? TrendingUp : result.overall === 'bearish' ? TrendingDown : Minus
  const biasColor = result.overall === 'bullish' ? 'var(--kt-up)' : result.overall === 'bearish' ? 'var(--kt-dn)' : result.overall === 'volatile' ? '#f59e0b' : 'var(--kt-muted)'
  const biasLabel = result.overall === 'volatile' ? '→ Volatile' : result.overall === 'bullish' ? '↑ Bullish' : result.overall === 'bearish' ? '↓ Bearish' : '→ Neutral'
  return (
    <div className="kt-card" style={{ marginBottom: 12 }}>
      <button onClick={() => setExpanded(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <BiasIcon size={20} style={{ color: biasColor }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, color: 'var(--kt-text)', fontSize: 'var(--md)' }}>USD → Gold Bias</span>
            <span style={{ color: biasColor, fontWeight: 800, fontSize: 'var(--md)', fontFamily: 'var(--font-mono)' }}>{biasLabel}</span>
          </div>
          <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', marginTop: 2 }}>{result.summary}</div>
        </div>
        {result.total > 0 && <span className="mono" style={{ color: biasColor, fontSize: 'var(--lg)', fontWeight: 700 }}>{result.pct}%</span>}
        {expanded ? <ChevronUp size={16} style={{ color: 'var(--kt-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--kt-muted)' }} />}
      </button>
      {expanded && result.events.length > 0 && (
        <div style={{ padding: '0 18px 14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 100px', gap: 8, padding: '6px 0', fontSize: 'var(--xs)', color: 'var(--kt-muted)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: '1px solid var(--kt-border)' }}>
            <span>Event</span><span>Impact</span><span>Gold Bias</span>
          </div>
          {result.events.map((ev, i) => {
            const evColor = ev.bias === 'bullish' ? 'var(--kt-up)' : ev.bias === 'bearish' ? 'var(--kt-dn)' : ev.bias === 'volatile' ? '#f59e0b' : 'var(--kt-muted)'
            const EvIcon = ev.bias === 'bullish' ? TrendingUp : ev.bias === 'bearish' ? TrendingDown : Minus
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 72px 100px', gap: 8, padding: '8px 0', fontSize: 'var(--sm)', borderBottom: '1px solid var(--kt-border-soft)', alignItems: 'center' }}>
                <span style={{ color: 'var(--kt-text2)' }}>{ev.event}</span>
                <ImpactBadge impact={ev.impact} />
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: evColor, fontWeight: 700, fontSize: 'var(--xs)' }}><EvIcon size={12} />{ev.bias.charAt(0).toUpperCase() + ev.bias.slice(1)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════ */
/* ── MAIN: MERGED CALENDAR ────────────────────────────────────────── */
/* ══════════════════════════════════════════════════════════════════════ */
export default function Calendar() {
  /* ── calendar queries ── */
  const { data: events = [], isLoading: calLoading, error: calError } = useQuery<CalendarEvent[]>({
    queryKey: ['calendar'], queryFn: () => api<CalendarEvent[]>('/api/calendar'), refetchInterval: 300_000,
  })

  /* ── macro queries ── */
  const { data: macroIndicators } = useQuery<Record<string, MacroIndicator>>({
    queryKey: ['macro-indicators'], queryFn: () => api('/api/macro/indicators'), staleTime: 300_000,
  })
  const { data: macroRates } = useQuery<MacroRates>({
    queryKey: ['macro-rates'], queryFn: () => api('/api/macro/rates'), staleTime: 300_000,
  })
  const { data: macroRegimeData } = useQuery<MacroRegime>({
    queryKey: ['macro-regime'], queryFn: () => api('/api/macro/regime'), staleTime: 300_000,
  })

  /* ── regime + macro data (for detailed regime analysis) ── */
  const { data: macroData } = useQuery<MacroData>({
    queryKey: ['macro'], queryFn: () => api<MacroData>('/api/macro'), staleTime: 300_000,
  })

  /* ── sentiment queries ── */
  const { data: cot } = useQuery<CotEntry[]>({
    queryKey: ['sentiment', 'cot'], queryFn: () => api('/api/sentiment/cot'), refetchInterval: 3_600_000, staleTime: 3_600_000,
  })

  /* ── calendar helpers ── */
  const now = Date.now()
  const nextHigh = useMemo(() => {
    const upcoming = events.filter(e => e.impact === 'HIGH' && new Date(e.time).getTime() > now).sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    return upcoming[0] ?? null
  }, [events, now])

  const preNews2h = useMemo(() => events.filter(e => e.impact === 'HIGH' && (() => { const ms = new Date(e.time).getTime() - now; return ms > 0 && ms < 2 * 3_600_000 })()), [events, now])
  const preNewsBlock = useMemo(() => events.filter(e => e.impact === 'HIGH' && (() => { const ms = new Date(e.time).getTime() - now; return ms > 0 && ms < 3_600_000 })()), [events, now])

  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    const sorted = [...events].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    sorted.forEach(e => { const key = wibDayKey(e.time); if (!map.has(key)) map.set(key, []); map.get(key)!.push(e) })
    return map
  }, [events])

  const today = todayWIB()

  /* ── macro helpers ── */
  const indicatorList = macroIndicators ? Object.entries(macroIndicators).map(([key, val]) => ({ label: key, ...val })) : []
  const rates = macroRates?.rates ?? {}
  const regimeKey = macroRegimeData?.regime?.toLowerCase() ?? 'neutral'
  const regime = REGIME_LABELS[regimeKey] ?? REGIME_LABELS.neutral
  const riskLevel = macroRegimeData?.riskLevel ?? 'moderate'

  /* ── regime analysis helpers ── */
  const curve = macroData?.yieldCurve ?? ((macroData?.dgs10 ?? 0) - (macroData?.dgs2 ?? 0))
  const regType = macroData ? deriveRegime(macroData) : 'inflation'
  const regMeta = REGIME_META[regType] ?? REGIME_META.inflation
  const pairBias = PAIR_BIAS[regType] ?? PAIR_BIAS.inflation

  /* ── sentiment helpers ── */
  const maxChange = cot ? Math.max(...cot.map(c => Math.abs(c.netChange)), 1) : 1
  const cbEvents = events as unknown as CbEvent[]
  const maxRate = Math.max(...CB_LIST.map(cb => cb.rate))

  return (
    <div>
      {/* ════════════════════════════════════════════════════════════════
           SECTION 1: ECONOMIC CALENDAR + GOLD BIAS
           ════════════════════════════════════════════════════════════════ */}

      {nextHigh && (() => {
        const ms = new Date(nextHigh.time).getTime() - now
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(245,158,11,.10)', border: '1px solid rgba(245,158,11,.30)', borderRadius: 8, padding: '10px 16px', marginBottom: 12, fontSize: 'var(--sm, 13px)' }}>
            <Clock size={16} style={{ color: 'var(--kt-gold, #f59e0b)' }} />
            <span style={{ color: 'var(--kt-text)' }}>Next High Impact:</span>
            <span style={{ fontWeight: 700, color: 'var(--kt-gold, #f59e0b)' }}>{CURRENCY_FLAGS[nextHigh.currency]} {nextHigh.currency} {nextHigh.event}</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--kt-gold, #f59e0b)' }}>in {formatCountdown(ms)}</span>
          </div>
        )
      })()}

      {preNews2h.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.30)', borderRadius: 8, padding: '10px 16px', marginBottom: 12, fontSize: 'var(--sm, 13px)', color: '#f87171' }}>
          <AlertTriangle size={16} />
          <span style={{ fontWeight: 600 }}>HIGH IMPACT INCOMING</span>
          <span style={{ color: 'var(--kt-text)' }}>{preNews2h.map(e => `${CURRENCY_FLAGS[e.currency]} ${e.currency} ${e.event}`).join(' · ')}</span>
        </div>
      )}

      {preNewsBlock.map((e, i) => (
        <div key={`block-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.35)', borderRadius: 8, padding: '10px 16px', marginBottom: 12, fontSize: 'var(--sm, 13px)', color: '#f87171' }}>
          <ShieldAlert size={18} />
          <span style={{ fontWeight: 600 }}>PRE-NEWS BLOCK</span>
          <span style={{ color: 'var(--kt-text)' }}>{CURRENCY_FLAGS[e.currency]} {e.currency} — {e.event}</span>
          <span style={{ marginLeft: 'auto', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{(() => { const ms = new Date(e.time).getTime() - Date.now(); const mins = Math.round(ms / 60_000); return mins <= 0 ? 'NOW' : mins < 60 ? `T-${mins}m` : `T-${Math.round(mins / 60)}h` })()}</span>
        </div>
      ))}

      {events.length > 0 && <GoldBiasCard result={computeGoldBias(events)} />}

      {/* Calendar table */}
      <div className="kt-panel" style={{ marginBottom: 16 }}>
        <div className="kt-panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--kt-text)', fontWeight: 600, fontSize: 'var(--md, 14px)' }}>Economic Calendar</span>
            <span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs, 11px)' }}>All times WIB (UTC+7)</span>
          </div>
          {calLoading && <span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)' }}>Loading…</span>}
          {calError && <span style={{ color: '#f87171', fontSize: 'var(--xs)' }}>Failed to load</span>}
        </div>
        <div className="kt-panel-body" style={{ padding: 0 }}>
          {!calLoading && events.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--kt-muted)', fontSize: 'var(--sm)' }}>No calendar events available.</div>}
          {Array.from(grouped.entries()).map(([dayKey, dayEvents]) => {
            const isToday = dayKey === today
            return (
              <div key={dayKey}>
                <div style={{ padding: '8px 16px', background: isToday ? 'rgba(245,158,11,.08)' : 'var(--kt-bg2, rgba(255,255,255,.03))', borderBottom: '1px solid var(--kt-border, rgba(255,255,255,.06))', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isToday && <span className="kt-status-dot" style={{ background: 'var(--kt-gold, #f59e0b)' }} />}
                  <span style={{ fontWeight: 700, fontSize: 'var(--sm, 13px)', color: isToday ? 'var(--kt-gold, #f59e0b)' : 'var(--kt-text)', fontFamily: 'var(--font-mono)' }}>
                    {wibDayLabel(dayEvents[0].time)}{isToday && <span style={{ marginLeft: 8, fontSize: 'var(--xs)', opacity: .7 }}>TODAY</span>}
                  </span>
                </div>
                {dayKey === Array.from(grouped.keys())[0] && (
                  <div style={{ display: 'grid', gridTemplateColumns: '64px 56px 1fr 72px 80px 80px 80px', padding: '6px 16px', borderBottom: '1px solid var(--kt-border, rgba(255,255,255,.06))', fontSize: 'var(--xs, 11px)', color: 'var(--kt-muted)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    <span>Time</span><span>Ccy</span><span>Event</span><span>Impact</span><span>Forecast</span><span>Previous</span><span>Actual</span>
                  </div>
                )}
                {dayEvents.map((ev, i) => {
                  const isHighNear = ev.impact === 'HIGH' && (() => { const ms = new Date(ev.time).getTime() - now; return ms > 0 && ms < 2 * 3_600_000 })()
                  return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '64px 56px 1fr 72px 80px 80px 80px', padding: '7px 16px', borderBottom: '1px solid var(--kt-border, rgba(255,255,255,.04))', fontSize: 'var(--sm, 13px)', color: 'var(--kt-text)', background: isHighNear ? 'rgba(239,68,68,.06)' : 'transparent', transition: 'background .15s' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--xs, 12px)', color: 'var(--kt-text2)' }}>{wibTime(ev.time)}</span>
                      <span title={ev.currency}>{CURRENCY_FLAGS[ev.currency] ?? '🏳️'} <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>{ev.currency}</span></span>
                      <span style={{ color: isToday ? 'var(--kt-text)' : 'var(--kt-text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.event}</span>
                      <span><ImpactBadge impact={ev.impact} /></span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--xs)' }}>{ev.forecast || '—'}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>{ev.previous || '—'}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--xs)', fontWeight: ev.actual ? 700 : 400, color: ev.actual ? 'var(--kt-gold, #f59e0b)' : 'var(--kt-dim)' }}>{ev.actual ?? '—'}</span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
           SECTION 2: MACRO OVERVIEW + REGIME
           ════════════════════════════════════════════════════════════════ */}

      {/* Regime Card (from Macro.tsx) */}
      <div className="kt-panel" style={{ marginBottom: 16 }}>
        <div className="kt-panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Globe size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>Macro Regime</span>
          </div>
          <span className={RISK_COLORS[riskLevel] ?? 'badge-info'}>{riskLevel} risk</span>
        </div>
        <div className="kt-panel-body">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
            <span className="kt-stat-value gold" style={{ fontSize: 'var(--xl)' }}>{regime.name}</span>
          </div>
          <p style={{ color: 'var(--kt-text2)', fontSize: 'var(--md)' }}>{regime.description}</p>
        </div>
      </div>

      {/* Macro Indicators (from Macro.tsx) */}
      {indicatorList.length > 0 && (
        <div className="kt-stat-grid kt-stat-grid-5" style={{ marginBottom: 16 }}>
          {indicatorList.map(ind => (
            <div key={ind.label} className="kt-stat">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <TrendIcon change={ind.change} />
                <span className="kt-stat-label" style={{ margin: 0 }}>{ind.label}</span>
              </div>
              <div className="kt-stat-value">{ind.latest}</div>
            </div>
          ))}
        </div>
      )}

      {/* Detailed Regime Analysis (from Regime.tsx) */}
      <div className="kt-panel" style={{ marginBottom: 16 }}>
        <div className="kt-panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>Regime Analysis</span>
          </div>
          <span className={regMeta.badge}>{regMeta.label}</span>
        </div>
        <div className="kt-panel-body">
          <p style={{ color: 'var(--kt-text2)', fontSize: 'var(--md)', marginBottom: 12 }}>{regMeta.desc}</p>
          <div className="kt-stat-grid kt-stat-grid-4" style={{ gap: 12 }}>
            <div className="kt-stat">
              <div className="kt-stat-label">DXY</div>
              <div className="kt-stat-value">{macroData?.dxy?.toFixed(2) ?? '—'}</div>
            </div>
            <div className="kt-stat">
              <div className="kt-stat-label">10Y Yield</div>
              <div className="kt-stat-value">{macroData?.dgs10?.toFixed(3) ?? '—'}%</div>
            </div>
            <div className="kt-stat">
              <div className="kt-stat-label">2Y Yield</div>
              <div className="kt-stat-value">{macroData?.dgs2?.toFixed(3) ?? '—'}%</div>
            </div>
            <div className="kt-stat">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <DirectionArrow value={curve} />
                <span className="kt-stat-label" style={{ margin: 0 }}>Spread</span>
              </div>
              <div className="kt-stat-value" style={{ color: curve > 0 ? 'var(--kt-up)' : 'var(--kt-dn)' }}>{curve.toFixed(3)}%</div>
              <span style={{ color: curve > 0 ? 'var(--kt-up)' : 'var(--kt-dn)', fontSize: 'var(--xs)' }}>{curve > 0 ? 'Normal' : 'Inverted'}</span>
            </div>
          </div>
          <div style={{ marginTop: 12, padding: '8px 12px', borderLeft: `3px solid ${regMeta.color}`, background: 'var(--kt-bg2)', borderRadius: 4, fontSize: 'var(--sm)', color: 'var(--kt-text)' }}>
            {IMPLICATIONS[regType]}
          </div>
        </div>
      </div>

      {/* Pair Bias Table (from Regime.tsx) */}
      <div className="kt-panel" style={{ marginBottom: 16 }}>
        <div className="kt-panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {regType === 'stagflation' || regType === 'deflation' ? <AlertTriangle size={16} style={{ color: 'var(--kt-gold)' }} /> : <Activity size={16} style={{ color: 'var(--kt-gold)' }} />}
            <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>Pair Bias — {regMeta.label}</span>
          </div>
        </div>
        <div className="kt-panel-body" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--sm)', fontFamily: 'var(--font-mono)' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--kt-border)' }}><th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--kt-muted)', fontWeight: 500 }}>Pair</th><th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--kt-muted)', fontWeight: 500 }}>Bias</th></tr></thead>
            <tbody>{Object.entries(pairBias).map(([pair, bias]) => (
              <tr key={pair} style={{ borderBottom: '1px solid var(--kt-border)' }}><td style={{ padding: '8px 12px', color: 'var(--kt-text)', fontWeight: 700 }}>{pair}</td><td style={{ padding: '8px 12px', color: 'var(--kt-text2)' }}>{bias}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {/* Regime Signals (from Macro.tsx) */}
      {macroRegimeData?.signals && Object.keys(macroRegimeData.signals).length > 0 && (
        <div className="kt-panel" style={{ marginBottom: 16 }}>
          <div className="kt-panel-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={16} style={{ color: 'var(--kt-gold)' }} />
              <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>Regime Signals</span>
            </div>
          </div>
          <div className="kt-panel-body" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--sm)', fontFamily: 'var(--font-mono)' }}>
              <thead><tr style={{ borderBottom: '1px solid var(--kt-border)' }}><th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--kt-muted)', fontWeight: 500 }}>Signal</th><th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--kt-muted)', fontWeight: 500 }}>Value</th><th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--kt-muted)', fontWeight: 500 }}>Change</th></tr></thead>
              <tbody>{Object.entries(macroRegimeData.signals).map(([key, val]) => {
                const sv = val as any
                return <tr key={key} style={{ borderBottom: '1px solid var(--kt-border)' }}><td style={{ padding: '8px 12px', color: 'var(--kt-text)', fontWeight: 700 }}>{key.toUpperCase()}</td><td style={{ padding: '8px 12px', textAlign: 'right' }}>{sv?.value ?? sv?.latest ?? '—'}</td><td style={{ padding: '8px 12px', textAlign: 'right' }}><TrendIcon change={sv?.change ?? 0} /></td></tr>
              })}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
           SECTION 3: SENTIMENT + CENTRAL BANK
           ════════════════════════════════════════════════════════════════ */}

      {/* COT Positioning (from Sentiment.tsx) */}
      <div className="kt-panel" style={{ marginBottom: 16 }}>
        <div className="kt-panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart3 size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>COT — Institutional Positioning</span>
          </div>
          {cot?.[0]?.reportDate && <span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)' }}>Report: {cot[0].reportDate}</span>}
        </div>
        <div className="kt-panel-body">
          <div className="kt-grid-4" style={{ gap: 12 }}>
            {cot?.map(entry => {
              const barPct = entry.openInterest > 0 ? Math.abs(entry.netPosition) / entry.openInterest : 0
              const isLong = entry.netPosition > 0
              return (
                <div key={entry.pair} className="kt-card-pad" style={{ borderLeft: `3px solid ${entry.bias === 'bullish' ? 'var(--kt-up)' : entry.bias === 'bearish' ? 'var(--kt-dn)' : 'var(--kt-muted)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ color: 'var(--kt-text)', fontWeight: 700, fontSize: 'var(--md)', fontFamily: 'var(--font-mono)' }}>{entry.label}</span>
                    <BiasBadge bias={entry.bias} />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: 'var(--kt-text2)', fontSize: 'var(--xs)' }}>Net: {isLong ? '+' : ''}{(entry.netPosition / 1000).toFixed(1)}K</span>
                      <ChangeArrow value={entry.netChange} />
                    </div>
                    <div style={{ height: 8, background: 'var(--kt-bg2)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--kt-border)', zIndex: 1 }} />
                      <div style={{ position: 'absolute', height: '100%', borderRadius: 4, ...(isLong ? { left: '50%', width: `${barPct * 50}%`, background: 'var(--kt-up)' } : { right: '50%', width: `${barPct * 50}%`, background: 'var(--kt-dn)' }) }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
                    <span>L: {(entry.longs / 1000).toFixed(0)}K</span>
                    <span>S: {(entry.shorts / 1000).toFixed(0)}K</span>
                    <span>Chg: <ChangeArrow value={entry.netChange} /></span>
                  </div>
                  <div style={{ marginTop: 8, padding: '4px 8px', background: 'var(--kt-bg2)', borderRadius: 4, fontSize: 'var(--xs)', color: entry.bias === 'bullish' ? 'var(--kt-up)' : entry.bias === 'bearish' ? 'var(--kt-dn)' : 'var(--kt-muted)' }}>
                    {entry.bias === 'bullish' ? '⚡ Institutions net long' : entry.bias === 'bearish' ? '⚡ Institutions net short' : '— Positioning neutral'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Retail Sentiment (from Sentiment.tsx) */}
      <div className="kt-panel" style={{ marginBottom: 16 }}>
        <div className="kt-panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>Retail Positioning</span>
          </div>
        </div>
        <div className="kt-panel-body">
          <div className="kt-grid-2" style={{ gap: 12 }}>
            {RETAIL.map(r => (
              <div key={r.pair} className="kt-card-pad">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ color: 'var(--kt-text)', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 'var(--md)' }}>{r.pair}</span>
                  <SignalBadge signal={r.signal} />
                </div>
                <div style={{ display: 'flex', height: 24, borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{ width: `${r.longPct}%`, background: 'rgba(0, 200, 120, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--xs)', fontWeight: 600, color: '#fff', fontFamily: 'var(--font-mono)' }}>{r.longPct}% Long</div>
                  <div style={{ width: `${r.shortPct}%`, background: 'rgba(255, 60, 60, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--xs)', fontWeight: 600, color: '#fff', fontFamily: 'var(--font-mono)' }}>{r.shortPct}% Short</div>
                </div>
                <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
                  {r.longPct > 65 ? '⚠ Retail heavily long — contrarian bearish' : r.shortPct > 65 ? '⚡ Retail heavily short — contrarian bullish' : '— Balanced positioning'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Contrarian Signals (from Sentiment.tsx) */}
      <div className="kt-panel" style={{ marginBottom: 16 }}>
        <div className="kt-panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>Contrarian Signals</span>
          </div>
        </div>
        <div className="kt-panel-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {RETAIL.filter(r => r.longPct > 60 || r.shortPct > 60).map(r => {
              const isLongHeavy = r.longPct > 60
              return (
                <div key={r.pair} className="kt-card-pad" style={{ display: 'flex', alignItems: 'center', gap: 12, borderLeft: `3px solid ${isLongHeavy ? 'var(--kt-dn)' : 'var(--kt-up)'}` }}>
                  {isLongHeavy ? <TrendingDown size={18} style={{ color: 'var(--kt-dn)', flexShrink: 0 }} /> : <TrendingUp size={18} style={{ color: 'var(--kt-up)', flexShrink: 0 }} />}
                  <div>
                    <div style={{ color: 'var(--kt-text)', fontWeight: 600, fontSize: 'var(--sm)' }}>Retail {isLongHeavy ? 'heavily long' : 'heavily short'} {r.pair}</div>
                    <div style={{ color: 'var(--kt-text2)', fontSize: 'var(--xs)' }}>{isLongHeavy ? `→ Smart money likely short ${r.pair}` : `→ Smart money likely long ${r.pair}`}</div>
                  </div>
                  <span style={{ marginLeft: 'auto' }}>{isLongHeavy ? <span className="badge-bear">BEARISH</span> : <span className="badge-bull">BULLISH</span>}</span>
                </div>
              )
            })}
            {cot?.filter(e => e.bias !== 'neutral').map(entry => (
              <div key={entry.pair} className="kt-card-pad" style={{ display: 'flex', alignItems: 'center', gap: 12, borderLeft: `3px solid ${entry.bias === 'bullish' ? 'var(--kt-up)' : 'var(--kt-dn)'}` }}>
                {entry.bias === 'bullish' ? <ShieldCheck size={18} style={{ color: 'var(--kt-up)', flexShrink: 0 }} /> : <AlertTriangle size={18} style={{ color: 'var(--kt-dn)', flexShrink: 0 }} />}
                <div>
                  <div style={{ color: 'var(--kt-text)', fontWeight: 600, fontSize: 'var(--sm)' }}>COT: Institutions net {entry.bias === 'bullish' ? 'long' : 'short'} {entry.label}</div>
                  <div style={{ color: 'var(--kt-text2)', fontSize: 'var(--xs)' }}>Net position {(entry.netPosition / 1000).toFixed(1)}K contracts{entry.netChange !== 0 && ` (${entry.netChange > 0 ? '+' : ''}${(entry.netChange / 1000).toFixed(1)}K WoW)`}</div>
                </div>
                <span style={{ marginLeft: 'auto' }}>{entry.bias === 'bullish' ? <span className="badge-bull">BULLISH</span> : <span className="badge-bear">BEARISH</span>}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Central Bank Meetings (from CentralBank.tsx) */}
      <div className="kt-panel" style={{ marginBottom: 16 }}>
        <div className="kt-panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Landmark size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>Central Bank Watch</span>
          </div>
        </div>
        <div className="kt-panel-body">
          <div className="kt-grid-3" style={{ gap: 12 }}>
            {CB_LIST.map(cb => {
              const nextDate = findNextMeeting(cbEvents, cb.keywords)
              const decision = inferDecision(cbEvents, cb.keywords)
              return (
                <div key={cb.name} className="kt-card kt-card-pad">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 20 }}>{cb.flag}</span>
                    <span style={{ fontWeight: 600, color: 'var(--kt-text)', fontSize: 'var(--md)' }}>{cb.name}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span className="kt-stat-label" style={{ margin: 0 }}>Rate</span><span className="mono kt-stat-value">{cb.rate.toFixed(2)}%</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span className="kt-stat-label" style={{ margin: 0 }}>Decision</span><span className="mono" style={{ color: decisionColor(decision), fontWeight: 600 }}>{decision}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span className="kt-stat-label" style={{ margin: 0 }}>Next Meeting</span><span className="mono" style={{ color: 'var(--kt-text2)' }}>{nextDate ?? 'TBD'}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="kt-stat-label" style={{ margin: 0 }}>Pairs</span><span className="mono" style={{ color: 'var(--kt-text2)', fontSize: 11, textAlign: 'right' }}>{cb.pairs}</span></div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Yield Curve + Rate Comparison (from CentralBank.tsx) */}
      <div className="kt-panel" style={{ marginBottom: 16 }}>
        <div className="kt-panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>US Yield Curve</span>
          </div>
        </div>
        <div className="kt-panel-body">
          <div className="kt-stat-grid kt-stat-grid-4">
            <div className="kt-stat"><div className="kt-stat-label">3M</div><div className="kt-stat-value mono">{macroData?.dtb3 != null ? `${macroData.dtb3}%` : 'N/A'}</div></div>
            <div className="kt-stat"><div className="kt-stat-label">2Y</div><div className="kt-stat-value mono">{macroData?.dgs2 != null ? `${macroData.dgs2}%` : 'N/A'}</div></div>
            <div className="kt-stat"><div className="kt-stat-label">10Y</div><div className="kt-stat-value mono">{macroData?.dgs10 != null ? `${macroData.dgs10}%` : 'N/A'}</div></div>
            <div className="kt-stat">
              <div className="kt-stat-label">Spread (10Y-2Y)</div>
              <div className="kt-stat-value mono" style={{ color: curve > 0 ? 'var(--kt-up)' : 'var(--kt-dn)' }}>{curve > 0 ? '+' : ''}{curve.toFixed(3)}%</div>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Rate Comparison</div>
            {[...CB_LIST].sort((a, b) => b.rate - a.rate).map(cb => (
              <div key={cb.name} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <span style={{ fontSize: 16 }}>{cb.flag}</span>
                <span className="mono" style={{ color: 'var(--kt-text)', width: 110, fontSize: 13, flexShrink: 0 }}>{cb.name}</span>
                <div style={{ flex: 1, background: 'var(--kt-bg2)', borderRadius: 6, height: 18, overflow: 'hidden' }}>
                  <div style={{ width: `${(cb.rate / maxRate) * 100}%`, height: '100%', background: 'var(--kt-gold)', borderRadius: 6, transition: 'width .4s ease' }} />
                </div>
                <span className="mono" style={{ color: 'var(--kt-gold)', fontWeight: 600, width: 50, textAlign: 'right', fontSize: 13 }}>{cb.rate.toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Positioning Changes Heatmap (from Sentiment.tsx) */}
      <div className="kt-panel">
        <div className="kt-panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart3 size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>Positioning Changes Heatmap</span>
          </div>
          <span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)' }}>Week-over-week</span>
        </div>
        <div className="kt-panel-body" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--sm)', fontFamily: 'var(--font-mono)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--kt-border)' }}>
                {['Pair', 'Net Pos', 'Net Chg', 'Long Chg', 'Short Chg', 'OI', 'Bias'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Pair' ? 'left' : h === 'Bias' ? 'center' : 'right', padding: '8px 12px', color: 'var(--kt-muted)', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cot?.map(entry => (
                <tr key={entry.pair} style={{ borderBottom: '1px solid var(--kt-border)' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--kt-text)', fontWeight: 700 }}>{entry.label}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: entry.netPosition > 0 ? 'var(--kt-up)' : entry.netPosition < 0 ? 'var(--kt-dn)' : 'var(--kt-muted)' }}>{entry.netPosition > 0 ? '+' : ''}{(entry.netPosition / 1000).toFixed(1)}K</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}><div style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontWeight: 600, ...HeatColor({ value: entry.netChange, max: maxChange }), color: entry.netChange > 0 ? 'var(--kt-up)' : entry.netChange < 0 ? 'var(--kt-dn)' : 'var(--kt-muted)' }}>{entry.netChange > 0 ? '+' : ''}{(entry.netChange / 1000).toFixed(1)}K</div></td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}><div style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, ...HeatColor({ value: entry.changeLong, max: maxChange }), color: entry.changeLong > 0 ? 'var(--kt-up)' : entry.changeLong < 0 ? 'var(--kt-dn)' : 'var(--kt-muted)' }}>{entry.changeLong > 0 ? '+' : ''}{(entry.changeLong / 1000).toFixed(1)}K</div></td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}><div style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, ...HeatColor({ value: entry.changeShort, max: maxChange }), color: entry.changeShort > 0 ? 'var(--kt-up)' : entry.changeShort < 0 ? 'var(--kt-dn)' : 'var(--kt-muted)' }}>{entry.changeShort > 0 ? '+' : ''}{(entry.changeShort / 1000).toFixed(1)}K</div></td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--kt-muted)' }}>{(entry.openInterest / 1000).toFixed(0)}K</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}><BiasBadge bias={entry.bias} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
