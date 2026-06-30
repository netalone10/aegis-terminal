import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'


interface Position {
  id: number; symbol: string; direction: 'Long' | 'Short';
  entryPrice: number; currentPrice: number; quantity: number; status: 'Open' | 'Closed';
  pnl: number; pnlPercent: number; openedAt: string; closedAt: string | null;
}

export default function Portfolio() {
  const [filter, setFilter] = useState<'All' | 'Open' | 'Closed'>('All')

  const { data: positions = [], isLoading, error } = useQuery<Position[]>({
    queryKey: ['portfolio-positions'],
    queryFn: () => api('/api/portfolio/positions'),
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  const filtered = filter === 'All' ? positions : positions.filter(p => filter === 'Open' ? p.status === 'Open' : p.status === 'Closed')
  const openCount = positions.filter(p => p.status === 'Open').length
  const closedCount = positions.filter(p => p.status === 'Closed').length
  const totalPnl = positions.reduce((s, p) => s + (p.pnl ?? 0), 0)
  const wins = positions.filter(p => p.status === 'Closed' && (p.pnl ?? 0) > 0).length
  const totalClosed = positions.filter(p => p.status === 'Closed').length
  const winRate = totalClosed > 0 ? Math.round((wins / totalClosed) * 100) : 0
  const maxDrawdown = positions.length > 0 ? Math.min(...positions.map(p => p.pnlPercent ?? 0)) : 0

  const summaryStats = [
    { label: 'Total P&L', value: `${totalPnl >= 0 ? '+' : ''}${totalPnl.toLocaleString()}`, color: totalPnl >= 0 ? 'up' : 'dn' },
    { label: 'Win Rate', value: `${winRate}%`, color: 'gold' },
    { label: 'Open Positions', value: `${openCount}`, color: '' },
    { label: 'Max Drawdown', value: `${maxDrawdown.toFixed(2)}%`, color: 'dn' },
  ]

  return (
    <div>
      <div className="kt-route-head">
        <div>
          <div className="kt-kicker">Portfolio</div>
          <h1>Portfolio Tracker</h1>
          <p>Position tracking, P&L, and risk management overview</p>
        </div>
      </div>

      {/* Summary */}
      <div className="kt-stat-grid kt-stat-grid-4" style={{ marginBottom: 16 }}>
        {summaryStats.map(s => (
          <div key={s.label} className="kt-stat">
            <div className="kt-stat-label">{s.label}</div>
            <div className={`kt-stat-value ${s.color}`} style={{ marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {(['All', 'Open', 'Closed'] as const).map(tab => (
          <button
            key={tab}
            className={`kt-tag ${filter === tab ? 'gold' : ''}`}
            onClick={() => setFilter(tab)}
            style={{ cursor: 'pointer' }}
          >
            {tab} {tab === 'Open' ? `(${openCount})` : tab === 'Closed' ? `(${closedCount})` : ''}
          </button>
        ))}
      </div>

      {/* Positions Table */}
      <div className="kt-card">
        {isLoading ? (
          <div className="kt-card-pad">
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--kt-border-soft)' }}>
                {[...Array(8)].map((_, j) => <div key={j} className="skeleton h-4 w-full" />)}
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="kt-card-pad" style={{ textAlign: 'center', padding: '32px 16px' }}>
            <p style={{ color: 'var(--kt-dn)', fontSize: 'var(--sm)' }}>Failed to load positions</p>
          </div>
        ) : (
          <table className="kt-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Direction</th>
                <th>Entry</th>
                <th>Current</th>
                <th>P&L</th>
                <th>P&L %</th>
                <th>Qty</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--kt-muted)', padding: 24 }}>No positions found</td></tr>
              )}
              {filtered.map(p => {
                const isProfit = (p.pnl ?? 0) >= 0
                return (
                  <tr key={p.id}>
                    <td className="mono" style={{ color: 'var(--kt-text)', fontWeight: 600 }}>{p.symbol}</td>
                    <td>
                      <span className={p.direction === 'Long' ? 'badge-bull' : 'badge-bear'}>
                        {p.direction}
                      </span>
                    </td>
                    <td className="mono">{p.entryPrice?.toLocaleString()}</td>
                    <td className="mono" style={{ color: 'var(--kt-text)' }}>{p.currentPrice?.toLocaleString()}</td>
                    <td className={`mono ${isProfit ? 'up' : 'dn'}`}>
                      {isProfit ? '+' : ''}{(p.pnl ?? 0).toLocaleString()}
                    </td>
                    <td className={`mono ${isProfit ? 'up' : 'dn'}`}>
                      {isProfit ? '+' : ''}{(p.pnlPercent ?? 0).toFixed(2)}%
                    </td>
                    <td className="mono">{p.quantity}</td>
                    <td>
                      <span className={p.status === 'Open' ? 'badge-info' : 'badge-neutral'}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
