import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Search, Filter, TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface ScreenerSetup {
  symbol: string
  grade: string
  bias: string
  confidence: number
  signals: string[]
  price: number
  change: number
}

interface ScreenerData {
  setups: ScreenerSetup[]
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

export default function Scanner() {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedStock, setExpandedStock] = useState<string | null>(null)
  const [gradeFilter, setGradeFilter] = useState<string | null>(null)
  const [biasFilter, setBiasFilter] = useState<string | null>(null)

  const { data, isLoading, error, refetch, isFetching } = useQuery<ScreenerData>({
    queryKey: ['smc-screener'],
    queryFn: () => api('/api/smc/screener'),
    staleTime: 120_000,
  })

  const setups = data?.setups ?? []
  const filtered = setups.filter(s => {
    if (searchQuery && !s.symbol.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (gradeFilter && s.grade !== gradeFilter) return false
    if (biasFilter && s.bias !== biasFilter) return false
    return true
  })

  return (
    <div>
      <div className="kt-route-head">
        <div>
          <div className="kt-kicker">Forex Scanner</div>
          <h1>Scanner</h1>
          <p>SMC-based grading and trade candidate screening for forex pairs</p>
        </div>
        <div className="kt-route-actions">
          <span className="kt-pill">{filtered.length} pairs</span>
          <button className="kt-btn kt-btn-primary" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'Scanning...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="kt-card" style={{ marginBottom: 16 }}>
        <div className="kt-card-pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Filter size={13} style={{ color: 'var(--kt-gold)' }} />
            <span className="kt-stat-label" style={{ margin: 0 }}>Filters</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)' }}>Grade:</span>
              {['A+', 'A', 'B', 'C', 'D'].map(g => (
                <button
                  key={g}
                  className={`kt-tag ${gradeFilter === g ? 'gold' : ''}`}
                  onClick={() => setGradeFilter(gradeFilter === g ? null : g)}
                  style={{ cursor: 'pointer' }}
                >
                  {g}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)' }}>Bias:</span>
              {['bullish', 'bearish', 'neutral'].map(b => (
                <button
                  key={b}
                  className={`kt-tag ${biasFilter === b ? 'gold' : ''}`}
                  onClick={() => setBiasFilter(biasFilter === b ? null : b)}
                  style={{ cursor: 'pointer' }}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--kt-dim)' }} />
        <input
          className="kt-input"
          style={{ width: '100%', paddingLeft: 34 }}
          placeholder="Search by symbol (e.g. EUR/USD)..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="kt-card">
        {isLoading ? (
          <div className="kt-card-pad">
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--kt-border-soft)' }}>
                {[...Array(6)].map((_, j) => <div key={j} className="skeleton h-4 w-full" />)}
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="kt-card-pad" style={{ textAlign: 'center', padding: '32px 16px' }}>
            <p style={{ color: 'var(--kt-dn)', fontSize: 'var(--sm)' }}>Failed to load screener data</p>
          </div>
        ) : (
          <table className="kt-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Price</th>
                <th>Change</th>
                <th>Grade</th>
                <th>Bias</th>
                <th>Signals</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--kt-muted)', padding: 24 }}>No setups found</td></tr>
              )}
              {filtered.map(setup => {
                const isExpanded = expandedStock === setup.symbol
                const isUp = setup.change >= 0
                return (
                  <React.Fragment key={setup.symbol}>
                    <tr
                      onClick={() => setExpandedStock(isExpanded ? null : setup.symbol)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <span className="mono" style={{ color: 'var(--kt-text)', fontWeight: 600 }}>{setup.symbol}</span>
                      </td>
                      <td className="mono" style={{ color: 'var(--kt-text)' }}>{setup.price?.toFixed(setup.symbol.includes('JPY') ? 3 : 5)}</td>
                      <td className={`mono ${isUp ? 'up' : 'dn'}`}>{isUp ? '+' : ''}{setup.change?.toFixed(2)}%</td>
                      <td><GradeBadge grade={setup.grade} /></td>
                      <td><BiasBadge bias={setup.bias} /></td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {setup.signals?.slice(0, 3).map(s => (
                            <span key={s} className="kt-tag" style={{ fontSize: '9px', padding: '2px 6px' }}>{s}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${setup.symbol}-expanded`}>
                        <td colSpan={6} style={{ padding: '12px 14px', background: 'var(--kt-bg1)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span className="kt-stat-label">All Signals</span>
                            <span className="mono" style={{ fontSize: 'var(--sm)', color: 'var(--kt-gold)' }}>Confidence: {setup.confidence}%</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {setup.signals?.map(s => (
                              <span key={s} className="kt-tag" style={{ fontSize: '9px' }}>{s}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
