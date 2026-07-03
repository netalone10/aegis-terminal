import { useQuery } from '@tanstack/react-query'
import { useState, useEffect, useMemo } from 'react'
import {
  Zap, Target, Shield, TrendingUp, TrendingDown, Clock,
  AlertTriangle, CheckCircle, BarChart3, Activity,
} from 'lucide-react'
import { api } from '../../lib/api'

/* ── types ─────────────────────────────────────────────────────────── */
interface UnifiedSignalResponse {
  symbol: string
  active: boolean
  signal: {
    direction: 'LONG' | 'SHORT' | 'NEUTRAL'
    entry: number
    sl: number
    tp: number
    rr: number
    confidence: number
    confluence: string[]
  } | null
  breakdown: {
    weeklyProfile: {
      score: number
      bias: string
      model: string
      confidence: number
      weekHigh: number
      weekLow: number
      weekType: string
    } | null
    h4Signal: {
      score: number
      modelNumber: string
      killzone: string
    } | null
    h1Confirm: {
      score: number
      ohStatus: string
      olStatus: string
      confirmed: boolean
    } | null
    m15Entry: {
      score: number
      po3Phase: string
      mss: boolean
      fvgStage: string
    } | null
    fundamental: {
      score: number
      bias: string
      weekType: string
      eventProximity: string
    } | null
    smt: {
      score: number
      divergenceType: string
      correlatedPairs: string[]
    } | null
  }
}

interface FundamentalContext {
  symbol: string
  bias: string
  score: number
  dayType: string
  weekType: string
  eventProximity: string
  nextEvent: {
    name: string
    time: string
    impact: string
  } | null
  lastSurprise: string | null
}

interface SignalHistoryEntry {
  id: number
  symbol: string
  direction: string
  entry: number
  sl: number
  tp: number
  rr: number
  result: string
  confidence: number
  created_at: string
}

interface SignalStats {
  total: number
  wins: number
  losses: number
  open: number
  winRate: number
  avgRR: number
  byBias: Record<string, { total: number; wins: number; losses: number; winRate: number }>
  calibration: Record<string, { total: number; wins: number; actualWinRate: number }>
  ready: boolean
}

/* ── constants ─────────────────────────────────────────────────────── */
const SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSD']

const WEEK_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  HIGH: { bg: 'rgba(239,68,68,.15)', text: '#f87171', border: 'rgba(239,68,68,.3)' },
  MEDIUM: { bg: 'rgba(245,158,11,.12)', text: '#f59e0b', border: 'rgba(245,158,11,.25)' },
  LOW: { bg: 'rgba(148,163,184,.10)', text: '#94a3b8', border: 'rgba(148,163,184,.2)' },
}

const DAY_TYPE_META: Record<string, { color: string; icon: string }> = {
  manipulation: { color: '#ef4444', icon: '🎯' },
  continuation: { color: '#22c55e', icon: '📈' },
  reversal: { color: '#f59e0b', icon: '🔄' },
  expansion: { color: '#3b82f6', icon: '🚀' },
  distribution: { color: '#a855f7', icon: '📊' },
}

/* ── helpers ───────────────────────────────────────────────────────── */
function fmtPrice(p: number | null | undefined) {
  if (p == null || isNaN(p)) return '—'
  return p < 10 ? p.toFixed(4) : p.toFixed(2)
}

