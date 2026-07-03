import { useQuery, useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import {
  TrendingUp, TrendingDown, Calendar, Clock, Zap,
  AlertTriangle, Target, Shield, BarChart3,
} from 'lucide-react'
import { api } from '../../lib/api'

/* ── types ─────────────────────────────────────────────────────────── */
interface DailyContext {
  symbol: string
  date: string
  dayOfWeek: string
  dayType: string
  fundamental: {
    bias: string
    score: number
    eventProximity: string
  }
  weeklyProfile: {
    bias: string
    confidence: number
    model: string
  }
  todayEvents: any[]
  recentReleases: any[]
  smtSignals: any[]
  recentEntries: any[]
  h4Candles: any[]
  h1Candles: any[]
}

interface NarrativeResult {
  narrative: string
  model: string
  timestamp: string
}

/* ── constants ─────────────────────────────────────────────────────── */
const SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSD']

const BIAS_COLORS: Record<string, string> = {
  BULLISH: '#22c55e',
  BEARISH: '#ef4444',
  NEUTRAL: '#94a3b8',
  bullish: '#22c55e',
  bearish: '#ef4444',
  neutral: '#94a3b8',
}

const DAY_TYPE_CONFIG: Record<string, { color: string; icon: string }> = {
  manipulation: { color: '#ef4444', icon: '⚡' },
  continuation: { color: '#22c55e', icon: '➡️' },
  reversal: { color: '#f59e0b', icon: '🔄' },
  expansion: { color: '#3b82f6', icon: '📈' },
  distribution: { color: '#a855f7', icon: '📊' },
}

const TIER_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  'S+': { bg: 'rgba(239,68,68,.20)', text: '#ef4444', label: 'S+ CRITICAL' },
  'S':  { bg: 'rgba(239,68,68,.15)', text: '#f87171', label: 'S HIGH' },
  'A':  { bg: 'rgba(245,158,11,.12)', text: '#f59e0b', label: 'A MEDIUM' },
  'B':  { bg: 'rgba(148,163,184,.08)', text: '#94a3b8', label: 'B LOW' },
  'C':  { bg: 'rgba(148,163,184,.05)', text: '#64748b', label: 'C MINIMAL' },
}

/* ── helpers ───────────────────────────────────────────────────────── */
function renderMarkdown(md: string): string {
  if (!md) return ''
  const lines = md.split('\n')
  let html = ''
  let inList = false

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (/^- /.test(line)) {
      if (!inList) { html += '<ul style="margin:4px 0;padding-left:20px">'; inList = true }
      html += `<li style="margin:2px 0;color:#cbd5e1">${inlineFormat(line.slice(2))}</li>`
      continue
    }
    if (inList) { html += '</ul>'; inList = false }

    if (line.startsWith('## ')) {
      html += `<h2 style="color:#f59e0b;font-size:16px;font-weight:700;margin:16px 0 8px">${inlineFormat(line.slice(3))}</h2>`
      continue
    }
    if (line.startsWith('### ')) {
      html += `<h3 style="color:#e2e8f0;font-size:14px;font-weight:600;margin:12px 0 6px">${inlineFormat(line.slice(4))}</h3>`
      continue
    }

    if (line.trim() === '') {
      html += '<br/>'
    } else {
      html += `<p style="margin:4px 0;line-height:1.6;color:#cbd5e1">${inlineFormat(line)}</p>`
    }
  }
  if (inList) html += '</ul>'
  return html
}

