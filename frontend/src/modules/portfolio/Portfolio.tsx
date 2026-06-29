import { useState } from 'react'
import { TrendingUp, TrendingDown, Plus, Briefcase, Target, ShieldAlert, Trophy } from 'lucide-react'

interface Position {
  id: number
  symbol: string
  direction: 'Long' | 'Short'
  entryPrice: number
  currentPrice: number
  sl: number
  tp: number
  status: 'Open' | 'Closed'
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
  { label: 'Total P&L', value: '+Rp 1,245,000', icon: TrendingUp, color: 'text-primary' },
  { label: 'Win Rate', value: '72%', icon: Trophy, color: 'text-warning' },
  { label: 'Open Positions', value: '3', icon: Briefcase, color: 'text-info' },
  { label: 'Max Drawdown', value: '-4.2%', icon: ShieldAlert, color: 'text-danger' },
]

export default function Portfolio() {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ symbol: '', direction: 'Long' as 'Long' | 'Short', entryPrice: '', sl: '', tp: '' })

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-fg">Position Monitor</h1>
          <p className="text-sm text-fg-muted mt-0.5">Track open & closed positions</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-canvas text-sm font-medium rounded-md hover:bg-primary-hover transition-colors"
        >
          <Plus size={14} />
          Add Position
        </button>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="bg-default border border-border rounded-lg p-4">
          <div className="grid grid-cols-5 gap-3">
            <input
              placeholder="Symbol"
              value={form.symbol}
              onChange={e => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
              className="px-3 py-2 bg-surface border border-border rounded-md text-sm text-fg placeholder:text-fg-placeholder focus:outline-none focus:border-primary font-mono"
            />
            <select
              value={form.direction}
              onChange={e => setForm({ ...form, direction: e.target.value as 'Long' | 'Short' })}
              className="px-3 py-2 bg-surface border border-border rounded-md text-sm text-fg focus:outline-none focus:border-primary"
            >
              <option value="Long">Long</option>
              <option value="Short">Short</option>
            </select>
            <input
              placeholder="Entry Price"
              value={form.entryPrice}
              onChange={e => setForm({ ...form, entryPrice: e.target.value })}
              className="px-3 py-2 bg-surface border border-border rounded-md text-sm text-fg placeholder:text-fg-placeholder focus:outline-none focus:border-primary font-mono"
            />
            <input
              placeholder="Stop Loss"
              value={form.sl}
              onChange={e => setForm({ ...form, sl: e.target.value })}
              className="px-3 py-2 bg-surface border border-border rounded-md text-sm text-fg placeholder:text-fg-placeholder focus:outline-none focus:border-primary font-mono"
            />
            <input
              placeholder="Take Profit"
              value={form.tp}
              onChange={e => setForm({ ...form, tp: e.target.value })}
              className="px-3 py-2 bg-surface border border-border rounded-md text-sm text-fg placeholder:text-fg-placeholder focus:outline-none focus:border-primary font-mono"
            />
          </div>
          <div className="flex gap-2 mt-3">
            <button className="px-4 py-1.5 bg-primary text-canvas text-xs font-medium rounded-md hover:bg-primary-hover transition-colors">
              Save
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-1.5 bg-surface border border-border text-xs text-fg-muted rounded-md hover:border-border-hover transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {summaryStats.map(stat => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="bg-default border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon size={14} className={stat.color} />
                <span className="text-xs text-fg-muted">{stat.label}</span>
              </div>
              <span className={`text-xl font-semibold font-mono ${stat.color}`}>{stat.value}</span>
            </div>
          )
        })}
      </div>

      {/* Positions table */}
      <div className="bg-default border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-fg-muted uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">Symbol</th>
                <th className="text-center px-4 py-3 font-medium">Direction</th>
                <th className="text-right px-4 py-3 font-medium">Entry</th>
                <th className="text-right px-4 py-3 font-medium">Current</th>
                <th className="text-right px-4 py-3 font-medium">P&L</th>
                <th className="text-right px-4 py-3 font-medium">P&L%</th>
                <th className="text-right px-4 py-3 font-medium">SL</th>
                <th className="text-right px-4 py-3 font-medium">TP</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {MOCK_POSITIONS.map(pos => {
                const { diff, pct } = calcPnL(pos)
                const isProfit = diff >= 0
                return (
                  <tr key={pos.id} className="hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-fg">{pos.symbol}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                        pos.direction === 'Long'
                          ? 'bg-primary-bg text-primary'
                          : 'bg-danger/15 text-danger'
                      }`}>
                        {pos.direction}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-fg-secondary">{pos.entryPrice.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono text-fg">{pos.currentPrice.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-right font-mono font-medium ${isProfit ? 'text-primary' : 'text-danger'}`}>
                      {isProfit ? '+' : ''}{diff.toLocaleString()}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${isProfit ? 'text-primary' : 'text-danger'}`}>
                      <span className="inline-flex items-center gap-1">
                        {isProfit ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {isProfit ? '+' : ''}{pct.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-danger/70">{pos.sl.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono text-primary/70">{pos.tp.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                        pos.status === 'Open'
                          ? 'bg-primary-bg text-primary'
                          : 'bg-surface text-fg-muted'
                      }`}>
                        {pos.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
