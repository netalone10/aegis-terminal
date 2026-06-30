import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Clock, AlertTriangle, ShieldAlert, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../../lib/api'

/* ── types ─────────────────────────────────────────────────────────── */
interface CalendarEvent {
  time: string          // ISO string
  currency: string      // USD, EUR, GBP, JPY, CNY, IDR, AUD, NZD, CAD, CHF
  event: string
  impact: 'HIGH' | 'MEDIUM' | 'LOW'
  forecast: string
  previous: string
  actual: string | null
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
  const d = Math.floor(ms / 86_400_000)
  const h = Math.floor((ms % 86_400_000) / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  parts.push(`${m}m`)
  return parts.join(' ')
}

function todayWIB(): string {
  return wibDayKey(new Date().toISOString())
}

/* ── gold bias logic ──────────────────────────────────────────────── */
type GoldBias = 'bullish' | 'bearish' | 'neutral' | 'volatile'

interface GoldEvent {
  event: string
  impact: string
  bias: GoldBias
  time: string
  forecast: string
  actual: string | null
  reasoning: string
}

interface GoldBiasResult {
  overall: GoldBias
  bullishCount: number
  bearishCount: number
  total: number
  pct: number
  events: GoldEvent[]
  summary: string
}

function mapGoldBias(ev: CalendarEvent): GoldBias | null {
  if (ev.currency !== 'USD') return null
  if (ev.impact !== 'HIGH' && ev.impact !== 'MEDIUM') return null

  const name = ev.event.toLowerCase()
  const f = parseFloat(ev.forecast)
  const a = ev.actual ? parseFloat(ev.actual) : null

  // Fed speeches → volatile
  if (name.includes('fed') && (name.includes('speech') || name.includes('chair') || name.includes('testimony') || name.includes('powell'))) {
    return 'volatile'
  }
  if (name.includes('fomc') || name.includes('interest rate') || name.includes('fed rate')) {
    return 'volatile'
  }

  // If no actual yet, can't determine
  if (a === null || isNaN(a) || isNaN(f)) return null

  // NFP / Employment
  if (name.includes('non-farm') || name.includes('nonfarm') || name.includes('nfp') || name.includes('employment change')) {
    return a < f ? 'bullish' : a > f ? 'bearish' : 'neutral' // weak labor → gold up
  }
  if (name.includes('unemployment rate') || name.includes('jobless') || name.includes('initial claims')) {
    return a > f ? 'bullish' : a < f ? 'bearish' : 'neutral' // higher unemployment → gold up
  }

  // CPI / Inflation
  if (name.includes('cpi') || name.includes('consumer price')) {
    return a < f ? 'bullish' : a > f ? 'bearish' : 'neutral' // lower CPI → less hawkish → gold up
  }
  if (name.includes('ppi') || name.includes('producer price')) {
    return a < f ? 'bullish' : a > f ? 'bearish' : 'neutral'
  }

  // GDP
  if (name.includes('gdp')) {
    return a < f ? 'bullish' : a > f ? 'bearish' : 'neutral' // weak GDP → gold up
  }

  // ISM PMI
  if (name.includes('ism') || name.includes('pmi')) {
    return a < f ? 'bullish' : a > f ? 'bearish' : 'neutral'
  }

  // Retail Sales
  if (name.includes('retail sales') || name.includes('retail')) {
    return a < f ? 'bullish' : a > f ? 'bearish' : 'neutral'
  }

  // Consumer Confidence
  if (name.includes('consumer confidence') || name.includes('consumer sentiment')) {
    return a < f ? 'bullish' : a > f ? 'bearish' : 'neutral'
  }

  // Default: strong USD data → bearish gold
  return a > f ? 'bearish' : a < f ? 'bullish' : 'neutral'
}

function computeGoldBias(events: CalendarEvent[]): GoldBiasResult {
  const now = Date.now()
  const usdHighMed = events.filter(e =>
    e.currency === 'USD' && (e.impact === 'HIGH' || e.impact === 'MEDIUM') &&
    new Date(e.time).getTime() > now - 24 * 3600_000 // within last 24h or future
  )

  const goldEvents: GoldEvent[] = []
  let bullishCount = 0
  let bearishCount = 0
  let volatileCount = 0

  for (const ev of usdHighMed) {
    const bias = mapGoldBias(ev)
    if (bias === null) continue

    const reasoning = bias === 'bullish'
      ? `Weak USD data (actual ${ev.actual} < forecast ${ev.forecast}) → Gold bullish`
      : bias === 'bearish'
        ? `Strong USD data (actual ${ev.actual} > forecast ${ev.forecast}) → Gold bearish`
        : bias === 'volatile'
          ? 'Fed event — expect volatility in Gold'
          : 'Data in line with forecast → neutral impact'

    goldEvents.push({
      event: ev.event,
      impact: ev.impact,
      bias,
      time: ev.time,
      forecast: ev.forecast,
      actual: ev.actual,
      reasoning,
    })

    if (bias === 'bullish') bullishCount++
    else if (bias === 'bearish') bearishCount++
    else if (bias === 'volatile') volatileCount++
  }

  const total = bullishCount + bearishCount
  const pct = total > 0 ? Math.round((Math.max(bullishCount, bearishCount) / total) * 100) : 50
  const overall: GoldBias = bullishCount > bearishCount ? 'bullish' : bearishCount > bullishCount ? 'bearish' : volatileCount > 0 ? 'volatile' : 'neutral'

  const summary = total === 0
    ? 'No recent high/medium USD events with data to analyze.'
    : overall === 'bullish'
      ? `${bullishCount}/${total} USD data points came in weak → Gold bias is bullish.`
      : overall === 'bearish'
        ? `${bearishCount}/${total} USD data points came in strong → Gold bias is bearish.`
        : overall === 'volatile'
          ? 'Fed event incoming — expect Gold volatility regardless of data.'
          : 'Mixed USD data — Gold bias is neutral.'

  return { overall, bullishCount, bearishCount, total, pct, events: goldEvents, summary }
}

/* ── gold bias card ───────────────────────────────────────────────── */
function GoldBiasCard({ result }: { result: GoldBiasResult }) {
  const [expanded, setExpanded] = useState(false)
  const biasIcon = result.overall === 'bullish' ? TrendingUp : result.overall === 'bearish' ? TrendingDown : Minus
  const biasColor = result.overall === 'bullish' ? 'var(--kt-up)' : result.overall === 'bearish' ? 'var(--kt-dn)' : result.overall === 'volatile' ? '#f59e0b' : 'var(--kt-muted)'
  const biasLabel = result.overall === 'volatile' ? '→ Volatile' : result.overall === 'bullish' ? '↑ Bullish' : result.overall === 'bearish' ? '↓ Bearish' : '→ Neutral'
  const BiasIcon = biasIcon

  return (
    <div className="kt-card" style={{ marginBottom: 12 }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 18px', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <BiasIcon size={20} style={{ color: biasColor }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, color: 'var(--kt-text)', fontSize: 'var(--md)' }}>
              USD → Gold Bias
            </span>
            <span style={{
              color: biasColor, fontWeight: 800, fontSize: 'var(--md)',
              fontFamily: 'var(--font-mono)',
            }}>
              {biasLabel}
            </span>
          </div>
          <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', marginTop: 2 }}>
            {result.summary}
          </div>
        </div>
        {result.total > 0 && (
          <span className="mono" style={{ color: biasColor, fontSize: 'var(--lg)', fontWeight: 700 }}>
            {result.pct}%
          </span>
        )}
        {expanded ? <ChevronUp size={16} style={{ color: 'var(--kt-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--kt-muted)' }} />}
      </button>

      {expanded && result.events.length > 0 && (
        <div style={{ padding: '0 18px 14px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 72px 100px',
            gap: 8, padding: '6px 0',
            fontSize: 'var(--xs)', color: 'var(--kt-muted)',
            fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
            borderBottom: '1px solid var(--kt-border)',
          }}>
            <span>Event</span>
            <span>Impact</span>
            <span>Gold Bias</span>
          </div>
          {result.events.map((ev, i) => {
            const evColor = ev.bias === 'bullish' ? 'var(--kt-up)' : ev.bias === 'bearish' ? 'var(--kt-dn)' : ev.bias === 'volatile' ? '#f59e0b' : 'var(--kt-muted)'
            const EvIcon = ev.bias === 'bullish' ? TrendingUp : ev.bias === 'bearish' ? TrendingDown : Minus
            return (
              <div key={i} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 72px 100px',
                gap: 8, padding: '8px 0',
                fontSize: 'var(--sm)', borderBottom: '1px solid var(--kt-border-soft)',
                alignItems: 'center',
              }}>
                <span style={{ color: 'var(--kt-text2)' }}>{ev.event}</span>
                <ImpactBadge impact={ev.impact} />
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: evColor, fontWeight: 700, fontSize: 'var(--xs)' }}>
                  <EvIcon size={12} />
                  {ev.bias.charAt(0).toUpperCase() + ev.bias.slice(1)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── sub-components ────────────────────────────────────────────────── */
function ImpactBadge({ impact }: { impact: string }) {
  const style: React.CSSProperties = {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 'var(--xs, 11px)',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    lineHeight: '18px',
  }
  if (impact === 'HIGH')
    return <span style={{ ...style, background: 'rgba(239,68,68,.25)', color: '#f87171' }}>HIGH</span>
  if (impact === 'MEDIUM')
    return <span style={{ ...style, background: 'rgba(245,158,11,.20)', color: '#f59e0b' }}>MED</span>
  return <span style={{ ...style, background: 'rgba(148,163,184,.15)', color: 'var(--kt-muted)' }}>LOW</span>
}

function PreNewsBanner({ event }: { event: CalendarEvent }) {
  const ms = new Date(event.time).getTime() - Date.now()
  const mins = Math.round(ms / 60_000)
  const label = mins <= 0 ? 'NOW' : mins < 60 ? `${mins}m` : `${Math.round(mins / 60)}h`
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: 'rgba(239,68,68,.15)',
      border: '1px solid rgba(239,68,68,.35)',
      borderRadius: 8, padding: '10px 16px', marginBottom: 12,
      fontSize: 'var(--sm, 13px)', color: '#f87171',
    }}>
      <ShieldAlert size={18} />
      <span style={{ fontWeight: 600 }}>
        PRE-NEWS BLOCK
      </span>
      <span style={{ color: 'var(--kt-text)' }}>
        {CURRENCY_FLAGS[event.currency]} {event.currency} — {event.event}
      </span>
      <span style={{
        marginLeft: 'auto', fontWeight: 700,
        fontFamily: 'var(--font-mono)',
      }}>
        {label === 'NOW' ? 'NOW' : `T-${label}`}
      </span>
    </div>
  )
}

/* ── main component ────────────────────────────────────────────────── */
export default function Calendar() {
  const { data: events = [], isLoading, error } = useQuery<CalendarEvent[]>({
    queryKey: ['calendar'],
    queryFn: () => api<CalendarEvent[]>('/api/calendar'),
    refetchInterval: 300_000,
  })

  const now = Date.now()

  /* next high-impact countdown */
  const nextHigh = useMemo(() => {
    const upcoming = events
      .filter(e => e.impact === 'HIGH' && new Date(e.time).getTime() > now)
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    return upcoming[0] ?? null
  }, [events, now])

  /* pre-news: high-impact < 2h away */
  const preNews2h = useMemo(() => {
    return events.filter(e => {
      if (e.impact !== 'HIGH') return false
      const ms = new Date(e.time).getTime() - now
      return ms > 0 && ms < 2 * 3_600_000
    })
  }, [events, now])

  /* pre-news block: high-impact < 1h away */
  const preNewsBlock = useMemo(() => {
    return events.filter(e => {
      if (e.impact !== 'HIGH') return false
      const ms = new Date(e.time).getTime() - now
      return ms > 0 && ms < 3_600_000
    })
  }, [events, now])

  /* group by day */
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    const sorted = [...events].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    sorted.forEach(e => {
      const key = wibDayKey(e.time)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    })
    return map
  }, [events])

  const today = todayWIB()

  return (
    <div>
      {/* ── next high-impact countdown ── */}
      {nextHigh && (() => {
        const ms = new Date(nextHigh.time).getTime() - now
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(245,158,11,.10)',
            border: '1px solid rgba(245,158,11,.30)',
            borderRadius: 8, padding: '10px 16px', marginBottom: 12,
            fontSize: 'var(--sm, 13px)',
          }}>
            <Clock size={16} style={{ color: 'var(--kt-gold, #f59e0b)' }} />
            <span style={{ color: 'var(--kt-text)' }}>Next High Impact:</span>
            <span style={{ fontWeight: 700, color: 'var(--kt-gold, #f59e0b)' }}>
              {CURRENCY_FLAGS[nextHigh.currency]} {nextHigh.currency} {nextHigh.event}
            </span>
            <span style={{
              marginLeft: 'auto', fontFamily: 'var(--font-mono)',
              fontWeight: 600, color: 'var(--kt-gold, #f59e0b)',
            }}>
              in {formatCountdown(ms)}
            </span>
          </div>
        )
      })()}

