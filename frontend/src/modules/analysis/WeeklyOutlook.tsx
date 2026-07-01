import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { Calendar, AlertTriangle, TrendingUp, TrendingDown, Shield, BarChart3, Minus } from 'lucide-react'
import { api } from '../../lib/api'

interface CalendarEvent {
  title?: string
  event?: string
  date?: string
  time?: string
  impact: number | string
  currency: string
  forecast?: string
  previous?: string
  actual?: string | null
}

interface MacroData {
  dxy?: number
  dgs10?: number
  dgs2?: number
  yieldCurve?: number
  regime?: string
  [key: string]: any
}

const PAIRS = ['XAU/USD', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'NZD/USD', 'BTC/USD']
const DAY_NAMES_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

function getWeekDates() {
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - now.getDay() + 1)
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)
  return {
    monday,
    friday,
    days: Array.from({ length: 5 }, (_, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      return d
    }),
  }
}

function formatDateRange(monday: Date, friday: Date): string {
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
  const m = months[monday.getMonth()]
  const f = months[friday.getMonth()]
  if (m === f) return `${monday.getDate()} — ${friday.getDate()} ${m} ${monday.getFullYear()}`
  return `${monday.getDate()} ${m} — ${friday.getDate()} ${f} ${monday.getFullYear()}`
}

function isSameDay(d: Date, ev: CalendarEvent): boolean {
  const evDate = new Date(ev.time || ev.date || '')
  return (
    d.getFullYear() === evDate.getFullYear() &&
    d.getMonth() === evDate.getMonth() &&
    d.getDate() === evDate.getDate()
  )
}

function impactNum(impact: number | string): number {
  if (typeof impact === 'number') return impact
  const s = String(impact).toUpperCase()
  if (s === 'HIGH') return 3
  if (s === 'MEDIUM') return 2
  return 1
}

function impactDots(impact: number): React.ReactNode {
  const active = (
    <span style={{ color: impact >= 3 ? '#f87171' : impact >= 2 ? '#f59e0b' : 'var(--kt-muted)' }}>●</span>
  )
  const inactive = <span style={{ color: 'var(--kt-border)' }}>●</span>
  return (
    <span style={{ letterSpacing: 2, fontSize: 'var(--xs)' }}>
      {impact >= 3 ? <>{active}{active}{active}</> : impact >= 2 ? <>{active}{active}{inactive}</> : <>{active}{inactive}{inactive}</>}
    </span>
  )
}

function deriveSentiment(dxy?: number, curve?: number, regime?: string): string {
  if (regime) {
    const r = regime.toLowerCase()
    if (r === 'expansion') return 'Risk-On'
    if (r === 'deflation' || r === 'stagflation') return 'Risk-Off'
  }
  if (dxy != null && dxy > 105) return 'Risk-Off'
  if (dxy != null && dxy < 100) return 'Risk-On'
  if (curve != null && curve < 0) return 'Risk-Off'
  return 'Mixed'
}

function derivePairBias(regime: string, pair: string): { bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; reason: string } {
  const r = regime.toLowerCase()
  if (r === 'expansion') {
    if (pair === 'XAU/USD') return { bias: 'BULLISH', reason: 'Weak USD, risk-on demand supports gold' }
    if (pair.includes('USD/') && !pair.startsWith('USD/')) return { bias: 'BULLISH', reason: 'USD weakens on risk-on sentiment' }
    if (pair.startsWith('USD/')) return { bias: 'BEARISH', reason: 'USD weakens in expansion regime' }
    if (pair === 'BTC/USD') return { bias: 'BULLISH', reason: 'Risk-on liquidity flows into crypto' }
    return { bias: 'BULLISH', reason: 'Risk-on USD selling' }
  }
  if (r === 'inflation') {
    if (pair === 'XAU/USD') return { bias: 'BULLISH', reason: 'Inflation hedge demand' }
    if (pair === 'EUR/USD' || pair === 'GBP/USD') return { bias: 'BEARISH', reason: 'Fed hawkishness supports USD' }
    if (pair === 'USD/JPY') return { bias: 'BULLISH', reason: 'Fed hawkishness supports USD' }
    if (pair === 'BTC/USD') return { bias: 'NEUTRAL', reason: 'Mixed signals — inflation vs rate sensitivity' }
    return { bias: 'NEUTRAL', reason: 'Mixed macro signals in inflation regime' }
  }
  if (r === 'deflation') {
    if (pair === 'XAU/USD') return { bias: 'BULLISH', reason: 'Safe-haven demand, falling real yields' }
    if (pair === 'USD/JPY') return { bias: 'BEARISH', reason: 'JPY safe-haven bid, USD rate cuts' }
    if (pair === 'BTC/USD') return { bias: 'BEARISH', reason: 'Liquidity contraction, risk-off' }
    return { bias: 'BEARISH', reason: 'Risk-off, demand contraction' }
  }
  if (r === 'stagflation') {
    if (pair === 'XAU/USD') return { bias: 'BULLISH', reason: 'Gold outperforms in stagflation historically' }
    return { bias: 'BEARISH', reason: 'Worst-case macro scenario, all risk assets suffer' }
  }
  return { bias: 'NEUTRAL', reason: 'Insufficient macro data to determine bias' }
}

