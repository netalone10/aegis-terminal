import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, ChevronDown, ChevronUp, Clock, Shield, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { api } from '../../lib/api'

// ── Types ──────────────────────────────────────────────────────────

interface SnapshotField {
  value: number | string | null
  source: string
  asOf: string
  status: 'live' | 'delayed' | 'unavailable'
}

interface SessionSnapshot {
  session: 'asia' | 'london' | 'ny'
  generatedAt: string
  dxy: SnapshotField
  xauusd: SnapshotField & { changePct?: number; rsi?: number; ema20?: number; ema50?: number }
  eurusd: SnapshotField & { changePct?: number }
  gbpusd: SnapshotField & { changePct?: number }
  usdjpy: SnapshotField & { changePct?: number }
  yield10y: SnapshotField
  yield2y: SnapshotField
  spread2y10y: SnapshotField
  calendarEvents: Array<{
    title: string; currency: string; impact: string; date: string
    actual?: string; forecast?: string; previous?: string
  }>
  headlines: Array<{ title: string; source: string; pubDate: string }>
}

interface AnalysisResult {
  regime: 'risk_on' | 'risk_off' | 'neutral' | 'volatile'
  regimeReason: string
  usdStrength: 'strong' | 'weak' | 'neutral'
  usdStrengthReason: string
  bias: {
    xauusd: { direction: 'bullish' | 'bearish' | 'neutral'; confidence: number; reason: string }
    eurusd: { direction: 'bullish' | 'bearish' | 'neutral'; confidence: number; reason: string }
    gbpusd: { direction: 'bullish' | 'bearish' | 'neutral'; confidence: number; reason: string }
    usdjpy: { direction: 'bullish' | 'bearish' | 'neutral'; confidence: number; reason: string }
  }
  riskLabel: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME'
  riskFactors: string[]
  keyLevels: {
    xauusd: { support: number | null; resistance: number | null }
  }
}

interface SessionReportData {
  session: string
  generatedAt: string
  dataAsOf: string
  status: 'LIVE' | 'DELAYED' | 'PARTIAL'
  confidence: number
  snapshot: SessionSnapshot
  analysis: AnalysisResult
  narrative: {
    summary: string
    perAssetNotes: Record<string, string>
    calendarCallouts: string[]
    tags: string[]
  }
  sources: string[]
}

// ── Constants ──────────────────────────────────────────────────────

const SESSIONS = [
  { key: 'asia', label: 'Asia', time: '07:00–15:00 WIB', color: '#60a5fa' },
  { key: 'london', label: 'London', time: '13:00–21:00 WIB', color: '#f59e0b' },
  { key: 'ny', label: 'New York', time: '19:00–04:00 WIB', color: '#a78bfa' },
] as const

const STATUS_COLORS: Record<string, string> = {
  LIVE: 'var(--kt-up)',
  DELAYED: 'var(--kt-gold)',
  PARTIAL: 'var(--kt-dn)',
}

const RISK_COLORS: Record<string, string> = {
  LOW: '#22c55e',
  MODERATE: '#f59e0b',
  HIGH: '#ef4444',
  EXTREME: '#a855f7',
}

const REGIME_LABELS: Record<string, string> = {
  risk_on: 'Risk-On',
  risk_off: 'Risk-Off',
  neutral: 'Neutral',
  volatile: 'Volatile',
}

// ── Helpers ────────────────────────────────────────────────────────

function DirectionIcon({ direction }: { direction: string }) {
  if (direction === 'bullish') return <TrendingUp size={14} style={{ color: 'var(--kt-up)' }} />
  if (direction === 'bearish') return <TrendingDown size={14} style={{ color: 'var(--kt-dn)' }} />
  return <Minus size={14} style={{ color: 'var(--kt-muted)' }} />
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short',
      timeZone: 'UTC',
    }) + ' UTC'
  } catch { return iso }
}

// ── Sub-components ─────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 4,
      fontSize: 'var(--xs)', fontWeight: 700, letterSpacing: '0.05em',
      background: `${STATUS_COLORS[status] ?? 'var(--kt-muted)'}20`,
      color: STATUS_COLORS[status] ?? 'var(--kt-muted)',
      fontFamily: 'var(--font-mono)',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: STATUS_COLORS[status] ?? 'var(--kt-muted)',
      }} />
      {status}
    </span>
  )
}

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        flex: 1, height: 6, background: 'var(--kt-bg2)',
        borderRadius: 3, overflow: 'hidden',
      }}>
        <div style={{
          width: `${value}%`, height: '100%',
          background: value >= 70 ? 'var(--kt-up)' : value >= 40 ? 'var(--kt-gold)' : 'var(--kt-dn)',
          borderRadius: 3,
        }} />
      </div>
      <span style={{ fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)', color: 'var(--kt-muted)', minWidth: 32 }}>
        {value}%
      </span>
    </div>
  )
}