function fmtCountdown(ms: number) {
  if (ms <= 0) return 'NOW'
  const d = Math.floor(ms / 86400_000)
  const h = Math.floor((ms % 86400_000) / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return [d > 0 && `${d}d`, h > 0 && `${h}h`, `${m}m`].filter(Boolean).join(' ')
}

function scoreColor(score: number) {
  if (score >= 70) return '#22c55e'
  if (score >= 40) return '#f59e0b'
  return '#ef4444'
}

function resultColor(r: string) {
  if (r === 'hit_tp' || r === 'win') return '#22c55e'
  if (r === 'hit_sl' || r === 'loss') return '#ef4444'
  if (r === 'open') return '#f59e0b'
  return '#64748b'
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

/* ── Score Card ────────────────────────────────────────────────────── */
function ScoreCard({ title, icon, data }: {
  title: string
  icon: React.ReactNode
  data: { label: string; value: string | boolean | number; color?: string }[]
}) {
  return (
    <div style={{
      background: '#12121a',
      border: '1px solid #1e1e2e',
      borderRadius: 10,
      padding: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon}
        <span style={{ fontWeight: 600, fontSize: 13, color: '#e2e8f0' }}>{title}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>{d.label}</span>
            <span style={{
              fontSize: 12, fontWeight: 600,
              color: d.color ?? (typeof d.value === 'boolean' ? (d.value ? '#22c55e' : '#ef4444') : '#e2e8f0'),
              fontFamily: 'var(--font-mono)',
            }}>
              {typeof d.value === 'boolean' ? (d.value ? 'YES' : 'NO') : d.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Confidence Bar ────────────────────────────────────────────────── */
function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 70 ? '#22c55e' : value >= 40 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ width: '100%', height: 8, background: '#1e1e2e', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{
        width: `${Math.min(value, 100)}%`, height: '100%',
        background: color, borderRadius: 4,
        transition: 'width 0.5s ease',
      }} />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════ */
/* ── MAIN COMPONENT ────────────────────────────────────────────────── */
/* ══════════════════════════════════════════════════════════════════════ */
export default function Signals() {
  const [symbol, setSymbol] = useState('XAUUSD')
  const [biasFilter, setBiasFilter] = useState<string>('all')
  const [resultFilter, setResultFilter] = useState<string>('all')
  const [countdown, setCountdown] = useState('')

  // Countdown tick for next event
  useEffect(() => {
    const timer = setInterval(() => setCountdown(c => c), 1000)
    return () => clearInterval(timer)
  }, [])

  /* ── data fetching ─────────────────────────────────────────────── */
  const { data: unified, isLoading: sigLoading, dataUpdatedAt } = useQuery<UnifiedSignalResponse>({
    queryKey: ['unified-signal', symbol],
    queryFn: () => api(`/api/unified-signal/${symbol}`),
    refetchInterval: 10_000,
    retry: 1,
  })

  const { data: fundamental } = useQuery<FundamentalContext>({
    queryKey: ['fundamental-context', symbol],
    queryFn: () => api(`/api/fundamental-context/${symbol}`),
    refetchInterval: 30_000,
    retry: 1,
  })

  const { data: history = [] } = useQuery<SignalHistoryEntry[]>({
    queryKey: ['signal-history', symbol],
    queryFn: () => api(`/api/signals/history/${symbol}`),
    refetchInterval: 30_000,
    retry: false,
    staleTime: 0,
  })

  const { data: stats } = useQuery<SignalStats>({
    queryKey: ['signal-stats', symbol],
    queryFn: () => api(`/api/signals/history/${symbol}/stats`),
    refetchInterval: 60_000,
    retry: false,
  })

  /* ── computed ──────────────────────────────────────────────────── */
  const filteredHistory = useMemo(() =>
    history.filter(h => {
      if (biasFilter !== 'all') {
        const b = h.direction?.toLowerCase()
        if (biasFilter === 'bullish' && b !== 'long') return false
        if (biasFilter === 'bearish' && b !== 'short') return false
      }
      if (resultFilter !== 'all' && h.result !== resultFilter) return false
      return true
    }),
    [history, biasFilter, resultFilter]
  )

  const nextEventCountdown = useMemo(() => {
    if (!fundamental?.nextEvent?.time) return null
    const ms = new Date(fundamental.nextEvent.time).getTime() - Date.now()
    return ms > 0 ? fmtCountdown(ms) : 'NOW'
  }, [fundamental, countdown])

  const isEventProximity = useMemo(() => {
    if (!fundamental?.nextEvent?.time) return false
    const ms = new Date(fundamental.nextEvent.time).getTime() - Date.now()
    return ms > 0 && ms < 30 * 60_000
  }, [fundamental, countdown])

  const signal = unified?.signal
  const breakdown = unified?.breakdown
  const wt = fundamental?.weekType?.toUpperCase() ?? 'MEDIUM'
  const wtColor = WEEK_TYPE_COLORS[wt] ?? WEEK_TYPE_COLORS.MEDIUM
  const dayType = fundamental?.dayType
  const dayMeta = dayType ? DAY_TYPE_META[dayType] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ═══ HEADER ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
            Unified Signals
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>
            <Zap size={20} style={{ color: '#f59e0b', marginRight: 6, verticalAlign: 'middle' }} />
            Signal Dashboard
          </h1>
          <p style={{ margin: 0, fontSize: 12, color: '#64748b', marginTop: 2 }}>
            Multi-layer analysis with confluence scoring
          </p>
        </div>
        {dataUpdatedAt && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'pulse-dot 2s infinite' }} />
            Live · 10s refresh
          </span>
        )}
      </div>

      {/* ═══ SYMBOL SELECTOR ═══ */}
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap',
        background: '#12121a', border: '1px solid #1e1e2e',
        borderRadius: 10, padding: 12,
      }}>
        {SYMBOLS.map(s => (
          <button
            key={s}
            onClick={() => setSymbol(s)}
            style={{
              padding: '7px 16px', borderRadius: 8, border: '1px solid',
              borderColor: symbol === s ? '#f59e0b' : '#1e1e2e',
              background: symbol === s ? 'rgba(245,158,11,.12)' : 'transparent',
              color: symbol === s ? '#f59e0b' : '#64748b',
              fontWeight: symbol === s ? 700 : 500,
              fontSize: 12, cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              transition: 'all 0.2s',
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* ═══ LOADING ═══ */}
      {sigLoading && (
        <div style={{
          background: '#12121a', border: '1px solid #1e1e2e',
          borderRadius: 10, padding: 40, textAlign: 'center',
          color: '#64748b', fontSize: 13,
        }}>
          Analyzing multi-layer signals...
        </div>
      )}

      {/* ═══ ACTIVE SIGNAL CARD ═══ */}
      {unified && (
        <div style={{
          background: '#12121a',
          border: '1px solid #1e1e2e',
          borderRadius: 10,
          overflow: 'hidden',
        }}>
          {/* Direction Banner */}
          <div style={{
            padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
            background: !signal ? 'rgba(100,116,139,.06)'
              : signal.direction === 'LONG' ? 'rgba(34,197,94,.06)' : 'rgba(239,68,68,.06)',
            borderBottom: '1px solid #1e1e2e',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Zap size={18} style={{ color: '#f59e0b' }} />
              <span style={{
                fontSize: 16, fontWeight: 800, color: '#e2e8f0',
                fontFamily: 'var(--font-mono)',
              }}>
                {symbol}
              </span>
            </div>

            {signal && signal.direction !== 'NEUTRAL' ? (
              <>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 12px', borderRadius: 6,
                  background: signal.direction === 'LONG' ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)',
                  border: `1px solid ${signal.direction === 'LONG' ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)'}`,
                }}>
                  {signal.direction === 'LONG'
                    ? <TrendingUp size={14} style={{ color: '#22c55e' }} />
                    : <TrendingDown size={14} style={{ color: '#ef4444' }} />
                  }
                  <span style={{
                    fontWeight: 800, fontSize: 13,
                    color: signal.direction === 'LONG' ? '#22c55e' : '#ef4444',
                  }}>
                    {signal.direction}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, auto)', gap: 16, marginLeft: 'auto' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>Entry</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>
                      {fmtPrice(signal.entry)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>SL</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#ef4444', fontFamily: 'var(--font-mono)' }}>
                      {fmtPrice(signal.sl)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>TP</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#22c55e', fontFamily: 'var(--font-mono)' }}>
                      {fmtPrice(signal.tp)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>R:R</div>
                    <div style={{
                      fontSize: 14, fontWeight: 700,
                      color: signal.rr >= 2 ? '#22c55e' : '#f59e0b',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {signal.rr ? signal.rr.toFixed(1) : '—'}:1
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <span style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
                No active signal — waiting for confluence
              </span>
            )}
          </div>

          {/* Confidence + Confluence */}
          <div style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>CONFIDENCE</span>
              <span style={{
                fontSize: 13, fontWeight: 700,
                color: scoreColor(signal?.confidence ?? 0),
                fontFamily: 'var(--font-mono)',
              }}>
                {signal?.confidence ?? 0}%
              </span>
            </div>
            <ConfidenceBar value={signal?.confidence ?? 0} />

            {signal?.confluence && signal.confluence.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Confluence Factors
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {signal.confluence.map((c, i) => (
                    <span key={i} style={{
                      padding: '3px 8px', borderRadius: 4,
                      background: 'rgba(245,158,11,.08)',
                      border: '1px solid rgba(245,158,11,.15)',
                      fontSize: 10, color: '#f59e0b', fontWeight: 500,
                    }}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ LAYER BREAKDOWN (6 cards) ═══ */}
      {breakdown && (
        <div>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Layer Breakdown
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 10,
          }}>
            {/* 1. Weekly Profile */}
            <ScoreCard
              title="Weekly Profile"
              icon={<BarChart3 size={14} style={{ color: '#f59e0b' }} />}
              data={[
                { label: 'Score', value: breakdown.weeklyProfile?.score ?? '—', color: scoreColor(breakdown.weeklyProfile?.score ?? 0) },
                { label: 'Bias', value: (breakdown.weeklyProfile?.bias ?? '—').toUpperCase(), color: breakdown.weeklyProfile?.bias === 'bullish' ? '#22c55e' : breakdown.weeklyProfile?.bias === 'bearish' ? '#ef4444' : '#64748b' },
                { label: 'Model', value: breakdown.weeklyProfile?.model ?? '—' },
                { label: 'Confidence', value: `${breakdown.weeklyProfile?.confidence ?? 0}%` },
              ]}
            />

            {/* 2. H4 Signal */}
            <ScoreCard
              title="H4 Signal"
              icon={<Activity size={14} style={{ color: '#3b82f6' }} />}
              data={[
                { label: 'Score', value: breakdown.h4Signal?.score ?? '—', color: scoreColor(breakdown.h4Signal?.score ?? 0) },
                { label: 'Model', value: breakdown.h4Signal?.modelNumber ?? '—' },
                { label: 'Killzone', value: breakdown.h4Signal?.killzone ?? '—' },
              ]}
            />

            {/* 3. H1 Confirm */}
            <ScoreCard
              title="H1 Confirm"
              icon={<CheckCircle size={14} style={{ color: '#22c55e' }} />}
              data={[
                { label: 'Score', value: breakdown.h1Confirm?.score ?? '—', color: scoreColor(breakdown.h1Confirm?.score ?? 0) },
                { label: 'OH Status', value: breakdown.h1Confirm?.ohStatus ?? '—' },
                { label: 'OL Status', value: breakdown.h1Confirm?.olStatus ?? '—' },
                { label: 'Confirmed', value: breakdown.h1Confirm?.confirmed ?? false },
              ]}
            />

            {/* 4. M15 Entry */}
            <ScoreCard
              title="M15 Entry"
              icon={<Target size={14} style={{ color: '#a855f7' }} />}
              data={[
                { label: 'Score', value: breakdown.m15Entry?.score ?? '—', color: scoreColor(breakdown.m15Entry?.score ?? 0) },
                { label: 'PO3 Phase', value: breakdown.m15Entry?.po3Phase ?? '—' },
                { label: 'MSS', value: breakdown.m15Entry?.mss ?? false },
                { label: 'FVG Stage', value: breakdown.m15Entry?.fvgStage ?? '—' },
              ]}
            />

            {/* 5. Fundamental */}
            <ScoreCard
              title="Fundamental"
              icon={<Shield size={14} style={{ color: '#f59e0b' }} />}
              data={[
                { label: 'Score', value: breakdown.fundamental?.score ?? '—', color: scoreColor(breakdown.fundamental?.score ?? 0) },
                { label: 'Bias', value: (breakdown.fundamental?.bias ?? '—').toUpperCase(), color: breakdown.fundamental?.bias === 'bullish' ? '#22c55e' : breakdown.fundamental?.bias === 'bearish' ? '#ef4444' : '#64748b' },
                { label: 'Week Type', value: breakdown.fundamental?.weekType ?? '—' },
                { label: 'Event Proximity', value: breakdown.fundamental?.eventProximity ?? '—' },
              ]}
            />

            {/* 6. SMT */}
            <ScoreCard
              title="SMT Divergence"
              icon={<AlertTriangle size={14} style={{ color: '#ef4444' }} />}
              data={[
                { label: 'Score', value: breakdown.smt?.score ?? '—', color: scoreColor(breakdown.smt?.score ?? 0) },
                { label: 'Divergence', value: breakdown.smt?.divergenceType ?? 'NONE', color: breakdown.smt?.divergenceType && breakdown.smt.divergenceType !== 'NONE' ? '#ef4444' : '#64748b' },
                { label: 'Correlated', value: breakdown.smt?.correlatedPairs?.join(', ') ?? '—' },
              ]}
            />
          </div>
        </div>
      )}

      {/* ═══ CONTEXT PANEL ═══ */}
      {fundamental && (
        <div style={{
          background: '#12121a', border: '1px solid #1e1e2e',
          borderRadius: 10, padding: 14,
        }}>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Context
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Week Type Badge */}
            <div style={{
              padding: '4px 10px', borderRadius: 6,
              background: wtColor.bg,
              border: `1px solid ${wtColor.border}`,
              fontSize: 11, fontWeight: 700, color: wtColor.text,
            }}>
              {wt} IMPACT WEEK
            </div>

            {/* Day Type */}
            {dayMeta && (
              <div style={{
                padding: '4px 10px', borderRadius: 6,
                background: `${dayMeta.color}15`,
                border: `1px solid ${dayMeta.color}30`,
                fontSize: 11, fontWeight: 600, color: dayMeta.color,
              }}>
                {dayMeta.icon} {(dayType ?? '').charAt(0).toUpperCase() + (dayType ?? '').slice(1)}
              </div>
            )}

            {/* Event Proximity Warning */}
            {isEventProximity && (
              <div style={{
                padding: '4px 10px', borderRadius: 6,
                background: 'rgba(239,68,68,.12)',
                border: '1px solid rgba(239,68,68,.25)',
                fontSize: 11, fontWeight: 700, color: '#ef4444',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <AlertTriangle size={12} />
                WITHIN 30 MIN
              </div>
            )}
          </div>

          {/* Next Event */}
          {fundamental.nextEvent && (
            <div style={{
              marginTop: 10, padding: '10px 12px',
              borderRadius: 8,
              background: isEventProximity ? 'rgba(239,68,68,.06)' : 'rgba(245,158,11,.05)',
              border: `1px solid ${isEventProximity ? 'rgba(239,68,68,.15)' : 'rgba(245,158,11,.1)'}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Clock size={14} style={{ color: isEventProximity ? '#ef4444' : '#f59e0b', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
                  {fundamental.nextEvent.name}
                </span>
                <span style={{
                  marginLeft: 8, fontSize: 10, fontWeight: 600,
                  padding: '1px 6px', borderRadius: 3,
                  background: fundamental.nextEvent.impact === 'HIGH' ? 'rgba(239,68,68,.15)' : 'rgba(245,158,11,.1)',
                  color: fundamental.nextEvent.impact === 'HIGH' ? '#ef4444' : '#f59e0b',
                }}>
                  {fundamental.nextEvent.impact}
                </span>
              </div>
              <span style={{
                fontSize: 13, fontWeight: 700,
                color: isEventProximity ? '#ef4444' : '#f59e0b',
                fontFamily: 'var(--font-mono)',
              }}>
                {nextEventCountdown ?? '—'}
              </span>
            </div>
          )}

          {/* Last Surprise */}
          {fundamental.lastSurprise && (
            <div style={{
              marginTop: 8, fontSize: 11, color: '#64748b',
            }}>
              Last Surprise: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{fundamental.lastSurprise}</span>
            </div>
          )}
        </div>
      )}

      {/* ═══ WIN RATE STATS ═══ */}
      {stats && stats.total > 0 && (
        <div style={{
          background: '#12121a', border: '1px solid #1e1e2e',
          borderRadius: 10, padding: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Target size={14} style={{ color: '#f59e0b' }} />
            <span style={{ fontWeight: 600, fontSize: 13, color: '#e2e8f0' }}>Performance</span>
            {!stats.ready && (
              <span style={{ fontSize: 10, color: '#64748b', marginLeft: 'auto' }}>
                Collecting... ({stats.total}/10 min signals)
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(70px, 1fr))', gap: 12 }}>
            {[
              { label: 'Total', value: stats.total, color: '#e2e8f0' },
              { label: 'Wins', value: stats.wins, color: '#22c55e' },
              { label: 'Losses', value: stats.losses, color: '#ef4444' },
              { label: 'Win Rate', value: `${stats.winRate}%`, color: stats.winRate >= 50 ? '#22c55e' : '#ef4444' },
              { label: 'Avg R:R', value: `${stats.avgRR?.toFixed(1) ?? '—'}:1`, color: '#f59e0b' },
            ].map(item => (
              <div key={item.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: item.color, fontFamily: 'var(--font-mono)' }}>
                  {item.value}
                </div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{item.label}</div>
              </div>
            ))}
          </div>

          {/* Per-bias breakdown */}
          {Object.keys(stats.byBias).length > 0 && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10, fontSize: 11, color: '#64748b' }}>
              {Object.entries(stats.byBias).map(([bias, data]) => (
                <span key={bias}>
                  <span style={{ textTransform: 'capitalize' }}>{bias}</span>:{' '}
                  <span style={{ fontWeight: 600, color: data.winRate >= 50 ? '#22c55e' : '#ef4444' }}>
                    {data.winRate}%
                  </span>
                  {' '}({data.wins}/{data.total})
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ SIGNAL HISTORY TABLE ═══ */}
      <div style={{
        background: '#12121a', border: '1px solid #1e1e2e',
        borderRadius: 10, overflow: 'hidden',
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e1e2e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Clock size={14} style={{ color: '#f59e0b' }} />
            <span style={{ fontWeight: 600, fontSize: 13, color: '#e2e8f0' }}>Signal History</span>
            <span style={{
              fontSize: 10, color: '#64748b',
              padding: '2px 8px', borderRadius: 4,
              background: 'rgba(100,116,139,.1)',
            }}>
              {filteredHistory.length} signals
            </span>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Bias:</span>
            {['all', 'bullish', 'bearish'].map(b => (
              <button
                key={b}
                onClick={() => setBiasFilter(b)}
                style={{
                  padding: '2px 8px', borderRadius: 4,
                  fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  border: '1px solid',
                  borderColor: biasFilter === b ? '#f59e0b' : '#1e1e2e',
                  background: biasFilter === b ? 'rgba(245,158,11,.12)' : 'transparent',
                  color: biasFilter === b ? '#f59e0b' : '#64748b',
                }}
              >
                {b === 'all' ? 'All' : b === 'bullish' ? 'LONG' : 'SHORT'}
              </button>
            ))}

            <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginLeft: 6 }}>Result:</span>
            {['all', 'open', 'hit_tp', 'hit_sl'].map(r => (
              <button
                key={r}
                onClick={() => setResultFilter(r)}
                style={{
                  padding: '2px 8px', borderRadius: 4,
                  fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  border: '1px solid',
                  borderColor: resultFilter === r ? '#f59e0b' : '#1e1e2e',
                  background: resultFilter === r ? 'rgba(245,158,11,.12)' : 'transparent',
                  color: resultFilter === r ? '#f59e0b' : '#64748b',
                }}
              >
                {r === 'all' ? 'All' : r === 'hit_tp' ? 'WIN' : r === 'hit_sl' ? 'LOSS' : 'OPEN'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e1e2e' }}>
                {['Time', 'Direction', 'Entry', 'SL', 'TP', 'R:R', 'Result', 'Conf'].map(h => (
                  <th key={h} style={{
                    textAlign: h === 'Time' ? 'left' : 'right',
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
              {filteredHistory.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                    No signals yet
                  </td>
                </tr>
              )}
              {filteredHistory.map(h => {
                const isLong = h.direction?.toLowerCase() === 'long'
                return (
                  <tr key={h.id} style={{ borderBottom: '1px solid rgba(30,30,46,.5)' }}>
                    <td style={{
                      padding: '7px 12px', fontSize: 11,
                      color: '#64748b', whiteSpace: 'nowrap',
                    }}>
                      <div>{timeAgo(h.created_at)}</div>
                    </td>
                    <td style={{ padding: '7px 12px', textAlign: 'right' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        padding: '2px 6px', borderRadius: 3,
                        background: isLong ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)',
                        color: isLong ? '#22c55e' : '#ef4444',
                      }}>
                        {h.direction?.toUpperCase() ?? '—'}
                      </span>
                    </td>
                    <td style={{
                      padding: '7px 12px', textAlign: 'right',
                      fontSize: 12, fontWeight: 600, color: '#e2e8f0',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {fmtPrice(h.entry)}
                    </td>
                    <td style={{
                      padding: '7px 12px', textAlign: 'right',
                      fontSize: 12, color: '#ef4444',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {fmtPrice(h.sl)}
                    </td>
                    <td style={{
                      padding: '7px 12px', textAlign: 'right',
                      fontSize: 12, color: '#22c55e',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {fmtPrice(h.tp)}
                    </td>
                    <td style={{
                      padding: '7px 12px', textAlign: 'right',
                      fontSize: 12, fontWeight: 700,
                      color: h.rr >= 2 ? '#22c55e' : '#f59e0b',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {h.rr ? h.rr.toFixed(1) : '—'}:1
                    </td>
                    <td style={{ padding: '7px 12px', textAlign: 'right' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        color: resultColor(h.result),
                      }}>
                        {h.result === 'hit_tp' ? 'TP ✓' : h.result === 'hit_sl' ? 'SL ✗' : h.result?.toUpperCase() ?? '—'}
                      </span>
                    </td>
                    <td style={{
                      padding: '7px 12px', textAlign: 'right',
                      fontSize: 11, fontWeight: 600,
                      color: scoreColor(h.confidence ?? 0),
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {h.confidence ?? 0}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disclaimer */}
      <div style={{
        padding: '8px 12px', borderRadius: 6,
        background: 'rgba(245,158,11,.04)',
        borderLeft: '3px solid #f59e0b',
        fontSize: 11, color: '#64748b',
      }}>
        ⚠️ Automated multi-layer analysis, not financial advice. Always do your own research before trading.
      </div>
    </div>
  )
}
