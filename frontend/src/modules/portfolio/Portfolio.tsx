import { useState } from 'react'
import { TrendingUp, TrendingDown, Plus, Briefcase, Target, ShieldAlert, Trophy } from 'lucide-react'

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
  { label: 'Total P&L', value: '+Rp 1,245,000', icon: TrendingUp, color: 'text-primary', glow: 'glow-primary' },
  { label: 'Win Rate', value: '72%', icon: Trophy, color: 'text-warning', glow: 'glow-warning' },
  { label: 'Open Positions', value: '3', icon: Briefcase, color: 'text-info', glow: 'glow-info' },
  { label: 'Max Drawdown', value: '-4.2%', icon: ShieldAlert, color: 'text-danger', glow: 'glow-danger' },
]

export default function Portfolio() {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ symbol: '', direction: 'Long' as 'Long' | 'Short', entryPrice: '', sl: '', tp: '' })

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Position Monitor</h1>
          <p className="text-[13px] text-fg-muted mt-1">Track open & closed positions</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary to-primary-hover text-canvas text-[13px] font-semibold rounded-lg hover:shadow-[0_0_20px_rgba(62,207,142,0.3)] transition-all"
        >
          <Plus size={14} />
          Add Position
        </button>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="glass p-5 glow-subtle">
          <div className="grid grid-cols-5 gap-3">
            {[
              { key: 'symbol', placeholder: 'Symbol', value: form.symbol },
              { key: 'entryPrice', placeholder: 'Entry Price', value: form.entryPrice },
              { key: 'sl', placeholder: 'Stop Loss', value: form.sl },
              { key: 'tp', placeholder: 'Take Profit', value: form.tp },
            ].map(f => (
              <input
                key={f.key}
                placeholder={f.placeholder}
                value={f.value}
                onChange={e => setForm({ ...form, [f.key]: f.key === 'symbol' ? e.target.value.toUpperCase() : e.target.value })}
                className="px-3 py-2.5 bg-surface/60 border border-border/40 rounded-lg text-[13px] text-fg placeholder:text-fg-placeholder focus:outline-none focus:border-primary/50 font-mono transition-colors"
              />
            ))}
            <select
              value={form.direction}
              onChange={e => setForm({ ...form, direction: e.target.value as 'Long' | 'Short' })}
              className="px-3 py-2.5 bg-surface/60 border border-border/40 rounded-lg text-[13px] text-fg focus:outline-none focus:border-primary/50 transition-colors"
            >
              <option value="Long">Long</option>
              <option value="Short">Short</option>
            </select>
          </div>
          <div className="flex gap-2 mt-3">
            <button className="px-5 py-2 bg-primary text-canvas text-[12px] font-semibold rounded-lg hover:bg-primary-hover transition-colors">Save</button>
            <button onClick={() => setShowForm(false)} className="px-5 py-2 glass text-[12px] text-fg-muted rounded-lg hover:text-fg-secondary transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {summaryStats.map(stat => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className={`glass glass-hover gradient-border p-5 ${stat.glow}`}>
              <div className="flex items-center gap-2 mb-3">
                <Icon size={14} className={stat.color} />
                <span className="text-[11px] text-fg-muted font-mono uppercase tracking-widest">{stat.label}</span>
              </div>
              <span className={`text-2xl font-bold font-mono ${stat.color}`}>{stat.value}</span>
            </div>
          )
        })}
      </div>

      {/* Positions table */}
      <div className="glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/30 text-[10px] text-fg-muted uppercase tracking-widest font-mono">
                {['Symbol', 'Direction', 'Entry', 'Current', 'P&L', 'P&L%', 'SL', 'TP', 'Status'].map(h => (
                  <th key={h} className={`px-5 py-3 font-semibold ${['Direction', 'Status'].includes(h) ? 'text-center' : ['Symbol'].includes(h) ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_POSITIONS.map(pos => {
                const { diff, pct } = calcPnL(pos)
                const isProfit = diff >= 0
                return (
                  <tr key={pos.id} className="table-row-hover border-b border-border/10 last:border-0">
                    <td className="px-5 py-3 font-mono font-bold text-[13px]">{pos.symbol}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`chip ${pos.direction === 'Long' ? 'chip-primary' : 'chip-danger'}`}>
                        {pos.direction}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-fg-secondary text-[12px]">{pos.entryPrice.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right font-mono text-fg font-medium text-[13px]">{pos.currentPrice.toLocaleString()}</td>
                    <td className={`px-5 py-3 text-right font-mono font-bold text-[13px] ${isProfit ? 'text-primary' : 'text-danger'}`}>
                      {isProfit ? '+' : ''}{diff.toLocaleString()}
                    </td>
                    <td className={`px-5 py-3 text-right font-mono text-[12px]`}>
                      <span className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md ${isProfit ? 'text-primary bg-primary/[0.08]' : 'text-danger bg-danger/[0.08]'}`}>
                        {isProfit ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                        {isProfit ? '+' : ''}{pct.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-danger/60 text-[12px]">{pos.sl.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right font-mono text-primary/60 text-[12px]">{pos.tp.toLocaleString()}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`chip ${pos.status === 'Open' ? 'chip-primary' : 'chip-muted'}`}>
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
