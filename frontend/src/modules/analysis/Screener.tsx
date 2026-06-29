import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ScanLine, TrendingUp, TrendingDown, Minus, Target, Shield, Clock, RefreshCw } from 'lucide-react'

interface ScreenerEntry {
  symbol: string
  tf: string
  bias: string
  confidence: number
  grade: string
  gradeLabel: string
  score: number
  entryReason: string
  rr: number | null
  premiumDiscount: string
  killZone: string
  signals: string[]
  keyLevels: any[]
  tradeSetup: any
  structure: any
  meta: any
}

interface ScreenerData {
  results: ScreenerEntry[]
  best_setup: ScreenerEntry | null
  scanned_at: string
  total_scanned: number
}

const GRADE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  'A+': { bg: 'rgba(255,215,0,.15)', color: 'var(--kt-gold)', border: 'rgba(255,215,0,.35)' },
  'A': { bg: 'rgba(70,201,127,.12)', color: 'var(--kt-up)', border: 'rgba(70,201,127,.3)' },
  'B': { bg: 'rgba(0,200,255,.1)', color: '#00c8ff', border: 'rgba(0,200,255,.25)' },
  'C': { bg: 'rgba(255,170,0,.1)', color: '#ffaa00', border: 'rgba(255,170,0,.25)' },
  'D': { bg: 'rgba(128,128,128,.1)', color: 'var(--kt-muted)', border: 'rgba(128,128,128,.2)' },
}

function GradeBadge({ grade }: { grade: string }) {
  const c = GRADE_COLORS[grade] ?? GRADE_COLORS['D']
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 42, height: 26, borderRadius: 6,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      fontWeight: 800, fontSize: 13, fontFamily: 'var(--font-mono)',
      letterSpacing: '.5px',
    }}>
      {grade}
    </span>
  )
}

function BiasBadge({ bias }: { bias: string }) {
  if (bias === 'bullish') return <span className="badge-bull" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><TrendingUp size={12} /> BULL</span>
  if (bias === 'bearish') return <span className="badge-bear" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><TrendingDown size={12} /> BEAR</span>
  return <span className="badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Minus size={12} /> FLAT</span>
}