      {/* ── pre-news 2h warning banner ── */}
      {preNews2h.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(239,68,68,.12)',
          border: '1px solid rgba(239,68,68,.30)',
          borderRadius: 8, padding: '10px 16px', marginBottom: 12,
          fontSize: 'var(--sm, 13px)', color: '#f87171',
        }}>
          <AlertTriangle size={16} />
          <span style={{ fontWeight: 600 }}>HIGH IMPACT INCOMING</span>
          <span style={{ color: 'var(--kt-text)' }}>
            {preNews2h.map(e => `${CURRENCY_FLAGS[e.currency]} ${e.currency} ${e.event}`).join(' · ')}
          </span>
        </div>
      )}

      {/* ── pre-news block indicators ── */}
      {preNewsBlock.map((e, i) => (
        <PreNewsBanner key={`block-${i}`} event={e} />
      ))}

      {/* ── gold bias card ── */}
      {events.length > 0 && <GoldBiasCard result={computeGoldBias(events)} />}

      {/* ── calendar table ── */}
      <div className="kt-panel">
        <div className="kt-panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--kt-text)', fontWeight: 600, fontSize: 'var(--md, 14px)' }}>
              Kalender Ekonomi
            </span>
            <span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs, 11px)' }}>
              All times WIB (UTC+7)
            </span>
          </div>
          {isLoading && <span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)' }}>Loading…</span>}
          {error && <span style={{ color: '#f87171', fontSize: 'var(--xs)' }}>Failed to load</span>}
        </div>
        <div className="kt-panel-body" style={{ padding: 0 }}>
          {!isLoading && events.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--kt-muted)', fontSize: 'var(--sm)' }}>
              No calendar events available.
            </div>
          )}

          {Array.from(grouped.entries()).map(([dayKey, dayEvents]) => {
            const isToday = dayKey === today
            return (
              <div key={dayKey}>
                {/* day header */}
                <div style={{
                  padding: '8px 16px',
                  background: isToday ? 'rgba(245,158,11,.08)' : 'var(--kt-bg2, rgba(255,255,255,.03))',
                  borderBottom: '1px solid var(--kt-border, rgba(255,255,255,.06))',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  {isToday && <span className="kt-status-dot" style={{ background: 'var(--kt-gold, #f59e0b)' }} />}
                  <span style={{
                    fontWeight: 700, fontSize: 'var(--sm, 13px)',
                    color: isToday ? 'var(--kt-gold, #f59e0b)' : 'var(--kt-text)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {wibDayLabel(dayEvents[0].time)}
                    {isToday && <span style={{ marginLeft: 8, fontSize: 'var(--xs)', opacity: .7 }}>TODAY</span>}
                  </span>
                </div>

                {/* table header (once per group, but just on first group for cleaner look) */}
                {dayKey === Array.from(grouped.keys())[0] && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '64px 56px 1fr 72px 80px 80px 80px',
                    padding: '6px 16px',
                    borderBottom: '1px solid var(--kt-border, rgba(255,255,255,.06))',
                    fontSize: 'var(--xs, 11px)', color: 'var(--kt-muted)',
                    fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                  }}>
                    <span>Time</span>
                    <span>Ccy</span>
                    <span>Event</span>
                    <span>Impact</span>
                    <span>Forecast</span>
                    <span>Previous</span>
                    <span>Actual</span>
                  </div>
                )}

                {/* event rows */}
                {dayEvents.map((ev, i) => {
                  const isHighNear = ev.impact === 'HIGH' && (() => {
                    const ms = new Date(ev.time).getTime() - now
                    return ms > 0 && ms < 2 * 3_600_000
                  })()

                  return (
                    <div key={i} style={{
                      display: 'grid',
                      gridTemplateColumns: '64px 56px 1fr 72px 80px 80px 80px',
                      padding: '7px 16px',
                      borderBottom: '1px solid var(--kt-border, rgba(255,255,255,.04))',
                      fontSize: 'var(--sm, 13px)',
                      color: 'var(--kt-text)',
                      background: isHighNear ? 'rgba(239,68,68,.06)' : 'transparent',
                      transition: 'background .15s',
                    }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--xs, 12px)', color: 'var(--kt-text2)' }}>
                        {wibTime(ev.time)}
                      </span>
                      <span title={ev.currency}>
                        {CURRENCY_FLAGS[ev.currency] ?? '🏳️'} <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>{ev.currency}</span>
                      </span>
                      <span style={{ color: isToday ? 'var(--kt-text)' : 'var(--kt-text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ev.event}
                      </span>
                      <span><ImpactBadge impact={ev.impact} /></span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--xs)' }}>{ev.forecast || '—'}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>{ev.previous || '—'}</span>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 'var(--xs)',
                        fontWeight: ev.actual ? 700 : 400,
                        color: ev.actual ? 'var(--kt-gold, #f59e0b)' : 'var(--kt-dim)',
                      }}>
                        {ev.actual ?? '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