function inlineFormat(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#f59e0b">$1</strong>')
    .replace(/`(.*?)`/g, '<code style="background:rgba(245,158,11,.1);padding:1px 5px;border-radius:3px;font-size:12px;color:#f59e0b">$1</code>')
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

/* ── styles ────────────────────────────────────────────────────────── */
const S = {
  page: {
    background: '#0a0a0f',
    minHeight: '100%',
    padding: '20px',
    color: '#e2e8f0',
  } as React.CSSProperties,
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap' as const,
    gap: 12,
    marginBottom: 20,
  } as React.CSSProperties,
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: '#f59e0b',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    margin: 0,
  } as React.CSSProperties,
  select: {
    background: '#12121a',
    border: '1px solid #1e1e2e',
    color: '#e2e8f0',
    padding: '8px 12px',
    borderRadius: 8,
    fontSize: 13,
    cursor: 'pointer',
    outline: 'none',
  } as React.CSSProperties,
  dateBadge: {
    background: 'rgba(245,158,11,.1)',
    color: '#f59e0b',
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
  } as React.CSSProperties,
  cardsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 12,
    marginBottom: 20,
  } as React.CSSProperties,
  card: {
    background: '#12121a',
    border: '1px solid #1e1e2e',
    borderRadius: 10,
    padding: 16,
  } as React.CSSProperties,
  cardTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    marginBottom: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  } as React.CSSProperties,
  badge: (bg: string, color: string): React.CSSProperties => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.04em',
    background: bg,
    color: color,
    lineHeight: '16px',
  }),
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '5px 0',
    fontSize: 13,
  } as React.CSSProperties,
  label: {
    color: '#64748b',
  } as React.CSSProperties,
  value: {
    color: '#e2e8f0',
    fontWeight: 500,
  } as React.CSSProperties,
  narrativeBox: {
    background: '#12121a',
    border: '1px solid #1e1e2e',
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
    minHeight: 200,
  } as React.CSSProperties,
  btn: {
    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
    color: '#0a0a0f',
    border: 'none',
    padding: '10px 20px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  } as React.CSSProperties,
  btnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  } as React.CSSProperties,
  meta: {
    marginTop: 16,
    paddingTop: 12,
    borderTop: '1px solid #1e1e2e',
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 11,
    color: '#64748b',
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 13,
  } as React.CSSProperties,
  th: {
    textAlign: 'left' as const,
    padding: '8px 10px',
    color: '#64748b',
    fontWeight: 600,
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    borderBottom: '1px solid #1e1e2e',
  } as React.CSSProperties,
  td: {
    padding: '8px 10px',
    borderBottom: '1px solid rgba(30,30,46,0.5)',
    color: '#cbd5e1',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#e2e8f0',
    marginBottom: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  } as React.CSSProperties,
  spinner: {
    width: 20,
    height: 20,
    border: '2px solid rgba(10,10,15,0.3)',
    borderTopColor: '#f59e0b',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  } as React.CSSProperties,
}