function BestSetupCard({ setup }: { setup: ScreenerEntry }) {
  const c = GRADE_COLORS[setup.grade] ?? GRADE_COLORS['D']
  return (
    <div className="kt-card" style={{
      border: `1px solid ${c.border}`,
      background: `linear-gradient(135deg, ${c.bg}, transparent)`,
      marginBottom: 20,
    }}>
      <div className="kt-card-pad" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Target size={16} style={{ color: c.color }} />
          <span className="kt-kicker" style={{ color: c.color, margin: 0, letterSpacing: '1.5px' }}>BEST SETUP</span>
          <GradeBadge grade={setup.grade} />
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--kt-text)' }}>
            {setup.symbol}
          </span>
          <span style={{
            fontSize: 13, fontFamily: 'var(--font-mono)',
            background: 'var(--kt-bg1)', padding: '3px 10px', borderRadius: 4,
            color: 'var(--kt-text2)', border: '1px solid var(--kt-border)',
          }}>
            {setup.tf}
          </span>
          <BiasBadge bias={setup.bias} />
          {setup.premiumDiscount !== 'equilibrium' && (
            <span style={{
              fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
              color: setup.premiumDiscount === 'discount' ? 'var(--kt-up)' : 'var(--kt-dn)',
              background: setup.premiumDiscount === 'discount' ? 'var(--kt-upf)' : 'var(--kt-dnf)',
              padding: '2px 8px', borderRadius: 4,
            }}>
              {setup.premiumDiscount}
            </span>
          )}
          {setup.killZone !== 'none' && (
            <span style={{
              fontSize: 11, fontFamily: 'var(--font-mono)',
              color: 'var(--kt-gold)', background: 'var(--kt-goldf)',
              padding: '2px 8px', borderRadius: 4,
            }}>
              <Clock size={10} style={{ verticalAlign: -1, marginRight: 3 }} />
              {setup.killZone.replace('_', ' ').toUpperCase()}
            </span>
          )}
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12, marginBottom: 16,
        }}>
          <div className="kt-stat">
            <span className="kt-stat-label">Confidence</span>
            <span className="kt-stat-value" style={{ color: setup.confidence >= 70 ? 'var(--kt-up)' : setup.confidence >= 50 ? 'var(--kt-text)' : 'var(--kt-dn)' }}>
              {setup.confidence}%
            </span>
          </div>
          <div className="kt-stat">
            <span className="kt-stat-label">Score</span>
            <span className="kt-stat-value" style={{ color: c.color }}>{setup.score}/100</span>
          </div>
          <div className="kt-stat">
            <span className="kt-stat-label">R:R</span>
            <span className="kt-stat-value mono">
              {setup.rr !== null ? `${setup.rr.toFixed(1)}x` : '—'}
            </span>
          </div>
          <div className="kt-stat">
            <span className="kt-stat-label">RSI</span>
            <span className="kt-stat-value mono">{setup.meta?.rsi?.toFixed(0) ?? '—'}</span>
          </div>
        </div>

        {setup.tradeSetup && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 10, padding: '12px 14px', background: 'var(--kt-bg1)',
            borderRadius: 8, border: '1px solid var(--kt-border)', marginBottom: 14,
          }}>
            <div>
              <div className="kt-stat-label" style={{ marginBottom: 2 }}>Entry</div>
              <div className="mono" style={{ color: 'var(--kt-text)', fontWeight: 600, fontSize: 13 }}>{setup.tradeSetup.entry?.toFixed(4) ?? '—'}</div>
            </div>
            <div>
              <div className="kt-stat-label" style={{ marginBottom: 2 }}>Stop Loss</div>
              <div className="mono" style={{ color: 'var(--kt-dn)', fontWeight: 600, fontSize: 13 }}>{setup.tradeSetup.sl?.toFixed(4) ?? '—'}</div>
            </div>
            <div>
              <div className="kt-stat-label" style={{ marginBottom: 2 }}>TP1</div>
              <div className="mono" style={{ color: 'var(--kt-up)', fontWeight: 600, fontSize: 13 }}>{setup.tradeSetup.tp1?.toFixed(4) ?? '—'}</div>
            </div>
            <div>
              <div className="kt-stat-label" style={{ marginBottom: 2 }}>TP2</div>
              <div className="mono" style={{ color: 'var(--kt-up)', fontWeight: 600, fontSize: 13 }}>{setup.tradeSetup.tp2?.toFixed(4) ?? '—'}</div>
            </div>
            <div>
              <div className="kt-stat-label" style={{ marginBottom: 2 }}>TP3</div>
              <div className="mono" style={{ color: 'var(--kt-up)', fontWeight: 600, fontSize: 13 }}>{setup.tradeSetup.tp3?.toFixed(4) ?? '—'}</div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {setup.signals?.slice(0, 5).map((s: string, i: number) => (
            <span key={i} className="kt-tag" style={{ fontSize: 10, padding: '2px 8px' }}>{s}</span>
          ))}
        </div>
      </div>
    </div>
  )
}


