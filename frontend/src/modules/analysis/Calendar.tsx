import { useQuery } from '@tanstack/react-query'
import { useState, useEffect, useMemo } from 'react'
import {
  Calendar, Clock, AlertTriangle,
  Zap, CheckCircle,
} from 'lucide-react'
import { api } from '../../lib/api'

/* ── types ─────────────────────────────────────────────────────────── */
interface EconomicEvent {
  id: number
  name: string
  time: string
  currency: string
  impact: 'HIGH' | 'MEDIUM' | 'LOW'
  forecast: string
  previous: string
  actual: string | null
  affectedSymbols: string[]
}

interface WeekTypeData {
  weekType: string
  volatilityMultiplier: number
  maxPositions: number
  tierCounts: {
    HIGH: number
    MEDIUM: number
    LOW: number
  }
}

interface CalendarWeekData {
  weekStart: string
  weekType: string
  events: EconomicEvent[]
  dayTypes: Record<string, string>
}

interface FundamentalContext {
  symbol: string
  nextEvent: {
    name: string
    time: string
    impact: string
  } | null
  eventProximity: string
}

/* ── constants ─────────────────────────────────────────────────────── */
const WEEK_TYPE_STYLES: Record<string, { bg: string; text: string; border: string; multiplier: string }> = {
  HIGH: { bg: 'rgba(239,68,68,.12)', text: '#f87171', border: 'rgba(239,68,68,.25)', multiplier: '2.0x' },
  MEDIUM: { bg: 'rgba(245,158,11,.10)', text: '#f59e0b', border: 'rgba(245,158,11,.20)', multiplier: '1.5x' },
  LOW: { bg: 'rgba(148,163,184,.08)', text: '#94a3b8', border: 'rgba(148,163,184,.15)', multiplier: '1.0x' },
}

const IMPACT_BADGE: Record<string, { bg: string; text: string }> = {
  HIGH: { bg: 'rgba(239,68,68,.15)', text: '#f87171' },
  MEDIUM: { bg: 'rgba(245,158,11,.12)', text: '#f59e0b' },
  LOW: { bg: 'rgba(148,163,184,.08)', text: '#94a3b8' },
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const DAY_COLORS: Record<string, string> = {
  manipulation: '#ef4444',
  continuation: '#22c55e',
  reversal: '#f59e0b',
  expansion: '#3b82f6',
  distribution: '#a855f7',
}

/* ── helpers ───────────────────────────────────────────────────────── */
function fmtCountdown(ms: number) {
  if (ms <= 0) return 'NOW'
  const d = Math.floor(ms / 86_400_000)
  const h = Math.floor((ms % 86_400_000) / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })
}

function getDayOfWeek(iso: string): number {
  return new Date(iso).getDay()
}

function getDayName(iso: string): string {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return names[getDayOfWeek(iso)]
}

function surprisePercent(forecast: string, actual: string): number | null {
  const f = parseFloat(forecast)
  const a = parseFloat(actual)
  if (isNaN(f) || isNaN(a) || f === 0) return null
  return ((a - f) / Math.abs(f)) * 100
}

function surpriseColor(pct: number | null): string {
  if (pct === null) return '#64748b'
  if (Math.abs(pct) < 1) return '#64748b'
  return pct > 0 ? '#22c55e' : '#ef4444'
}

/* ── ImpactBadge component ─────────────────────────────────────────── */
function ImpactBadge({ impact }: { impact: string }) {
  const s = IMPACT_BADGE[impact] ?? IMPACT_BADGE.LOW
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 4,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
      background: s.bg, color: s.text, lineHeight: '16px',
    }}>
      {impact}
    </span>
  )
}