/* ── component ─────────────────────────────────────────────────────── */
export default function DailyOutlook() {
  const [symbol, setSymbol] = useState('XAUUSD')
  const [narrative, setNarrative] = useState<NarrativeResult | null>(null)

  const { data: context, isLoading } = useQuery<DailyContext>({
    queryKey: ['daily-context', symbol],
    queryFn: () => api(`/api/context/daily/${symbol}`),
    staleTime: 300_000,
    retry: 1,
  })

  const generateMutation = useMutation<NarrativeResult, Error, void>({
    mutationFn: async () => {
      if (!context) throw new Error('No context loaded')
      return api('/api/ai/narrative', {
        method: 'POST',
        body: JSON.stringify({ type: 'daily', context }),
      })
    },
    onSuccess: (data) => setNarrative(data),
  })

  const dt = context?.dayType?.toLowerCase() ?? ''
  const dtConfig = DAY_TYPE_CONFIG[dt] ?? DAY_TYPE_CONFIG.continuation
  const fund = context?.fundamental
  const wp = context?.weeklyProfile

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={S.page}>
        {/* Header */}
        <div style={S.headerRow}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={S.title}>
              <BarChart3 size={22} />
              Daily Outlook
            </h1>
            <span style={S.dateBadge}>
              <Calendar size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              {context?.date ? new Date(context.date).toLocaleDateString('en-GB', { weekday: 'long', month: 'short', day: 'numeric' }) : '—'}
            </span>
          </div>
          <select
            style={S.select}
            value={symbol}
            onChange={e => { setSymbol(e.target.value); setNarrative(null) }}
          >
            {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
            Loading context...
          </div>
        ) : context && (
          <>
            {/* Context Cards */}
            <div style={S.cardsRow}>
              {/* Day Type */}
              <div style={S.card}>
                <div style={S.cardTitle}>
                  <Zap size={13} />
                  Day Type
                </div>
                <div style={{ marginBottom: 6 }}>
                  <span style={S.badge(`${dtConfig.color}20`, dtConfig.color)}>
                    {dtConfig.icon} {context.dayType ?? '—'}
                  </span>
                </div>
                <div style={S.row}>
                  <span style={S.label}>Day of Week</span>
                  <span style={S.value}>{context.dayOfWeek ?? '—'}</span>
                </div>
              </div>

              {/* Weekly Profile */}
              <div style={S.card}>
                <div style={S.cardTitle}>
                  <Shield size={13} />
                  Weekly Context
                </div>
                <div style={{ marginBottom: 6 }}>
                  <span style={S.badge('rgba(59,130,246,.12)', '#3b82f6')}>
                    {wp?.model ?? '—'}
                  </span>
                </div>
                <div style={S.row}>
                  <span style={S.label}>Weekly Bias</span>
                  <span style={{ ...S.value, color: BIAS_COLORS[wp?.bias ?? ''] ?? '#94a3b8', fontWeight: 700 }}>
                    {wp?.bias ?? '—'}
                  </span>
                </div>
                <div style={S.row}>
                  <span style={S.label}>Confidence</span>
                  <span style={S.value}>{wp?.confidence != null ? `${wp.confidence}%` : '—'}</span>
                </div>
              </div>

              {/* Fundamental */}
              <div style={S.card}>
                <div style={S.cardTitle}>
                  <Target size={13} />
                  Fundamental
                </div>
                <div style={{ marginBottom: 6 }}>
                  <span style={S.badge(
                    BIAS_COLORS[fund?.bias ?? ''] ? 'rgba(245,158,11,.10)' : 'rgba(148,163,184,.08)',
                    BIAS_COLORS[fund?.bias ?? ''] ?? '#94a3b8'
                  )}>
                    {fund?.bias ?? '—'}
                  </span>
                </div>
                <div style={S.row}>
                  <span style={S.label}>Score</span>
                  <span style={S.value}>{fund?.score ?? '—'}</span>
                </div>
                <div style={S.row}>
                  <span style={S.label}>Event Proximity</span>
                  <span style={{ ...S.value, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {fund?.eventProximity === 'NEAR' && (
                      <AlertTriangle size={13} color="#f59e0b" />
                    )}
                    {fund?.eventProximity ?? '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* AI Narrative */}
            <div style={S.narrativeBox}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={S.sectionTitle}>
                  <TrendingUp size={16} color="#f59e0b" />
                  AI Narrative
                </div>
                <button
                  style={{ ...S.btn, ...(generateMutation.isPending ? S.btnDisabled : {}) }}
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                >
                  {generateMutation.isPending ? (
                    <>
                      <div style={S.spinner} />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Zap size={14} />
                      Generate Daily Outlook
                    </>
                  )}
                </button>
              </div>

              {generateMutation.isError && (
                <div style={{ padding: 12, background: 'rgba(239,68,68,.1)', borderRadius: 8, color: '#f87171', fontSize: 13 }}>
                  <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                  {generateMutation.error.message}
                </div>
              )}

              {narrative ? (
                <>
                  <div
                    style={{ fontSize: 14, lineHeight: 1.6 }}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(narrative.narrative) }}
                  />
                  <div style={S.meta}>
                    <span>Model: {narrative.model}</span>
                    <span>{new Date(narrative.timestamp).toLocaleString()}</span>
                  </div>
                </>
              ) : !generateMutation.isPending && (
                <div style={{ textAlign: 'center', padding: 40, color: '#475569', fontSize: 13 }}>
                  Click "Generate Daily Outlook" to create AI daily narrative
                </div>
              )}
            </div>

            {/* Today's Events */}
            {context.todayEvents?.length > 0 && (
              <div style={{ ...S.card, marginBottom: 20 }}>
                <div style={S.sectionTitle}>
                  <Calendar size={16} color="#f59e0b" />
                  Events — Today & Upcoming
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>Event</th>
                        <th style={S.th}>Time</th>
                        <th style={S.th}>Impact</th>
                        <th style={S.th}>Currency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {context.todayEvents.map((ev: any, i: number) => {
                        const ib = TIER_BADGE[ev.tier] ?? TIER_BADGE['C']
                        return (
                          <tr key={i}>
                            <td style={S.td}>
                              {ev.name}
                              {ev.isToday && <span style={{ marginLeft: 6, fontSize: 9, color: '#f59e0b' }}>TODAY</span>}
                            </td>
                            <td style={S.td}>{ev.time ?? '—'}</td>
                            <td style={S.td}>
                              <span style={{ ...S.badge(ib.bg, ib.text), fontSize: 10, fontFamily: 'var(--font-mono)' }}>{ib.label}</span>
                            </td>
                            <td style={S.td}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'rgba(148,163,184,.08)', color: '#94a3b8' }}>{ev.country}</span>
                                <span style={{ fontSize: 10, color: '#64748b' }}>{ev.chain}</span>
                              </span>
                            </td>
                            <td style={{ ...S.td, fontSize: 10, color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                              {ev.dayLabel ?? '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Recent Releases */}
            {context.recentReleases?.length > 0 && (
              <div style={{ ...S.card, marginBottom: 20 }}>
                <div style={S.sectionTitle}>
                  <Clock size={16} color="#f59e0b" />
                  Recent Releases
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>Event</th>
                        <th style={S.th}>Forecast</th>
                        <th style={S.th}>Actual</th>
                        <th style={S.th}>Surprise</th>
                      </tr>
                    </thead>
                    <tbody>
                      {context.recentReleases.map((rel: any, i: number) => {
                        const pct = surprisePercent(String(rel.consensus ?? rel.forecast ?? ''), String(rel.actual ?? ''))
                        return (
                          <tr key={i}>
                            <td style={S.td}>{rel.name}</td>
                            <td style={S.td}>{rel.consensus ?? rel.forecast ?? '—'}</td>
                            <td style={S.td}>{rel.actual ?? '—'}</td>
                            <td style={{ ...S.td, color: surpriseColor(pct), fontWeight: 600 }}>
                              {pct !== null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Recent Signals */}
            {context.recentEntries?.length > 0 && (
              <div style={{ ...S.card, marginBottom: 20 }}>
                <div style={S.sectionTitle}>
                  <AlertTriangle size={16} color="#f59e0b" />
                  Recent Signals
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>Direction</th>
                        <th style={S.th}>Entry</th>
                        <th style={S.th}>Result</th>
                        <th style={S.th}>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {context.recentEntries.slice(0, 5).map((sig: any, i: number) => (
                        <tr key={i}>
                          <td style={S.td}>
                            <span style={S.badge(
                              sig.direction === 'LONG' ? 'rgba(34,197,94,.12)' : sig.direction === 'SHORT' ? 'rgba(239,68,68,.12)' : 'rgba(148,163,184,.08)',
                              sig.direction === 'LONG' ? '#22c55e' : sig.direction === 'SHORT' ? '#ef4444' : '#94a3b8'
                            )}>
                              {sig.direction === 'LONG' ? <TrendingUp size={11} style={{ verticalAlign: 'middle', marginRight: 2 }} /> : sig.direction === 'SHORT' ? <TrendingDown size={11} style={{ verticalAlign: 'middle', marginRight: 2 }} /> : null}
                              {sig.direction}
                            </span>
                          </td>
                          <td style={S.td}>{sig.entry ?? '—'}</td>
                          <td style={S.td}>
                            <span style={S.badge(
                              sig.result === 'WIN' ? 'rgba(34,197,94,.12)' : sig.result === 'LOSS' ? 'rgba(239,68,68,.12)' : 'rgba(148,163,184,.08)',
                              sig.result === 'WIN' ? '#22c55e' : sig.result === 'LOSS' ? '#ef4444' : '#94a3b8'
                            )}>
                              {sig.result ?? sig.outcome ?? '—'}
                            </span>
                          </td>
                          <td style={S.td}>{sig.time ?? sig.timestamp ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