function biasColor(bias: string) {
  if (bias === 'BULLISH') return 'var(--kt-up)'
  if (bias === 'BEARISH') return 'var(--kt-dn)'
  return 'var(--kt-muted)'
}

function sentimentColor(s: string) {
  if (s === 'Risk-On') return 'var(--kt-up)'
  if (s === 'Risk-Off') return 'var(--kt-dn)'
  return 'var(--kt-gold)'
}

const KEY_EVENTS = ['nfp', 'non-farm', 'nonfarm', 'cpi', 'gdp', 'fomc', 'interest rate', 'payroll']

function isKeyEvent(ev: CalendarEvent): boolean {
  const name = (ev.title || ev.event || '').toLowerCase()
  return KEY_EVENTS.some(k => name.includes(k))
}

function isCBMeeting(ev: CalendarEvent): boolean {
  const name = (ev.title || ev.event || '').toLowerCase()
  return name.includes('fomc') || name.includes('interest rate') || name.includes('rate decision') || name.includes('central bank')
}

export default function WeeklyOutlook() {
  const { monday, friday, days } = useMemo(() => getWeekDates(), [])
  const weekLabel = useMemo(() => formatDateRange(monday, friday), [monday, friday])

  const { data: events = [], isLoading: calLoading } = useQuery<CalendarEvent[]>({
    queryKey: ['calendar'],
    queryFn: () => api<CalendarEvent[]>('/api/calendar'),
    staleTime: 300_000,
  })

  const { data: macro } = useQuery<MacroData>({
    queryKey: ['macro'],
    queryFn: () => api<MacroData>('/api/macro'),
    staleTime: 300_000,
  })

  const curve = macro?.yieldCurve ?? ((macro?.dgs10 ?? 0) - (macro?.dgs2 ?? 0))
  const regime = macro?.regime?.toLowerCase() || 'inflation'
  const sentiment = deriveSentiment(macro?.dxy, curve, macro?.regime)

  const weekEvents = useMemo(() => {
    return events.filter(ev => {
      if (!ev.time && !ev.date) return false
      const d = new Date(ev.time || ev.date || '')
      return d >= monday && d <= friday
    })
  }, [events, monday, friday])

  const highImpactCount = weekEvents.filter(ev => impactNum(ev.impact) >= 3).length
  const cbMeetings = weekEvents.filter(isCBMeeting).length
  const keyReleases = weekEvents.filter(isKeyEvent).length

  const dailyData = useMemo(() => {
    return days.map(d => {
      const dayEvents = weekEvents
        .filter(ev => isSameDay(d, ev))
        .sort((a, b) => impactNum(b.impact) - impactNum(a.impact))
      const maxImpact = dayEvents.length > 0 ? Math.max(...dayEvents.map(e => impactNum(e.impact))) : 0
      const currencies = [...new Set(dayEvents.map(e => e.currency))]
      return { date: d, events: dayEvents, maxImpact, currencies }
    })
  }, [days, weekEvents])

  const riskMap = useMemo(() => {
    return days.map(d => {
      const dayEvents = weekEvents.filter(ev => isSameDay(d, ev))
      const highCount = dayEvents.filter(ev => impactNum(ev.impact) >= 3).length
      const maxImpact = dayEvents.length > 0 ? Math.max(...dayEvents.map(e => impactNum(e.impact))) : 0
      return { date: d, count: dayEvents.length, highCount, maxImpact }
    })
  }, [days, weekEvents])

  const goldBias = useMemo(() => {
    const usdEvents = weekEvents.filter(ev => ev.currency === 'USD' && impactNum(ev.impact) >= 2)
    let bullish = 0
    let bearish = 0
    let volatile = false
    const drivers: string[] = []

    for (const ev of usdEvents) {
      const name = (ev.title || ev.event || '').toLowerCase()
      if (name.includes('fed') || name.includes('fomc')) {
        volatile = true
        drivers.push(`${ev.title || ev.event} → volatile`)
        continue
      }
      const f = parseFloat(ev.forecast || '')
      const a = ev.actual ? parseFloat(ev.actual) : null
      if (a === null || isNaN(a) || isNaN(f)) continue
      if (a < f) { bullish++; drivers.push(`${ev.title || ev.event}: weak USD data`) }
      else if (a > f) { bearish++; drivers.push(`${ev.title || ev.event}: strong USD data`) }
    }

    let overall: 'BULLISH' | 'BEARISH' | 'VOLATILE' | 'NEUTRAL'
    if (volatile) overall = 'VOLATILE'
    else if (bullish > bearish) overall = 'BULLISH'
    else if (bearish > bullish) overall = 'BEARISH'
    else overall = 'NEUTRAL'

    return { overall, bullish, bearish, drivers }
  }, [weekEvents])

  const isLoading = calLoading

  return (
    <div>
      {/* Header */}
      <div className="kt-route-head">
        <div>
          <div className="kt-kicker">WEEKLY OUTLOOK</div>
          <h1>Weekly Outlook</h1>
          <p style={{ color: 'var(--kt-text2)', fontSize: 'var(--sm)' }}>
            Peta risiko & peluang sebelum pekan dimulai
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <Calendar size={14} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--sm)', color: 'var(--kt-gold)', fontWeight: 700 }}>
              {weekLabel}
            </span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="kt-panel" style={{ marginBottom: 16 }}>
          <div className="kt-panel-body">
            <div className="skeleton w-40 h-8 mb-3" />
            <div className="skeleton w-64 h-4" />
          </div>
        </div>
      ) : (
        <>
          {/* Section 1: Week Summary Card */}
          <div className="kt-panel" style={{ marginBottom: 16 }}>
            <div className="kt-panel-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChart3 size={16} style={{ color: 'var(--kt-gold)' }} />
                <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>
                  Week Summary
                </span>
              </div>
              <span style={{
                color: sentimentColor(sentiment),
                fontWeight: 700,
                fontSize: 'var(--sm)',
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}>
                {sentiment}
              </span>
            </div>
            <div className="kt-panel-body">
              <div className="kt-stat-grid kt-stat-grid-4" style={{ gap: 12 }}>
                <div className="kt-stat">
                  <div className="kt-stat-label">High-Impact Events</div>
                  <div className="kt-stat-value" style={{ color: highImpactCount > 3 ? '#f87171' : 'var(--kt-text)' }}>
                    {highImpactCount}
                  </div>
                </div>
                <div className="kt-stat">
                  <div className="kt-stat-label">CB Meetings</div>
                  <div className="kt-stat-value">{cbMeetings}</div>
                </div>
                <div className="kt-stat">
                  <div className="kt-stat-label">Key Data Releases</div>
                  <div className="kt-stat-value">{keyReleases}</div>
                </div>
                <div className="kt-stat">
                  <div className="kt-stat-label">Sentiment</div>
                  <div className="kt-stat-value" style={{ color: sentimentColor(sentiment), fontSize: 'var(--md)' }}>
                    {sentiment}
                  </div>
                </div>
              </div>
              {macro && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(245,158,11,.06)', borderRadius: 8, borderLeft: '3px solid var(--kt-gold)' }}>
                  <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>DXY: {macro.dxy?.toFixed(2) ?? '—'} · 10Y: {macro.dgs10?.toFixed(3) ?? '—'}% · Regime: {macro.regime ?? '—'}</span>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Daily Breakdown */}
          <div className="kt-panel" style={{ marginBottom: 16 }}>
            <div className="kt-panel-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Calendar size={16} style={{ color: 'var(--kt-gold)' }} />
                <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>
                  Daily Breakdown
                </span>
              </div>
            </div>
            <div className="kt-panel-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                {dailyData.map((day, i) => (
                  <div key={i} className="kt-card" style={{ padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 'var(--sm)', color: 'var(--kt-text)', fontFamily: 'var(--font-mono)' }}>
                        {DAY_NAMES_SHORT[day.date.getDay()]}
                      </span>
                      <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
                        {day.date.getDate()}/{day.date.getMonth() + 1}
                      </span>
                    </div>
                    {day.events.length === 0 ? (
                      <p style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', lineHeight: 1.4 }}>
                        Tidak ada event signifikan
                      </p>
                    ) : (
                      <>
                        <div style={{ marginBottom: 6 }}>
                          {impactDots(day.maxImpact)}
                        </div>
                        <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-text2)', lineHeight: 1.4 }}>
                          {day.events.slice(0, 3).map((ev, j) => (
                            <div key={j} style={{ marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              <span style={{ color: impactNum(ev.impact) >= 3 ? '#f87171' : impactNum(ev.impact) >= 2 ? '#f59e0b' : 'var(--kt-muted)' }}>●</span>
                              {' '}{ev.title || ev.event}
                            </div>
                          ))}
                          {day.events.length > 3 && (
                            <div style={{ color: 'var(--kt-muted)' }}>+{day.events.length - 3} more</div>
                          )}
                        </div>
                        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {day.currencies.map(c => (
                            <span key={c} style={{
                              fontSize: 9, padding: '1px 5px', borderRadius: 3,
                              background: 'rgba(245,158,11,.15)', color: 'var(--kt-gold)',
                              fontWeight: 600,
                            }}>{c}</span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Section 3: Pair-by-Pair Bias */}
          <div className="kt-panel" style={{ marginBottom: 16 }}>
            <div className="kt-panel-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={16} style={{ color: 'var(--kt-gold)' }} />
                <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>
                  Pair-by-Pair Bias
                </span>
              </div>
              <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>Based on {macro?.regime ?? 'macro'} regime</span>
            </div>
            <div className="kt-panel-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                {PAIRS.map(pair => {
                  const { bias, reason } = derivePairBias(regime, pair)
                  const color = biasColor(bias)
                  const Icon = bias === 'BULLISH' ? TrendingUp : bias === 'BEARISH' ? TrendingDown : Minus
                  return (
                    <div key={pair} className="kt-card" style={{ padding: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, color: 'var(--kt-gold)', fontSize: 'var(--sm)', fontFamily: 'var(--font-mono)' }}>
                          {pair}
                        </span>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 8px', borderRadius: 4,
                          background: bias === 'BULLISH' ? 'rgba(34,197,94,.15)' : bias === 'BEARISH' ? 'rgba(239,68,68,.15)' : 'rgba(148,163,184,.15)',
                          color, fontWeight: 700, fontSize: 'var(--xs)',
                        }}>
                          <Icon size={10} />
                          {bias}
                        </span>
                      </div>
                      <p style={{ fontSize: 'var(--xs)', color: 'var(--kt-text2)', lineHeight: 1.4, margin: 0 }}>
                        {reason}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Section 4: Risk Map */}
          <div className="kt-panel" style={{ marginBottom: 16 }}>
            <div className="kt-panel-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Shield size={16} style={{ color: 'var(--kt-gold)' }} />
                <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>
                  Risk Map
                </span>
              </div>
            </div>
            <div className="kt-panel-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                {riskMap.map((day, i) => {
                  const bgColor = day.maxImpact >= 3
                    ? 'rgba(239,68,68,.15)'
                    : day.maxImpact >= 2
                      ? 'rgba(245,158,11,.12)'
                      : 'rgba(34,197,94,.10)'
                  const borderColor = day.maxImpact >= 3
                    ? 'rgba(239,68,68,.4)'
                    : day.maxImpact >= 2
                      ? 'rgba(245,158,11,.3)'
                      : 'rgba(34,197,94,.25)'
                  const labelColor = day.maxImpact >= 3 ? '#f87171' : day.maxImpact >= 2 ? '#f59e0b' : 'var(--kt-up)'
                  return (
                    <div key={i} style={{
                      padding: 14,
                      borderRadius: 8,
                      background: bgColor,
                      border: `1px solid ${borderColor}`,
                      textAlign: 'center',
                    }}>
                      <div style={{ fontWeight: 700, fontSize: 'var(--sm)', color: 'var(--kt-text)', fontFamily: 'var(--font-mono)' }}>
                        {DAY_NAMES_SHORT[day.date.getDay()]}
                      </div>
                      <div style={{ fontSize: 'var(--xxl)', fontWeight: 800, color: labelColor, fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>
                        {day.count}
                      </div>
                      <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>events</div>
                      {day.highCount > 0 && (
                        <div style={{ marginTop: 4, fontSize: 'var(--xs)', color: '#f87171', fontWeight: 600 }}>
                          {day.highCount} HIGH
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Section 5: Gold Bias */}
          <div className="kt-panel">
            <div className="kt-panel-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🥇</span>
                <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>
                  Gold Bias — XAU/USD Weekly Outlook
                </span>
              </div>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 10px', borderRadius: 4,
                background: goldBias.overall === 'BULLISH' ? 'rgba(34,197,94,.15)' : goldBias.overall === 'BEARISH' ? 'rgba(239,68,68,.15)' : goldBias.overall === 'VOLATILE' ? 'rgba(245,158,11,.15)' : 'rgba(148,163,184,.15)',
                color: goldBias.overall === 'BULLISH' ? 'var(--kt-up)' : goldBias.overall === 'BEARISH' ? 'var(--kt-dn)' : goldBias.overall === 'VOLATILE' ? '#f59e0b' : 'var(--kt-muted)',
                fontWeight: 700, fontSize: 'var(--sm)',
                fontFamily: 'var(--font-mono)',
              }}>
                {goldBias.overall === 'BULLISH' && <TrendingUp size={14} />}
                {goldBias.overall === 'BEARISH' && <TrendingDown size={14} />}
                {goldBias.overall === 'VOLATILE' && <AlertTriangle size={14} />}
                {goldBias.overall === 'NEUTRAL' && <Minus size={14} />}
                {goldBias.overall}
              </span>
            </div>
            <div className="kt-panel-body">
              <div className="kt-stat-grid kt-stat-grid-3" style={{ gap: 12, marginBottom: 12 }}>
                <div className="kt-stat">
                  <div className="kt-stat-label">Bullish Signals</div>
                  <div className="kt-stat-value" style={{ color: 'var(--kt-up)' }}>{goldBias.bullish}</div>
                </div>
                <div className="kt-stat">
                  <div className="kt-stat-label">Bearish Signals</div>
                  <div className="kt-stat-value" style={{ color: 'var(--kt-dn)' }}>{goldBias.bearish}</div>
                </div>
                <div className="kt-stat">
                  <div className="kt-stat-label">Overall Bias</div>
                  <div className="kt-stat-value" style={{
                    color: goldBias.overall === 'BULLISH' ? 'var(--kt-up)' : goldBias.overall === 'BEARISH' ? 'var(--kt-dn)' : goldBias.overall === 'VOLATILE' ? '#f59e0b' : 'var(--kt-muted)',
                    fontSize: 'var(--md)',
                  }}>
                    {goldBias.overall}
                  </div>
                </div>
              </div>
              {goldBias.drivers.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Key Drivers
                  </div>
                  {goldBias.drivers.map((d, i) => (
                    <div key={i} style={{
                      padding: '6px 10px', marginBottom: 4, borderRadius: 6,
                      background: 'rgba(245,158,11,.06)', borderLeft: '3px solid var(--kt-gold)',
                      fontSize: 'var(--xs)', color: 'var(--kt-text2)',
                    }}>
                      {d}
                    </div>
                  ))}
                </div>
              )}
              {goldBias.drivers.length === 0 && (
                <p style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', margin: 0 }}>
                  No USD high/medium impact events with data available this week. Monitor calendar events for gold direction.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