export default function Screener() {
  const [filter, setFilter] = useState<'all' | 'ap' | 'a' | 'b'>('all')
  const [sortCol, setSortCol] = useState<'score' | 'symbol' | 'tf' | 'confidence' | 'rr'>('score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const { data, isLoading, error, refetch, isFetching } = useQuery<ScreenerData>({
    queryKey: ['smc-screener'],
    queryFn: () => api('/api/smc/screener'),
    refetchInterval: 120_000,
    staleTime: 120_000,
  })

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  let results = data?.results ?? []

  // Filter
  if (filter === 'ap') results = results.filter(r => r.grade === 'A+')
  else if (filter === 'a') results = results.filter(r => r.grade === 'A+' || r.grade === 'A')
  else if (filter === 'b') results = results.filter(r => r.score >= 60)

  // Sort
  const sorted = [...results].sort((a, b) => {
    let va: any, vb: any
    if (sortCol === 'score') { va = a.score; vb = b.score }
    else if (sortCol === 'symbol') { va = a.symbol; vb = b.symbol }
    else if (sortCol === 'tf') { va = a.tf; vb = b.tf }
    else if (sortCol === 'confidence') { va = a.confidence; vb = b.confidence }
    else { va = a.rr ?? 0; vb = b.rr ?? 0 }
    if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    return sortDir === 'asc' ? va - vb : vb - va
  })

  const filters: Array<{ key: typeof filter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'ap', label: 'A+ Only' },
    { key: 'a', label: 'A+ & A' },
    { key: 'b', label: 'B+ & Above' },
  ]

  const SortIcon = ({ col }: { col: typeof sortCol }) => {
    if (sortCol !== col) return <span style={{ color: 'var(--kt-muted)', fontSize: 10 }}> ↕</span>
    return <span style={{ color: 'var(--kt-gold)', fontSize: 10 }}>{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ScanLine size={18} style={{ color: 'var(--kt-gold)' }} />
          <div>
            <span className="kt-kicker" style={{ margin: 0 }}>SMC SETUP SCREENER</span>
            {data?.scanned_at && (
              <span style={{ color: 'var(--kt-muted)', fontSize: 11, marginLeft: 10, fontFamily: 'var(--font-mono)' }}>
                {data.total_scanned} combos scanned · {new Date(data.scanned_at).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        <button
          className="kt-tag"
          onClick={() => refetch()}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, opacity: isFetching ? .5 : 1 }}
          disabled={isFetching}
        >
          <RefreshCw size={12} className={isFetching ? 'spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="kt-card" style={{ textAlign: 'center', padding: 40 }}>
          <div className="kt-kicker">SCANNING MARKETS…</div>
          <p style={{ color: 'var(--kt-muted)', marginTop: 8 }}>Running SMC analysis across 6 pairs × 3 timeframes</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="kt-card" style={{ borderColor: 'rgba(255,77,77,.3)', padding: 20 }}>
          <span style={{ color: 'var(--kt-dn)' }}>Failed to load screener data. Try refreshing.</span>
        </div>
      )}

      {/* Best Setup */}
      {data?.best_setup && !isLoading && (
        <BestSetupCard setup={data.best_setup} />
      )}

      {/* Filters */}
      {!isLoading && data && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <Shield size={13} style={{ color: 'var(--kt-muted)', marginRight: 4 }} />
          {filters.map(f => (
            <button
              key={f.key}
              className={`kt-tag ${filter === f.key ? 'gold' : ''}`}
              onClick={() => setFilter(f.key)}
              style={{
                cursor: 'pointer',
                background: filter === f.key ? 'var(--kt-goldf)' : 'transparent',
                transition: 'all .15s',
              }}
            >
              {f.label}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', color: 'var(--kt-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            {sorted.length} setups
          </span>
        </div>
      )}

      {/* Table */}
      {!isLoading && sorted.length > 0 && (
        <div className="kt-card" style={{ overflow: 'auto' }}>
          <table className="kt-table">
            <thead>
              <tr>
                <th onClick={() => toggleSort('score')} style={{ cursor: 'pointer' }}>Grade<SortIcon col="score" /></th>
                <th onClick={() => toggleSort('symbol')} style={{ cursor: 'pointer' }}>Symbol<SortIcon col="symbol" /></th>
                <th onClick={() => toggleSort('tf')} style={{ cursor: 'pointer' }}>TF<SortIcon col="tf" /></th>
                <th>Bias</th>
                <th onClick={() => toggleSort('confidence')} style={{ cursor: 'pointer' }}>Conf<SortIcon col="confidence" /></th>
                <th>Entry Reason</th>
                <th onClick={() => toggleSort('rr')} style={{ cursor: 'pointer' }}>R:R<SortIcon col="rr" /></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={`${r.symbol}-${r.tf}-${i}`}>
                  <td><GradeBadge grade={r.grade} /></td>
                  <td>
                    <span className="mono" style={{ color: 'var(--kt-text)', fontWeight: 600 }}>{r.symbol}</span>
                  </td>
                  <td>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 12,
                      background: 'var(--kt-bg1)', padding: '2px 8px', borderRadius: 4,
                      border: '1px solid var(--kt-border)',
                    }}>
                      {r.tf}
                    </span>
                  </td>
                  <td><BiasBadge bias={r.bias} /></td>
                  <td className="mono" style={{
                    color: r.confidence >= 70 ? 'var(--kt-up)' : r.confidence >= 50 ? 'var(--kt-text)' : 'var(--kt-dn)',
                    fontWeight: 600,
                  }}>
                    {r.confidence}%
                  </td>
                  <td style={{ maxWidth: 280 }}>
                    <span style={{ color: 'var(--kt-text2)', fontSize: 12 }}>{r.entryReason}</span>
                  </td>
                  <td className="mono" style={{
                    color: (r.rr ?? 0) >= 2 ? 'var(--kt-up)' : (r.rr ?? 0) >= 1.5 ? 'var(--kt-text)' : 'var(--kt-dn)',
                    fontWeight: 600,
                  }}>
                    {r.rr !== null ? `${r.rr.toFixed(1)}x` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && sorted.length === 0 && data && (
        <div className="kt-card" style={{ textAlign: 'center', padding: 40 }}>
          <ScanLine size={28} style={{ color: 'var(--kt-muted)', marginBottom: 12 }} />
          <div style={{ color: 'var(--kt-text)', fontWeight: 600, marginBottom: 6 }}>No A-grade setups. Wait for confluence.</div>
          <div style={{ color: 'var(--kt-muted)', fontSize: 13 }}>
            {filter !== 'all' ? 'Try clearing the filter to see all setups.' : 'No strong setups detected across all pairs and timeframes.'}
          </div>
        </div>
      )}
    </div>
  )
}
