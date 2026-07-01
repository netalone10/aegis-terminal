import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Clock, RefreshCw, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react'
import { api } from '../../lib/api'

const SESSIONS = [
  { key: 'asia', label: 'Asia', time: '07:00–11:00 WIB', color: '#60a5fa' },
  { key: 'london', label: 'London', time: '13:00–16:00 WIB', color: '#f59e0b' },
  { key: 'ny', label: 'New York', time: '19:30–03:00 WIB', color: '#a78bfa' },
] as const

type SessionKey = 'asia' | 'london' | 'ny'

interface ReportData {
  session: string
  narrative?: string
  timestamp?: string
  meta?: {
    price?: number
    atr?: number
    rsi?: number
    trend?: string
    ema20?: number
    ema50?: number
    sentiment?: string
  }
  [key: string]: any
}

function relativeTime(iso?: string): string {
  if (!iso) return 'Unknown'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="kt-stat">
      <div className="kt-stat-label">{label}</div>
      <div className="kt-stat-value" style={color ? { color } : undefined}>{value}</div>
    </div>
  )
}

function NarrativeBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const limit = 500
  const isLong = text.length > limit
  const display = expanded || !isLong ? text : text.slice(0, limit)

  return (
    <div style={{
      padding: '12px 16px',
      background: 'var(--kt-bg2)',
      borderRadius: 8,
      fontSize: 'var(--sm)',
      color: 'var(--kt-text)',
      lineHeight: 1.7,
      whiteSpace: 'pre-wrap',
    }}>
      {display}
      {isLong && !expanded && '…'}
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            display: 'block', marginTop: 8,
            background: 'none', border: 'none',
            color: 'var(--kt-gold)', fontSize: 'var(--xs)',
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          {expanded ? 'Sembunyikan' : 'Baca selengkapnya'}
        </button>
      )}
    </div>
  )
}

function ReportCard({ data, onRefresh, isRefreshing }: {
  data: ReportData | null
  onRefresh: () => void
  isRefreshing: boolean
}) {
  if (!data) {
    return (
      <div className="kt-panel kt-card-pad" style={{ minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--kt-muted)', fontSize: 'var(--sm)' }}>No report data</p>
      </div>
    )
  }

  const meta = data.meta ?? {}
  const sentiment = meta.sentiment ?? 'neutral'
  const sentimentColor = sentiment === 'bullish' ? 'var(--kt-up)' : sentiment === 'bearish' ? 'var(--kt-dn)' : 'var(--kt-muted)'

  return (
    <div className="kt-panel">
      <div className="kt-panel-head" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 'var(--xs)', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.05em', color: 'var(--kt-gold)',
          }}>
            {data.session}
          </span>
          <span style={{
            padding: '2px 8px', borderRadius: 4, fontSize: '10px',
            background: 'rgba(34,197,94,.15)', color: '#22c55e',
            fontWeight: 700, fontFamily: 'var(--font-mono)',
          }}>
            Auto-generated
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>
            {relativeTime(data.timestamp)}
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
        {data.narrative ? (
          <NarrativeBlock text={data.narrative} />
        ) : (
          <div style={{
            padding: '12px 16px', background: 'var(--kt-bg2)', borderRadius: 8,
            fontSize: 'var(--sm)', color: 'var(--kt-muted)', textAlign: 'center',
          }}>
            Narrative not available for this session
          </div>
        )}

        <div className="kt-stat-grid kt-stat-grid-4" style={{ marginTop: 16 }}>
          <StatCard label="Price" value={meta.price != null ? meta.price.toFixed(2) : '—'} />
          <StatCard label="ATR" value={meta.atr != null ? meta.atr.toFixed(2) : '—'} />
          <StatCard label="RSI" value={meta.rsi != null ? meta.rsi.toFixed(1) : '—'} />
          <StatCard label="Sentiment" value={sentiment.toUpperCase()} color={sentimentColor} />
        </div>

        {(meta.trend || meta.ema20 || meta.ema50) && (
          <div className="kt-stat-grid kt-stat-grid-3" style={{ marginTop: 8 }}>
            <StatCard label="Trend" value={meta.trend ?? '—'} />
            <StatCard label="EMA 20" value={meta.ema20 != null ? meta.ema20.toFixed(2) : '—'} />
            <StatCard label="EMA 50" value={meta.ema50 != null ? meta.ema50.toFixed(2) : '—'} />
          </div>
        )}
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="kt-panel kt-card-pad" style={{ minHeight: 300 }}>
      <div className="skeleton w-32 h-4 mb-3" />
      <div className="skeleton w-full h-5 mb-2" />
      <div className="skeleton w-full h-5 mb-2" />
      <div className="skeleton w-3/4 h-5 mb-4" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 16 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton w-full h-16" style={{ borderRadius: 8 }} />
        ))}
      </div>
    </div>
  )
}