function AssetMiniCard({ symbol, data }: {
  symbol: string
  data: { direction: string; confidence: number; reason: string }
}) {
  return (
    <div className="kt-card-pad" style={{
      borderLeft: `3px solid ${data.direction === 'bullish' ? 'var(--kt-up)' : data.direction === 'bearish' ? 'var(--kt-dn)' : 'var(--kt-muted)'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 'var(--sm)' }}>{symbol}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <DirectionIcon direction={data.direction} />
          <span style={{
            fontSize: 'var(--xs)', fontWeight: 600, textTransform: 'uppercase',
            color: data.direction === 'bullish' ? 'var(--kt-up)' : data.direction === 'bearish' ? 'var(--kt-dn)' : 'var(--kt-muted)',
          }}>
            {data.direction}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>Confidence</span>
        <span style={{ fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{data.confidence}%</span>
      </div>
      <div style={{ height: 4, background: 'var(--kt-bg2)', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
        <div style={{
          width: `${data.confidence}%`, height: '100%',
          background: data.confidence >= 60 ? 'var(--kt-up)' : 'var(--kt-gold)',
          borderRadius: 2,
        }} />
      </div>
      <p style={{ fontSize: 'var(--xs)', color: 'var(--kt-text2)', margin: 0, lineHeight: 1.4 }}>{data.reason}</p>
    </div>
  )
}

function SessionCard({ sessionKey, report, onRefresh, isRefreshing }: {
  sessionKey: string
  report: SessionReportData | null
  onRefresh: () => void
  isRefreshing: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const sessionDef = SESSIONS.find(s => s.key === sessionKey) ?? SESSIONS[0]

  if (!report) {
    return (
      <div className="kt-panel kt-card-pad" style={{ minHeight: 200, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div>
              <span className="kt-kicker" style={{ marginBottom: 0 }}>{sessionDef.label.toUpperCase()}</span>
              <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', marginLeft: 8, fontFamily: 'var(--font-mono)' }}>
                {sessionDef.time}
              </span>
            </div>
          </div>
          <p style={{ color: 'var(--kt-muted)', fontSize: 'var(--sm)', textAlign: 'center', padding: '24px 0' }}>
            No report generated yet
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 6,
            background: 'var(--kt-bg2)', border: '1px solid var(--kt-border)',
            color: 'var(--kt-text)', fontSize: 'var(--xs)', fontWeight: 600,
            cursor: isRefreshing ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <RefreshCw size={12} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
          {isRefreshing ? 'Generating…' : 'Generate Report'}
        </button>
      </div>
    )
  }

  const { analysis, narrative, status, confidence, snapshot } = report
  const biases = Object.entries(analysis.bias)

  return (
    <div className="kt-panel" style={{ borderLeft: `3px solid ${sessionDef.color}` }}>
      {/* Header */}
      <div className="kt-panel-head" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="kt-kicker" style={{ marginBottom: 0, color: sessionDef.color }}>
            {sessionDef.label.toUpperCase()}
          </span>
          <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>
            {sessionDef.time}
          </span>
          <StatusBadge status={status} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>
            {formatTime(report.generatedAt)}
          </span>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            style={{
              padding: '4px 10px', borderRadius: 4,
              background: 'var(--kt-bg2)', border: '1px solid var(--kt-border)',
              color: 'var(--kt-text)', fontSize: 'var(--xs)', fontWeight: 600,
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <RefreshCw size={11} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      <div className="kt-panel-body">
        {/* Confidence + Tags */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>Confidence</span>
          </div>
          <ConfidenceBar value={confidence} />
        </div>

        {/* Tags */}
        {narrative.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
            {narrative.tags.map((tag, i) => (
              <span key={i} style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 'var(--xs)',
                fontWeight: 600, background: 'var(--kt-bg2)', color: 'var(--kt-gold)',
                fontFamily: 'var(--font-mono)',
              }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Regime + USD + Risk */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div className="kt-card-pad" style={{ padding: '8px 10px' }}>
            <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', display: 'block', marginBottom: 2 }}>Regime</span>
            <span style={{ fontSize: 'var(--sm)', fontWeight: 700, color: analysis.regime === 'volatile' ? 'var(--kt-dn)' : analysis.regime === 'risk_off' ? 'var(--kt-gold)' : 'var(--kt-text)' }}>
              {REGIME_LABELS[analysis.regime]}
            </span>
            <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-text2)', display: 'block', marginTop: 2 }}>
              {analysis.regimeReason}
            </span>
          </div>
          <div className="kt-card-pad" style={{ padding: '8px 10px' }}>
            <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', display: 'block', marginBottom: 2 }}>USD Strength</span>
            <span style={{
              fontSize: 'var(--sm)', fontWeight: 700,
              color: analysis.usdStrength === 'strong' ? 'var(--kt-up)' : analysis.usdStrength === 'weak' ? 'var(--kt-dn)' : 'var(--kt-text)',
            }}>
              {analysis.usdStrength.toUpperCase()}
            </span>
            <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-text2)', display: 'block', marginTop: 2 }}>
              {analysis.usdStrengthReason}
            </span>
          </div>
          <div className="kt-card-pad" style={{ padding: '8px 10px' }}>
            <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', display: 'block', marginBottom: 2 }}>Risk Level</span>
            <span style={{
              fontSize: 'var(--sm)', fontWeight: 700,
              color: RISK_COLORS[analysis.riskLabel],
            }}>
              {analysis.riskLabel}
            </span>
            <div style={{ marginTop: 4 }}>
              {analysis.riskFactors.slice(0, 2).map((f, i) => (
                <span key={i} style={{ fontSize: 'var(--xs)', color: 'var(--kt-text2)', display: 'block' }}>
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div style={{
          padding: '10px 12px', background: 'var(--kt-bg2)', borderRadius: 6,
          marginBottom: 12, fontSize: 'var(--sm)', color: 'var(--kt-text)', lineHeight: 1.6,
        }}>
          {narrative.summary}
        </div>

        {/* Asset Biases */}
        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
            Asset Bias
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {biases.map(([symbol, data]) => (
              <AssetMiniCard key={symbol} symbol={symbol.toUpperCase()} data={data} />
            ))}
          </div>
        </div>

        {/* Key Levels */}
        {analysis.keyLevels.xauusd.support != null || analysis.keyLevels.xauusd.resistance != null ? (
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
              Key Levels — XAU/USD
            </span>
            <div style={{ display: 'flex', gap: 12 }}>
              {analysis.keyLevels.xauusd.support != null && (
                <div className="kt-stat">
                  <div className="kt-stat-label">Support (EMA50)</div>
                  <div className="kt-stat-value" style={{ color: 'var(--kt-up)' }}>{analysis.keyLevels.xauusd.support.toFixed(2)}</div>
                </div>
              )}
              {analysis.keyLevels.xauusd.resistance != null && (
                <div className="kt-stat">
                  <div className="kt-stat-label">Resistance (EMA20)</div>
                  <div className="kt-stat-value" style={{ color: 'var(--kt-dn)' }}>{analysis.keyLevels.xauusd.resistance.toFixed(2)}</div>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Calendar Callouts */}
        {narrative.calendarCallouts.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
              Calendar Events
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {narrative.calendarCallouts.map((callout, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', background: 'var(--kt-bg2)', borderRadius: 4,
                  fontSize: 'var(--xs)', color: 'var(--kt-text)',
                }}>
                  <AlertTriangle size={12} style={{ color: 'var(--kt-gold)', flexShrink: 0 }} />
                  {callout}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expand for full report */}
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            width: '100%', padding: '8px', borderRadius: 6,
            background: 'transparent', border: '1px solid var(--kt-border)',
            color: 'var(--kt-muted)', fontSize: 'var(--xs)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? 'Hide Details' : 'View Full Report'}
        </button>

        {expanded && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Per-Asset Narrative */}
            {Object.keys(narrative.perAssetNotes).length > 0 && (
              <div>
                <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
                  Detailed Analysis
                </span>
                {Object.entries(narrative.perAssetNotes).map(([symbol, note]) => (
                  <div key={symbol} style={{
                    padding: '8px 12px', marginBottom: 4,
                    background: 'var(--kt-bg2)', borderRadius: 4,
                    fontSize: 'var(--xs)', color: 'var(--kt-text)', lineHeight: 1.5,
                  }}>
                    <strong>{symbol}:</strong> {note}
                  </div>
                ))}
              </div>
            )}

            {/* Snapshot Data */}
            <div>
              <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
                Data Snapshot
              </span>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--kt-border)', color: 'var(--kt-muted)' }}>
                      <th style={{ textAlign: 'left', padding: '4px 8px' }}>Field</th>
                      <th style={{ textAlign: 'right', padding: '4px 8px' }}>Value</th>
                      <th style={{ textAlign: 'right', padding: '4px 8px' }}>Source</th>
                      <th style={{ textAlign: 'right', padding: '4px 8px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'DXY', field: snapshot.dxy },
                      { label: 'XAU/USD', field: snapshot.xauusd },
                      { label: 'EUR/USD', field: snapshot.eurusd },
                      { label: 'GBP/USD', field: snapshot.gbpusd },
                      { label: 'USD/JPY', field: snapshot.usdjpy },
                      { label: '10Y Yield', field: snapshot.yield10y },
                      { label: '2Y Yield', field: snapshot.yield2y },
                      { label: '2Y-10Y Spread', field: snapshot.spread2y10y },
                    ].map(({ label, field }) => (
                      <tr key={label} style={{ borderBottom: '1px solid var(--kt-border)' }}>
                        <td style={{ padding: '4px 8px', color: 'var(--kt-text)' }}>{label}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--kt-text)', fontWeight: 600 }}>
                          {field.value != null ? String(field.value) : '—'}
                        </td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--kt-muted)' }}>{field.source}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                          <StatusBadge status={field.status.toUpperCase()} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Calendar Events in Session */}
            {snapshot.calendarEvents.length > 0 && (
              <div>
                <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
                  Session Calendar Events ({snapshot.calendarEvents.length})
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {snapshot.calendarEvents.slice(0, 10).map((ev, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px', background: 'var(--kt-bg2)', borderRadius: 4,
                      fontSize: 'var(--xs)',
                    }}>
                      <span style={{
                        padding: '1px 6px', borderRadius: 3, fontWeight: 700,
                        fontSize: '10px',
                        background: ev.impact === 'high' ? 'rgba(239,68,68,.2)' : ev.impact === 'medium' ? 'rgba(245,158,11,.2)' : 'rgba(148,163,184,.15)',
                        color: ev.impact === 'high' ? '#f87171' : ev.impact === 'medium' ? '#f59e0b' : 'var(--kt-muted)',
                      }}>
                        {ev.impact.toUpperCase()}
                      </span>
                      <span style={{ color: 'var(--kt-gold)', fontWeight: 600 }}>{ev.currency}</span>
                      <span style={{ color: 'var(--kt-text)', flex: 1 }}>{ev.title}</span>
                      <span style={{ color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>
                        {ev.forecast ?? '—'} / {ev.previous ?? '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sources */}
            <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
              <strong>Sources:</strong> {report.sources.join(', ')}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────

export default function SessionReport() {
  const queryClient = useQueryClient()

  const { data: reports, isLoading } = useQuery<Record<string, SessionReportData | null>>({
    queryKey: ['session-reports'],
    queryFn: async () => {
      const results = await Promise.allSettled(
        SESSIONS.map(s => api<SessionReportData | null>(`/api/session/report?session=${s.key}`).catch(() => null))
      )
      const map: Record<string, SessionReportData | null> = {}
      SESSIONS.forEach((s, i) => {
        const r = results[i]
        map[s.key] = r.status === 'fulfilled' ? r.value : null
      })
      return map
    },
    refetchInterval: 300_000,
    staleTime: 180_000,
  })

  const refreshMutation = useMutation({
    mutationFn: async (session: string) => {
      return api<SessionReportData>(`/api/session/report/refresh?session=${session}`, { method: 'POST' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-reports'] })
    },
  })

  return (
    <div>
      <div className="kt-route-head">
        <div>
          <div className="kt-kicker">MARKET INTELLIGENCE</div>
          <h1>Session Reports</h1>
          <p style={{ color: 'var(--kt-text2)', fontSize: 'var(--sm)' }}>
            Per-session market analysis — Asia, London, New York
          </p>
        </div>
        <div className="kt-route-actions">
          <Clock size={14} />
          <span>Auto-generated at session open</span>
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {SESSIONS.map(s => (
            <div key={s.key} className="kt-panel kt-card-pad" style={{ minHeight: 200 }}>
              <div className="skeleton w-16 h-3 mb-3" />
              <div className="skeleton w-full h-5 mb-2" />
              <div className="skeleton w-3/4 h-5 mb-2" />
              <div className="skeleton w-1/2 h-5" />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {SESSIONS.map(s => (
            <SessionCard
              key={s.key}
              sessionKey={s.key}
              report={reports?.[s.key] ?? null}
              onRefresh={() => refreshMutation.mutate(s.key)}
              isRefreshing={refreshMutation.isPending && refreshMutation.variables === s.key}
            />
          ))}
        </div>
      )}

      {/* Info bar */}
      <div style={{
        marginTop: 16, padding: '10px 16px',
        background: 'var(--kt-bg2)', borderRadius: 8,
        display: 'flex', alignItems: 'center', gap: 10,
        fontSize: 'var(--xs)', color: 'var(--kt-muted)',
      }}>
        <Shield size={14} />
        <span>
          Reports are generated deterministically from live market data. LLM narrates only — all numbers come from the data pipeline.
        </span>
      </div>
    </div>
  )
}