/* ══════════════════════════════════════════════════════════════════════ */
/* ── MAIN COMPONENT ────────────────────────────────────────────────── */
/* ══════════════════════════════════════════════════════════════════════ */
export default function CalendarPage() {
  const [now, setNow] = useState(Date.now())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  // Tick every second for countdowns
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  /* ── data fetching ─────────────────────────────────────────────── */
  const { data: weekTypeData, isLoading: wtLoading } = useQuery<WeekTypeData>({
    queryKey: ['week-type'],
    queryFn: () => api('/api/week-type'),
    refetchInterval: 60_000,
    retry: 1,
  })

  const { data: calendarWeek, isLoading: cwLoading } = useQuery<CalendarWeekData>({
    queryKey: ['economic-calendar'],
    queryFn: () => {
      const week = new Date().toISOString().split('T')[0]
      return api(`/api/economic-calendar/${week}`)
    },
    refetchInterval: 60_000,
    retry: 1,
  })

  const { data: fundContext } = useQuery<FundamentalContext>({
    queryKey: ['fund-context'],
    queryFn: () => api('/api/fundamental-context/XAUUSD'),
    refetchInterval: 60_000,
    retry: false,
  })

  /* ── computed ──────────────────────────────────────────────────── */
  const events = calendarWeek?.events ?? []
  const weekType = weekTypeData?.weekType ?? calendarWeek?.weekType ?? 'MEDIUM'
  const wt = weekType.toUpperCase()
  const wtStyle = WEEK_TYPE_STYLES[wt] ?? WEEK_TYPE_STYLES.MEDIUM
  const dayTypes = calendarWeek?.dayTypes ?? {}

  const nowMs = now

  // Next upcoming event
  const upcomingEvents = useMemo(() =>
    events
      .filter(e => new Date(e.time).getTime() > nowMs)
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()),
    [events, nowMs]
  )

  // Past events (released)
  const pastEvents = useMemo(() =>
    events
      .filter(e => e.actual !== null)
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()),
    [events]
  )

  // High-impact events within 30 minutes
  const proximityWarning = useMemo(() => {
    const soon = upcomingEvents.filter(e => {
      if (e.impact !== 'HIGH') return false
      const ms = new Date(e.time).getTime() - nowMs
      return ms > 0 && ms < 30 * 60_000
    })
    return soon
  }, [upcomingEvents, nowMs])

  // Group events by day
  const eventsByDay = useMemo(() => {
    const grouped: Record<string, EconomicEvent[]> = {}
    for (const e of events) {
      const dayKey = new Date(e.time).toISOString().split('T')[0]
      if (!grouped[dayKey]) grouped[dayKey] = []
      grouped[dayKey].push(e)
    }
    return grouped
  }, [events])

  // Get day keys sorted
  const dayKeys = useMemo(() => {
    const keys = Object.keys(eventsByDay).sort()
    return keys
  }, [eventsByDay])

  // Next event countdown
  const nextEventCountdown = useMemo(() => {
    if (!fundContext?.nextEvent?.time) return null
    const ms = new Date(fundContext.nextEvent.time).getTime() - nowMs
    return ms > 0 ? fmtCountdown(ms) : 'NOW'
  }, [fundContext, nowMs])

  const isLoading = wtLoading || cwLoading

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ═══ HEADER ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
            Economic Calendar
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>
            <Calendar size={20} style={{ color: '#f59e0b', marginRight: 6, verticalAlign: 'middle' }} />
            Week Planner
          </h1>
          <p style={{ margin: 0, fontSize: 12, color: '#64748b', marginTop: 2 }}>
            Economic events, volatility assessment, and day-type analysis
          </p>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'pulse-dot 2s infinite' }} />
          Live · 60s refresh
        </span>
      </div>

      {/* ═══ LOADING ═══ */}
      {isLoading && (
        <div style={{
          background: '#12121a', border: '1px solid #1e1e2e',
          borderRadius: 10, padding: 40, textAlign: 'center',
          color: '#64748b', fontSize: 13,
        }}>
          Loading calendar data...
        </div>
      )}

      {/* ═══ WEEK TYPE BADGE ═══ */}
      <div style={{
        background: '#12121a', border: '1px solid #1e1e2e',
        borderRadius: 10, padding: 16,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{
          padding: '8px 16px', borderRadius: 8,
          background: wtStyle.bg,
          border: `1px solid ${wtStyle.border}`,
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: wtStyle.text }}>
            {wt} IMPACT
          </div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
            Volatility {wtStyle.multiplier}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, flex: 1, justifyContent: 'center' }}>
          {(['HIGH', 'MEDIUM', 'LOW'] as const).map(tier => (
            <div key={tier} style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: 20, fontWeight: 800,
                color: IMPACT_BADGE[tier].text,
                fontFamily: 'var(--font-mono)',
              }}>
                {weekTypeData?.tierCounts?.[tier] ?? 0}
              </div>
              <div style={{ fontSize: 10, color: '#64748b' }}>{tier}</div>
            </div>
          ))}
        </div>

        {weekTypeData && (
          <div style={{
            padding: '6px 12px', borderRadius: 6,
            background: 'rgba(245,158,11,.06)',
            border: '1px solid rgba(245,158,11,.1)',
            fontSize: 11, color: '#f59e0b',
          }}>
            Max Positions: <strong>{weekTypeData.maxPositions}</strong>
          </div>
        )}
      </div>

      {/* ═══ PROXIMITY WARNING ═══ */}
      {proximityWarning.length > 0 && (
        <div style={{
          background: 'rgba(239,68,68,.08)',
          border: '1px solid rgba(239,68,68,.2)',
          borderRadius: 10, padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <AlertTriangle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444' }}>
              HIGH IMPACT WITHIN 30 MIN
            </span>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              {proximityWarning.map(e => e.name).join(' · ')}
            </div>
          </div>
          <span style={{
            fontSize: 14, fontWeight: 800, color: '#ef4444',
            fontFamily: 'var(--font-mono)',
          }}>
            {fmtCountdown(new Date(proximityWarning[0].time).getTime() - nowMs)}
          </span>
        </div>
      )}

      {/* ═══ NEXT EVENT COUNTDOWN ═══ */}
      {fundContext?.nextEvent && (
        <div style={{
          background: 'rgba(245,158,11,.06)',
          border: '1px solid rgba(245,158,11,.12)',
          borderRadius: 10, padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Clock size={16} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>Next Event:</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', marginLeft: 6 }}>
              {fundContext.nextEvent.name}
            </span>
            <ImpactBadge impact={fundContext.nextEvent.impact} />
          </div>
          <span style={{
            fontSize: 14, fontWeight: 800, color: '#f59e0b',
            fontFamily: 'var(--font-mono)',
          }}>
            {nextEventCountdown ?? '—'}
          </span>
        </div>
      )}

      {/* ═══ 5-DAY GRID ═══ */}
      {dayKeys.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          {DAY_NAMES.map((dayName, i) => {
            const dayKey = dayKeys[i] ?? null
            const dayEvents = dayKey ? (eventsByDay[dayKey] ?? []) : []
            const dayType = dayKey ? dayTypes[dayKey] : null
            const dayColor = dayType ? (DAY_COLORS[dayType] ?? '#64748b') : '#64748b'
            const highCount = dayEvents.filter(e => e.impact === 'HIGH').length
            const isToday = dayKey === new Date().toISOString().split('T')[0]
            const isSelected = dayKey === selectedDay

            return (
              <button
                key={dayName}
                onClick={() => setSelectedDay(isSelected ? null : dayKey)}
                style={{
                  background: isSelected ? 'rgba(245,158,11,.08)' : '#12121a',
                  border: `1px solid ${isSelected ? '#f59e0b' : isToday ? 'rgba(245,158,11,.3)' : '#1e1e2e'}`,
                  borderRadius: 8, padding: 12,
                  cursor: 'pointer', textAlign: 'center',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{
                  fontSize: 11, fontWeight: 700,
                  color: isToday ? '#f59e0b' : '#64748b',
                  marginBottom: 6,
                }}>
                  {dayName}
                  {isToday && <span style={{ fontSize: 9, marginLeft: 4, color: '#f59e0b' }}>TODAY</span>}
                </div>

                {dayType && (
                  <div style={{
                    fontSize: 10, fontWeight: 600,
                    color: dayColor,
                    padding: '2px 6px', borderRadius: 4,
                    background: `${dayColor}15`,
                    marginBottom: 6,
                    display: 'inline-block',
                  }}>
                    {dayType.charAt(0).toUpperCase() + dayType.slice(1)}
                  </div>
                )}

                <div style={{
                  fontSize: 20, fontWeight: 800,
                  color: highCount > 0 ? '#ef4444' : '#e2e8f0',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {dayEvents.length}
                </div>
                <div style={{ fontSize: 9, color: '#64748b' }}>events</div>

                {highCount > 0 && (
                  <div style={{
                    fontSize: 9, color: '#ef4444', marginTop: 4,
                    fontWeight: 600,
                  }}>
                    {highCount} HIGH
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ═══ EVENT LIST ═══ */}
      <div style={{
        background: '#12121a', border: '1px solid #1e1e2e',
        borderRadius: 10, overflow: 'hidden',
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e1e2e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={14} style={{ color: '#f59e0b' }} />
            <span style={{ fontWeight: 600, fontSize: 13, color: '#e2e8f0' }}>
              {selectedDay ? `Events — ${formatDate(selectedDay)}` : 'All Events'}
            </span>
            <span style={{
              fontSize: 10, color: '#64748b',
              padding: '2px 8px', borderRadius: 4,
              background: 'rgba(100,116,139,.1)',
            }}>
              {(selectedDay ? (eventsByDay[selectedDay] ?? []) : events).length} events
            </span>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e1e2e' }}>
                {['Time', 'Currency', 'Event', 'Impact', 'Forecast', 'Previous', 'Actual'].map(h => (
                  <th key={h} style={{
                    textAlign: h === 'Event' ? 'left' : 'right',
                    padding: '8px 12px', fontSize: 10,
                    color: '#64748b', fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                    whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(selectedDay ? (eventsByDay[selectedDay] ?? []) : events)
                .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
                .map((ev, idx) => {
                  const evMs = new Date(ev.time).getTime()
                  const isUpcoming = evMs > nowMs
                  const isRecent = evMs > nowMs - 3_600_000 && evMs <= nowMs
                  return (
                    <tr key={ev.id ?? idx} style={{
                      borderBottom: '1px solid rgba(30,30,46,.5)',
                      background: isRecent ? 'rgba(245,158,11,.04)' : 'transparent',
                    }}>
                      <td style={{
                        padding: '7px 12px', textAlign: 'right',
                        fontSize: 11, fontFamily: 'var(--font-mono)',
                        color: isUpcoming ? '#f59e0b' : '#64748b',
                        whiteSpace: 'nowrap',
                      }}>
                        <div>{getDayName(ev.time)} {formatTime(ev.time)}</div>
                        {isUpcoming && (
                          <div style={{ fontSize: 9, color: '#f59e0b' }}>
                            in {fmtCountdown(evMs - nowMs)}
                          </div>
                        )}
                      </td>
                      <td style={{
                        padding: '7px 12px', textAlign: 'right',
                        fontSize: 11, fontWeight: 600, color: '#e2e8f0',
                      }}>
                        {ev.currency}
                      </td>
                      <td style={{
                        padding: '7px 12px', textAlign: 'left',
                        fontSize: 12, color: '#e2e8f0',
                        whiteSpace: 'nowrap', overflow: 'hidden',
                        textOverflow: 'ellipsis', maxWidth: 250,
                      }}>
                        {ev.name}
                        {ev.affectedSymbols && ev.affectedSymbols.length > 0 && (
                          <div style={{ fontSize: 9, color: '#64748b', marginTop: 1 }}>
                            {ev.affectedSymbols.join(', ')}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '7px 12px', textAlign: 'right' }}>
                        <ImpactBadge impact={ev.impact} />
                      </td>
                      <td style={{
                        padding: '7px 12px', textAlign: 'right',
                        fontSize: 11, color: '#e2e8f0',
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {ev.forecast || '—'}
                      </td>
                      <td style={{
                        padding: '7px 12px', textAlign: 'right',
                        fontSize: 11, color: '#64748b',
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {ev.previous || '—'}
                      </td>
                      <td style={{
                        padding: '7px 12px', textAlign: 'right',
                        fontSize: 11, fontWeight: ev.actual ? 700 : 400,
                        color: ev.actual ? '#f59e0b' : '#334155',
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {ev.actual ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              {events.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                    No calendar events available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ PAST RELEASES ═══ */}
      {pastEvents.length > 0 && (
        <div style={{
          background: '#12121a', border: '1px solid #1e1e2e',
          borderRadius: 10, overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e1e2e' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle size={14} style={{ color: '#22c55e' }} />
              <span style={{ fontWeight: 600, fontSize: 13, color: '#e2e8f0' }}>Recent Releases</span>
              <span style={{
                fontSize: 10, color: '#64748b',
                padding: '2px 8px', borderRadius: 4,
                background: 'rgba(100,116,139,.1)',
              }}>
                {pastEvents.length} released
              </span>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e1e2e' }}>
                  {['Event', 'Impact', 'Consensus', 'Actual', 'Surprise'].map(h => (
                    <th key={h} style={{
                      textAlign: h === 'Event' ? 'left' : 'right',
                      padding: '8px 12px', fontSize: 10,
                      color: '#64748b', fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pastEvents.map((ev, idx) => {
                  const sp = surprisePercent(ev.forecast, ev.actual ?? '')
                  const spColor = surpriseColor(sp)
                  return (
                    <tr key={ev.id ?? idx} style={{ borderBottom: '1px solid rgba(30,30,46,.5)' }}>
                      <td style={{
                        padding: '7px 12px', textAlign: 'left',
                        fontSize: 12, color: '#e2e8f0',
                      }}>
                        <span>{ev.currency}</span>
                        <span style={{ marginLeft: 8 }}>{ev.name}</span>
                        <div style={{ fontSize: 10, color: '#64748b' }}>
                          {formatDate(ev.time)} {formatTime(ev.time)}
                        </div>
                      </td>
                      <td style={{ padding: '7px 12px', textAlign: 'right' }}>
                        <ImpactBadge impact={ev.impact} />
                      </td>
                      <td style={{
                        padding: '7px 12px', textAlign: 'right',
                        fontSize: 11, color: '#e2e8f0',
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {ev.forecast || '—'}
                      </td>
                      <td style={{
                        padding: '7px 12px', textAlign: 'right',
                        fontSize: 11, fontWeight: 700, color: '#f59e0b',
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {ev.actual || '—'}
                      </td>
                      <td style={{
                        padding: '7px 12px', textAlign: 'right',
                        fontSize: 11, fontWeight: 600, color: spColor,
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {sp !== null ? (
                          <span style={{
                            padding: '2px 6px', borderRadius: 4,
                            background: `${spColor}15`,
                          }}>
                            {sp > 0 ? '+' : ''}{sp.toFixed(1)}%
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ UPCOMING EVENTS ═══ */}
      {upcomingEvents.length > 0 && (
        <div style={{
          background: '#12121a', border: '1px solid #1e1e2e',
          borderRadius: 10, overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e1e2e' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={14} style={{ color: '#f59e0b' }} />
              <span style={{ fontWeight: 600, fontSize: 13, color: '#e2e8f0' }}>Upcoming Events</span>
              <span style={{
                fontSize: 10, color: '#64748b',
                padding: '2px 8px', borderRadius: 4,
                background: 'rgba(100,116,139,.1)',
              }}>
                {upcomingEvents.length} upcoming
              </span>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e1e2e' }}>
                  {['Event', 'Impact', 'Forecast', 'Previous', 'Countdown'].map(h => (
                    <th key={h} style={{
                      textAlign: h === 'Event' ? 'left' : 'right',
                      padding: '8px 12px', fontSize: 10,
                      color: '#64748b', fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {upcomingEvents.map((ev, idx) => {
                  const evMs = new Date(ev.time).getTime()
                  const ms = evMs - nowMs
                  const isClose = ms < 30 * 60_000 && ms > 0
                  return (
                    <tr key={ev.id ?? idx} style={{
                      borderBottom: '1px solid rgba(30,30,46,.5)',
                      background: isClose ? 'rgba(239,68,68,.04)' : 'transparent',
                    }}>
                      <td style={{
                        padding: '7px 12px', textAlign: 'left',
                        fontSize: 12, color: '#e2e8f0',
                      }}>
                        <span>{ev.currency}</span>
                        <span style={{ marginLeft: 8 }}>{ev.name}</span>
                        <div style={{ fontSize: 10, color: '#64748b' }}>
                          {formatDate(ev.time)} {formatTime(ev.time)}
                        </div>
                        {ev.affectedSymbols && ev.affectedSymbols.length > 0 && (
                          <div style={{ fontSize: 9, color: '#64748b', marginTop: 1 }}>
                            Affects: {ev.affectedSymbols.join(', ')}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '7px 12px', textAlign: 'right' }}>
                        <ImpactBadge impact={ev.impact} />
                      </td>
                      <td style={{
                        padding: '7px 12px', textAlign: 'right',
                        fontSize: 11, color: '#e2e8f0',
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {ev.forecast || '—'}
                      </td>
                      <td style={{
                        padding: '7px 12px', textAlign: 'right',
                        fontSize: 11, color: '#64748b',
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {ev.previous || '—'}
                      </td>
                      <td style={{
                        padding: '7px 12px', textAlign: 'right',
                        fontSize: 12, fontWeight: 700,
                        color: isClose ? '#ef4444' : '#f59e0b',
                        fontFamily: 'var(--font-mono)',
                        whiteSpace: 'nowrap',
                      }}>
                        {isClose && <AlertTriangle size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />}
                        {fmtCountdown(ms)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div style={{
        padding: '8px 12px', borderRadius: 6,
        background: 'rgba(245,158,11,.04)',
        borderLeft: '3px solid #f59e0b',
        fontSize: 11, color: '#64748b',
      }}>
        ⚠️ Economic calendar data is informational only. Always verify with official sources before trading.
      </div>
    </div>
  )
}