export default function ReportArchive() {
  const [activeTab, setActiveTab] = useState<SessionKey>('asia')

  const { data, isLoading, error, refetch, isFetching } = useQuery<ReportData>({
    queryKey: ['archive-report', activeTab],
    queryFn: () => api<ReportData>(`/api/session/report?session=${activeTab}`),
    enabled: true,
    staleTime: 300_000,
  })

  return (
    <div>
      <div className="kt-route-head">
        <div>
          <div className="kt-kicker">SESSION ARCHIVE</div>
          <h1>Report Archive</h1>
          <p style={{ color: 'var(--kt-text2)', fontSize: 'var(--sm)' }}>
            Seluruh laporan sesi tersimpan. Baca kapan saja.
          </p>
        </div>
        <div className="kt-route-actions">
          <span style={{
            padding: '4px 10px', borderRadius: 4,
            background: 'rgba(34,197,94,.15)', color: '#22c55e',
            fontSize: 'var(--xs)', fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
            Real-time Generated
          </span>
        </div>
      </div>

      {/* Session Tabs */}
      <div style={{
        display: 'flex', gap: 4, padding: 4,
        background: 'var(--kt-bg2)', borderRadius: 8,
        marginBottom: 16, width: 'fit-content',
      }}>
        {SESSIONS.map(s => (
          <button
            key={s.key}
            onClick={() => setActiveTab(s.key)}
            style={{
              padding: '8px 20px', borderRadius: 6,
              background: activeTab === s.key ? 'var(--kt-bg1)' : 'transparent',
              border: activeTab === s.key ? '1px solid var(--kt-border)' : '1px solid transparent',
              color: activeTab === s.key ? 'var(--kt-gold)' : 'var(--kt-muted)',
              fontSize: 'var(--sm)', fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s',
              boxShadow: activeTab === s.key ? '0 1px 3px rgba(0,0,0,.3)' : 'none',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: s.color,
            }} />
            {s.label}
          </button>
        ))}
      </div>

      {/* Report Display */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : error ? (
        <div className="kt-panel kt-card-pad" style={{
          minHeight: 200, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <AlertCircle size={24} style={{ color: 'var(--kt-dn)' }} />
          <p style={{ color: 'var(--kt-dn)', fontSize: 'var(--sm)' }}>Failed to load report</p>
          <button
            onClick={() => refetch()}
            style={{
              padding: '6px 16px', borderRadius: 6,
              background: 'var(--kt-bg2)', border: '1px solid var(--kt-border)',
              color: 'var(--kt-text)', fontSize: 'var(--xs)', fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      ) : (
        <ReportCard
          data={data ?? null}
          onRefresh={() => refetch()}
          isRefreshing={isFetching}
        />
      )}

      {/* Quick Actions */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 16, padding: '12px 16px',
        background: 'var(--kt-bg2)', borderRadius: 8,
        flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            style={{
              padding: '8px 16px', borderRadius: 6,
              background: 'var(--kt-gold)', border: 'none',
              color: '#000', fontSize: 'var(--xs)', fontWeight: 700,
              cursor: isFetching ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <RefreshCw size={12} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
            Generate Fresh Report
          </button>
          <a
            href="/session-report"
            style={{
              padding: '8px 16px', borderRadius: 6,
              background: 'transparent', border: '1px solid var(--kt-border)',
              color: 'var(--kt-text)', fontSize: 'var(--xs)', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
              textDecoration: 'none',
            }}
          >
            <ExternalLink size={12} />
            View in Terminal
          </a>
        </div>
        <span style={{
          fontSize: 'var(--xs)', color: 'var(--kt-muted)',
          fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <Clock size={12} />
          Last updated: {relativeTime(data?.timestamp)}
        </span>
      </div>

      {/* Report History */}
      <div style={{ marginTop: 16 }}>
        <span style={{
          fontSize: 'var(--xs)', color: 'var(--kt-muted)',
          fontWeight: 600, letterSpacing: '0.05em',
          textTransform: 'uppercase', marginBottom: 8, display: 'block',
        }}>
          Session Status
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {SESSIONS.map(s => (
            <div key={s.key} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', background: 'var(--kt-bg2)', borderRadius: 6,
            }}>
              <CheckCircle size={14} style={{ color: '#22c55e', flexShrink: 0 }} />
              <span style={{ fontSize: 'var(--sm)', fontWeight: 600, color: s.color }}>
                {s.label}
              </span>
              <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
                Report available
              </span>
              <span style={{
                marginLeft: 'auto', fontSize: 'var(--xs)',
                color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)',
              }}>
                {s.time}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
