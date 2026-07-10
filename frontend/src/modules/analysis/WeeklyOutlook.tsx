import { useQuery, useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import {
  TrendingUp, Calendar, Clock, Zap,
  AlertTriangle, Target, Shield, BarChart3,
} from 'lucide-react'
import { api } from '../../lib/api'

/* ── types ─────────────────────────────────────────────────────────── */
interface WeeklyContext {
  symbol: string
  weeklyProfile: {
    model: string
    bias: string
    confidence: number
    weekHigh: number
    weekLow: number
    dayRankings: any
  }
  fundamental: {
    bias: string
    score: number
    dayType: string
    eventProximity: string
  }
  weekType: {
    type: string
    volatilityMultiplier: number
    maxPositions: number
    strategy: string
  }
  smtSignals: any[]
  economicEvents: any[]
  recentReleases: any[]
  today: string
  dayType: string
  dayWeight: number
}

interface NarrativeResult {
  narrative: string
  model: string
  timestamp: string
}

/* ── constants ─────────────────────────────────────────────────────── */
import { SYMBOLS } from '../../lib/config'

const BIAS_COLORS: Record<string, string> = {
  BULLISH: '#22c55e',
  BEARISH: '#ef4444',
  NEUTRAL: '#94a3b8',
  bullish: '#22c55e',
  bearish: '#ef4444',
  neutral: '#94a3b8',
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

    // list items
    if (/^- /.test(line)) {
      if (!inList) { html += '<ul>'; inList = true }
      html += `<li>${inlineFormat(line.slice(2))}</li>`
      continue
    }
    if (inList) { html += '</ul>'; inList = false }

    // h2
    if (line.startsWith('## ')) {
      html += `<h2 style="color:#f59e0b;font-size:16px;font-weight:700;margin:16px 0 8px">${inlineFormat(line.slice(3))}</h2>`
      continue
    }
    // h3
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

function utcToWib(utcTime: string | null): string {
  if (!utcTime) return '—'
  const [h, m] = utcTime.split(':').map(Number)
  const wibH = (h + 7) % 24
  return String(wibH).padStart(2, '0') + ':' + String(m ?? 0).padStart(2, '0')
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
export default function WeeklyOutlook() {
  const [symbol, setSymbol] = useState('XAUUSD')
  const [narrative, setNarrative] = useState<NarrativeResult | null>(null)

  const { data: context, isLoading } = useQuery<WeeklyContext>({
    queryKey: ['weekly-context', symbol],
    queryFn: () => api(`/api/context/weekly/${symbol}`),
    staleTime: 300_000,
    retry: 1,
  })

  // Deep analysis for XAUUSD
  const { data: deepAnalysis } = useQuery<any>({
    queryKey: ['xau-deep-analysis'],
    queryFn: () => api('/api/xau/deep-analysis'),
    staleTime: 300_000,
    retry: 1,
    enabled: symbol === 'XAUUSD',
  })

  const generateMutation = useMutation<NarrativeResult, Error, void>({
    mutationFn: async () => {
      if (!context) throw new Error('No context loaded')
      return api('/api/ai/narrative', {
        method: 'POST',
        body: JSON.stringify({ type: 'weekly', context }),
      })
    },
    onSuccess: (data) => setNarrative(data),
  })

  const wp = context?.weeklyProfile
  const wt = context?.weekType
  const fund = context?.fundamental

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={S.page}>
        {/* Header */}
        <div style={S.headerRow}>
          <h1 style={S.title}>
            <BarChart3 size={22} />
            Weekly Outlook
          </h1>
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
              {/* Weekly Profile */}
              <div style={S.card}>
                <div style={S.cardTitle}>
                  <Shield size={13} />
                  Weekly Profile
                </div>
                <div style={{ marginBottom: 6 }}>
                  <span style={S.badge('rgba(59,130,246,.12)', '#3b82f6')}>
                    {wp?.model ?? '—'}
                  </span>
                </div>
                <div style={S.row}>
                  <span style={S.label}>Bias</span>
                  <span style={{ ...S.value, color: BIAS_COLORS[wp?.bias ?? ''] ?? '#94a3b8', fontWeight: 700 }}>
                    {wp?.bias ?? '—'}
                  </span>
                </div>
                <div style={S.row}>
                  <span style={S.label}>Confidence</span>
                  <span style={S.value}>{wp?.confidence != null ? `${wp.confidence}%` : '—'}</span>
                </div>
                <div style={S.row}>
                  <span style={S.label}>Week High</span>
                  <span style={S.value}>{wp?.weekHigh ?? '—'}</span>
                </div>
                <div style={S.row}>
                  <span style={S.label}>Week Low</span>
                  <span style={S.value}>{wp?.weekLow ?? '—'}</span>
                </div>
              </div>

              {/* Week Type */}
              <div style={S.card}>
                <div style={S.cardTitle}>
                  <Zap size={13} />
                  Week Type
                </div>
                <div style={{ marginBottom: 6 }}>
                  <span style={S.badge(
                    wt?.type === 'HIGH' ? 'rgba(239,68,68,.15)' : wt?.type === 'MEDIUM' ? 'rgba(245,158,11,.12)' : 'rgba(148,163,184,.08)',
                    wt?.type === 'HIGH' ? '#f87171' : wt?.type === 'MEDIUM' ? '#f59e0b' : '#94a3b8'
                  )}>
                    {wt?.type ?? '—'} Impact
                  </span>
                </div>
                <div style={S.row}>
                  <span style={S.label}>Volatility Mult.</span>
                  <span style={S.value}>{wt?.volatilityMultiplier ?? '—'}x</span>
                </div>
                <div style={S.row}>
                  <span style={S.label}>Max Positions</span>
                  <span style={S.value}>{wt?.maxPositions ?? '—'}</span>
                </div>
                <div style={{ ...S.row, alignItems: 'flex-start' }}>
                  <span style={S.label}>Strategy</span>
                  <span style={{ ...S.value, textAlign: 'right', maxWidth: '60%' }}>{wt?.strategy ?? '—'}</span>
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
                  <span style={S.label}>Day Type</span>
                  <span style={S.value}>{fund?.dayType ?? '—'}</span>
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

            {/* Deep Analysis (XAUUSD only) */}
            {symbol === 'XAUUSD' && deepAnalysis && (
              <div style={{ marginBottom: 20 }}>
                {/* Market Structure */}
                <div style={S.narrativeBox}>
                  <div style={S.sectionTitle}>
                    <Target size={16} color="#f59e0b" />
                    Market Structure & Technical
                  </div>
                  
                  {/* Bias + Confluence */}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                    <div style={{ flex: 1, padding: 12, background: 'rgba(255,255,255,.03)', borderRadius: 8 }}>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>OVERALL BIAS</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: deepAnalysis.bias === 'bullish' ? '#22c55e' : deepAnalysis.bias === 'bearish' ? '#ef4444' : '#94a3b8' }}>
                        {deepAnalysis.bias?.toUpperCase()}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>Confluence: {deepAnalysis.confluenceScore}%</div>
                    </div>
                    <div style={{ flex: 1, padding: 12, background: 'rgba(255,255,255,.03)', borderRadius: 8 }}>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>TREND (D1/H4/H1)</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {['daily', 'h4', 'h1'].map(tf => (
                          <span key={tf} style={{ fontSize: 12, fontWeight: 600, color: deepAnalysis.trend?.[tf]?.direction === 'bullish' ? '#22c55e' : deepAnalysis.trend?.[tf]?.direction === 'bearish' ? '#ef4444' : '#94a3b8' }}>
                            {tf.toUpperCase()}: {deepAnalysis.trend?.[tf]?.direction?.slice(0, 3)?.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Technical Indicators */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                    {[
                      { label: 'RSI', value: deepAnalysis.technicals?.rsi?.value, sub: deepAnalysis.technicals?.rsi?.interpretation, color: deepAnalysis.technicals?.rsi?.value > 70 ? '#ef4444' : deepAnalysis.technicals?.rsi?.value < 30 ? '#22c55e' : '#f59e0b' },
                      { label: 'MACD', value: deepAnalysis.technicals?.macd?.histogram, sub: deepAnalysis.technicals?.macd?.interpretation, color: deepAnalysis.technicals?.macd?.histogram > 0 ? '#22c55e' : '#ef4444' },
                      { label: 'BB Width', value: `${deepAnalysis.technicals?.bollinger?.width}%`, sub: 'volatility', color: '#f59e0b' },
                      { label: 'ATR', value: `$${deepAnalysis.technicals?.atr}`, sub: 'daily range', color: '#94a3b8' },
                    ].map((item, i) => (
                      <div key={i} style={{ padding: 10, background: 'rgba(255,255,255,.03)', borderRadius: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 2 }}>{item.label}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: item.color }}>{item.value}</div>
                        <div style={{ fontSize: 9, color: '#64748b' }}>{item.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Key Levels */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b', marginBottom: 8 }}>KEY LEVELS</div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 4 }}>SUPPORT</div>
                        {deepAnalysis.keyLevels?.support?.map((l: any, i: number) => (
                          <div key={i} style={{ fontSize: 12, color: '#22c55e', marginBottom: 2 }}>
                            ${l.price} <span style={{ fontSize: 9, color: '#64748b' }}>({l.strength})</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 4 }}>RESISTANCE</div>
                        {deepAnalysis.keyLevels?.resistance?.map((l: any, i: number) => (
                          <div key={i} style={{ fontSize: 12, color: '#ef4444', marginBottom: 2 }}>
                            ${l.price} <span style={{ fontSize: 9, color: '#64748b' }}>({l.strength})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Weekly Prediction */}
                  <div style={{ padding: 12, background: 'rgba(245,158,11,.05)', borderRadius: 8, border: '1px solid rgba(245,158,11,.2)' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b', marginBottom: 8 }}>
                      <Target size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                      WEEKLY OUTLOOK
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
                      Expected Range: ${deepAnalysis.prediction?.expectedLow} — ${deepAnalysis.prediction?.expectedHigh}
                    </div>
                    {deepAnalysis.prediction?.scenarios?.map((sc: any, i: number) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: i > 0 ? '1px solid rgba(255,255,255,.05)' : 'none' }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{sc.name}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>
                            Target: ${sc.target} | SL: ${sc.invalidation} | RR: {sc.riskReward}
                          </div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: sc.probability >= 50 ? '#22c55e' : '#f59e0b' }}>
                          {sc.probability}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

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
                      Generate Outlook
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
                  Click "Generate Outlook" to create AI weekly narrative
                </div>
              )}
            </div>

            {/* Economic Events — Grouped by Day */}
            {(() => {
              const dayMap: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 }
              const now = new Date()
              const todayDow = now.getUTCDay()
              const events = (context.economicEvents ?? [])
              const mapped = events.map((ev: any) => {
                const dow = dayMap[ev.day?.toLowerCase()] ?? 1
                const isToday = dow === todayDow
                const isUpcoming = dow > todayDow
                const dayDiff = dow - todayDow
                return {
                  ...ev,
                  dayLabel: isToday ? 'Today' : isUpcoming ? `In ${dayDiff}d` : 'Passed',
                }
              })

              const active = mapped.filter((e: any) => e.dayLabel !== 'Passed')
              if (active.length === 0) return null

              // Group by dayLabel
              const groups: Record<string, any[]> = {}
              for (const ev of active) {
                const key = ev.dayLabel ?? 'Other'
                if (!groups[key]) groups[key] = []
                groups[key].push(ev)
              }

              // Sort groups: Today first, then by day number
              const dayOrder = (label: string) => {
                if (label === 'Today') return 0
                const m = label.match(/In (\d+)d/)
                return m ? parseInt(m[1]) : 99
              }
              const sortedGroups = Object.entries(groups).sort(
                ([a], [b]) => dayOrder(a) - dayOrder(b)
              )

              // Sort events within each group by time
              for (const [, evs] of sortedGroups) {
                evs.sort((a: any, b: any) => (a.time ?? '').localeCompare(b.time ?? ''))
              }

              return (
                <div style={{ ...S.card, marginBottom: 20 }}>
                  <div style={S.sectionTitle}>
                    <Calendar size={16} color="#f59e0b" />
                    Economic Events
                  </div>
                  {sortedGroups.map(([dayLabel, evs]) => {
                    const isToday = dayLabel === 'Today'
                    return (
                      <div key={dayLabel} style={{
                        marginBottom: 16,
                        border: isToday ? '1px solid rgba(245,158,11,.3)' : '1px solid rgba(30,30,46,.6)',
                        borderRadius: 8,
                        overflow: 'hidden',
                        background: isToday ? 'rgba(245,158,11,.04)' : 'transparent',
                      }}>
                        {/* Day Header */}
                        <div style={{
                          padding: '8px 14px',
                          borderBottom: isToday ? '1px solid rgba(245,158,11,.2)' : '1px solid rgba(30,30,46,.6)',
                          display: 'flex', alignItems: 'center', gap: 8,
                          background: isToday ? 'rgba(245,158,11,.08)' : 'rgba(255,255,255,.02)',
                        }}>
                          {isToday && <span style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: '#f59e0b', boxShadow: '0 0 6px rgba(245,158,11,.5)',
                          }} />}
                          <span style={{
                            fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
                            color: isToday ? '#f59e0b' : '#94a3b8',
                          }}>
                            {isToday ? 'TODAY' : dayLabel.toUpperCase()}
                          </span>
                          <span style={{ fontSize: 10, color: '#64748b' }}>
                            {evs.length} event{evs.length > 1 ? 's' : ''}
                          </span>
                        </div>
                        {/* Event Rows */}
                        {evs.map((ev: any, i: number) => {
                          const ib = TIER_BADGE[ev.tier] ?? TIER_BADGE['C']
                          const isHigh = ev.tier === 'S+' || ev.tier === 'S'
                          return (
                            <div key={i} style={{
                              display: 'flex', alignItems: 'center', gap: 12,
                              padding: '8px 14px',
                              borderBottom: i < evs.length - 1 ? '1px solid rgba(30,30,46,.4)' : 'none',
                              background: isHigh ? 'rgba(239,68,68,.04)' : 'transparent',
                            }}>
                              {/* Time */}
                              <span style={{
                                fontSize: 12, fontFamily: 'var(--font-mono)', color: '#94a3b8',
                                minWidth: 56, textAlign: 'right',
                              }}>
                                {utcToWib(ev.time)}
                              </span>
                              {/* Tier Badge */}
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                                background: ib.bg, color: ib.text,
                                minWidth: 60, textAlign: 'center', letterSpacing: '0.03em',
                              }}>
                                {ib.label}
                              </span>
                              {/* Name */}
                              <span style={{
                                flex: 1, fontSize: 13, color: isHigh ? '#e2e8f0' : '#cbd5e1',
                                fontWeight: isHigh ? 600 : 400,
                              }}>
                                {ev.name}
                              </span>
                              {/* Forecast / Previous */}
                              {(ev.forecast != null || ev.previous != null) && (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 6,
                                  flexShrink: 0, fontSize: 11,
                                }}>
                                  {ev.forecast != null && (
                                    <span style={{ color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>
                                      F: {ev.forecast}
                                    </span>
                                  )}
                                  {ev.previous != null && (
                                    <span style={{ color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                                      P: {ev.previous}
                                    </span>
                                  )}
                                </span>
                              )}
                              {/* Country + Chain */}
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                flexShrink: 0,
                              }}>
                                <span style={{
                                  fontSize: 10, padding: '1px 5px', borderRadius: 3,
                                  background: 'rgba(148,163,184,.08)', color: '#94a3b8',
                                }}>{ev.country}</span>
                                <span style={{ fontSize: 10, color: '#475569' }}>{ev.chain}</span>
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )
            })()}

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
                        <th style={S.th}>Date</th>
                        <th style={S.th}>Event</th>
                        <th style={S.th}>Forecast</th>
                        <th style={S.th}>Actual</th>
                        <th style={S.th}>Surprise</th>
                      </tr>
                    </thead>
                    <tbody>
                      {context.recentReleases.map((rel: any, i: number) => {
                        const pct = surprisePercent(String(rel.consensus ?? rel.forecast ?? ''), String(rel.actual ?? ''))
                        const releaseDate = rel.date ? new Date(rel.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'
                        const isBig = Math.abs(pct ?? 0) >= 5
                        return (
                          <tr key={i} style={isBig ? { background: 'rgba(245,158,11,.04)' } : undefined}>
                            <td style={{ ...S.td, fontSize: 11, color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>{releaseDate}</td>
                            <td style={{ ...S.td, fontWeight: 600 }}>{rel.event}</td>
                            <td style={S.td}>{rel.consensus ?? rel.forecast ?? '—'}</td>
                            <td style={{ ...S.td, fontWeight: 600 }}>{rel.actual ?? '—'}</td>
                            <td style={{ ...S.td, color: surpriseColor(pct), fontWeight: 700 }}>
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
          </>
        )}
      </div>
    </>
  )
}
