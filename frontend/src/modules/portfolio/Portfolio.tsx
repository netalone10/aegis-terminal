import { useState } from 'react'
import { Plus } from 'lucide-react'

interface Position {
  id: number; symbol: string; direction: 'Long' | 'Short';
  entryPrice: number; currentPrice: number; sl: number; tp: number; status: 'Open' | 'Closed';
}

const MOCK_POSITIONS: Position[] = [
  { id: 1, symbol: 'BBCA', direction: 'Long', entryPrice: 9650, currentPrice: 9850, sl: 9400, tp: 10200, status: 'Open' },
  { id: 2, symbol: 'ADRO', direction: 'Long', entryPrice: 2720, currentPrice: 2850, sl: 2600, tp: 3100, status: 'Open' },
  { id: 3, symbol: 'TLKM', direction: 'Short', entryPrice: 2750, currentPrice: 2680, sl: 2900, tp: 2500, status: 'Open' },
  { id: 4, symbol: 'BBRI', direction: 'Long', entryPrice: 4300, currentPrice: 4520, sl: 4100, tp: 4800, status: 'Closed' },
  { id: 5, symbol: 'EXCL', direction: 'Short', entryPrice: 2050, currentPrice: 1920, sl: 2200, tp: 1800, status: 'Closed' },
]

function calcPnL(p: Position) {
  const diff = p.direction === 'Long' ? p.currentPrice - p.entryPrice : p.entryPrice - p.currentPrice
  const pct = (diff / p.entryPrice) * 100
  return { diff, pct }
}

const summaryStats = [
  { label: 'Total P&L', value: '+Rp 1,245,000', color: 'up' },
  { label: 'Win Rate', value: '72%', color: 'gold' },
  { label: 'Posisi Terbuka', value: '3', color: '' },
  { label: 'Max Drawdown', value: '-4.2%', color: 'dn' },
]

export default function Portfolio() {
  const [filter, setFilter] = useState<'Semua' | 'Terbuka' | 'Tertutup'>('Semua')

  const filtered = filter === 'Semua' ? MOCK_POSITIONS : MOCK_POSITIONS.filter(p => filter === 'Terbuka' ? p.status === 'Open' : p.status === 'Closed')
  const openCount = MOCK_POSITIONS.filter(p => p.status === 'Open').length
  const closedCount = MOCK_POSITIONS.filter(p => p.status === 'Closed').length

  return (
    <div>
      <div className="kt-route-head">
        <div>
          <div className="kt-kicker">Portfolio</div>
          <h1>Portfolio Tracker</h1>
          <p>Position tracking, P&L, and risk management overview</p>
        </div>
        <button className="kt-btn kt-btn-primary">
          <Plus size={13} style={{ marginRight: 6 }} /> Add Position
        </button>
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
        {(['Semua', 'Terbuka', 'Tertutup'] as const).map(tab => (
          <button
            key={tab}
            className={`kt-tag ${filter === tab ? 'gold' : ''}`}
            onClick={() => setFilter(tab)}
            style={{ cursor: 'pointer' }}
          >
            {tab} {tab === 'Terbuka' ? `(${openCount})` : tab === 'Tertutup' ? `(${closedCount})` : ''}
          </button>
        ))}
      </div>

      {/* Positions Table */}
      <div className="kt-card">
        <table className="kt-table">
          <thead>
            <tr>
              <th>Simbol</th>
              <th>Arah</th>
              <th>Entry</th>
              <th>Saat Ini</th>
              <th>P&L</th>
              <th>SL</th>
              <th>TP</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const { diff, pct } = calcPnL(p)
              const isProfit = diff > 0
              return (
                <tr key={p.id}>
                  <td className="mono" style={{ color: 'var(--kt-text)', fontWeight: 600 }}>{p.symbol}</td>
                  <td>
                    <span className={p.direction === 'Long' ? 'badge-bull' : 'badge-bear'}>
                      {p.direction}
                    </span>
                  </td>
                  <td className="mono">{p.entryPrice.toLocaleString()}</td>
                  <td className="mono" style={{ color: 'var(--kt-text)' }}>{p.currentPrice.toLocaleString()}</td>
                  <td className={`mono ${isProfit ? 'up' : 'dn'}`}>
                    {isProfit ? '+' : ''}{pct.toFixed(2)}%
                  </td>
                  <td className="mono" style={{ color: 'var(--kt-dn)' }}>{p.sl.toLocaleString()}</td>
                  <td className="mono" style={{ color: 'var(--kt-up)' }}>{p.tp.toLocaleString()}</td>
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
      </div>
    </div>
  )
}
