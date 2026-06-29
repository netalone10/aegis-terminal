import { useState } from 'react'
import { Search, Filter, TrendingUp, TrendingDown, ChevronDown, ChevronUp, BarChart3 } from 'lucide-react'

const FILTERS = [
  'Market Cap >1T',
  'Volume >1M',
  'RSI 30-70',
  'MACD Signal',
  'Above SMA200',
  'Golden Cross',
  'BB Position',
  'Revenue Growth >10%',
  'ROE >15%',
  'D/E <1.5',
  'Foreign Flow +',
  'Sector Momentum +',
]

interface Stock {
  symbol: string
  name: string
  price: number
  change: number
  score: number
  filtersPassed: number
  signals: string[]
  passedFilters: boolean[]
}

const MOCK_STOCKS: Stock[] = [
  { symbol: 'BBCA', name: 'Bank Central Asia', price: 9850, change: 1.24, score: 92, filtersPassed: 11, signals: ['Golden Cross', 'Foreign Buy', 'Breakout'], passedFilters: [true,true,true,true,true,true,true,true,true,true,true,true] },
  { symbol: 'BBRI', name: 'Bank Rakyat Indonesia', price: 4520, change: 0.88, score: 85, filtersPassed: 10, signals: ['Volume Surge', 'RSI Bullish'], passedFilters: [true,true,true,true,true,true,true,true,true,true,true,false] },
  { symbol: 'TLKM', name: 'Telkom Indonesia', price: 2680, change: -0.37, score: 78, filtersPassed: 9, signals: ['MACD Cross'], passedFilters: [true,true,true,true,true,true,true,true,true,false,false,true] },
  { symbol: 'ADRO', name: 'Adaro Energy', price: 2850, change: 2.15, score: 74, filtersPassed: 8, signals: ['Sector Rotation', 'Volume Breakout'], passedFilters: [true,true,true,false,true,true,true,true,false,true,false,false] },
  { symbol: 'ASII', name: 'Astra International', price: 5750, change: -0.52, score: 68, filtersPassed: 7, signals: ['Near Support'], passedFilters: [true,true,true,false,true,false,true,true,false,true,false,false] },
  { symbol: 'UNVR', name: 'Unilever Indonesia', price: 3120, change: 0.32, score: 55, filtersPassed: 5, signals: ['Consolidation'], passedFilters: [false,true,true,false,true,false,false,true,false,true,false,false] },
  { symbol: 'ICBP', name: 'Indofood CBP', price: 11200, change: -1.06, score: 45, filtersPassed: 4, signals: ['Below SMA200'], passedFilters: [true,false,true,false,false,false,true,false,true,false,false,false] },
  { symbol: 'EXCL', name: 'XL Axiata', price: 1920, change: -2.34, score: 32, filtersPassed: 3, signals: ['Death Cross', 'High D/E'], passedFilters: [false,false,true,true,false,false,false,false,false,false,true,false] },
]

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-primary' : score >= 60 ? 'bg-warning' : score >= 40 ? 'bg-info' : 'bg-danger'
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono text-fg-muted w-6 text-right">{score}</span>
    </div>
  )
}

export default function Scanner() {
  const [search, setSearch] = useState('')
  const [activeFilters, setActiveFilters] = useState<Set<number>>(new Set())
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')

  const toggleFilter = (idx: number) => {
    const next = new Set(activeFilters)
    next.has(idx) ? next.delete(idx) : next.add(idx)
    setActiveFilters(next)
  }

  const filtered = MOCK_STOCKS
    .filter(s => s.symbol.toLowerCase().includes(search.toLowerCase()) || s.name.toLowerCase().includes(search.toLowerCase()))
    .filter(s => {
      if (activeFilters.size === 0) return true
      return [...activeFilters].every(f => s.passedFilters[f])
    })
    .sort((a, b) => sortDir === 'desc' ? b.score - a.score : a.score - b.score)

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-fg">IDX Stock Screener</h1>
          <p className="text-sm text-fg-muted mt-0.5">Aegis Fund 12-filter screening engine</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-fg-muted font-mono">
          <BarChart3 size={14} className="text-primary" />
          <span>{filtered.length} results</span>
        </div>
      </div>

      {/* Search + Filter summary */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-placeholder" />
          <input
            type="text"
            placeholder="Search symbol or name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-surface border border-border rounded-md text-sm text-fg placeholder:text-fg-placeholder focus:outline-none focus:border-primary transition-colors font-mono"
          />
        </div>
        {activeFilters.size > 0 && (
          <button
            onClick={() => setActiveFilters(new Set())}
            className="text-xs text-danger hover:text-danger-hover transition-colors"
          >
            Clear {activeFilters.size} filters
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f, i) => (
          <button
            key={f}
            onClick={() => toggleFilter(i)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              activeFilters.has(i)
                ? 'bg-primary-bg border-primary text-primary'
                : 'bg-surface border-border text-fg-muted hover:border-border-hover hover:text-fg-secondary'
            }`}
          >
            <Filter size={10} className="inline mr-1.5 -mt-0.5" />
            {f}
          </button>
        ))}
      </div>

      {/* Results table */}
      <div className="bg-default border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-fg-muted uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">Symbol</th>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-right px-4 py-3 font-medium">Price</th>
                <th className="text-right px-4 py-3 font-medium">Change%</th>
                <th className="text-left px-4 py-3 font-medium">
                  <button
                    onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                    className="flex items-center gap-1 hover:text-fg transition-colors"
                  >
                    Score
                    {sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                  </button>
                </th>
                <th className="text-center px-4 py-3 font-medium">Filters</th>
                <th className="text-left px-4 py-3 font-medium">Signals</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filtered.map(stock => (
                <tr key={stock.symbol} className="hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono font-semibold text-fg">{stock.symbol}</span>
                  </td>
                  <td className="px-4 py-3 text-fg-secondary">{stock.name}</td>
                  <td className="px-4 py-3 text-right font-mono text-fg">
                    {stock.price.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    <span className={`inline-flex items-center gap-1 ${stock.change >= 0 ? 'text-primary' : 'text-danger'}`}>
                      {stock.change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ScoreBar score={stock.score} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-mono text-fg-secondary">
                      {stock.filtersPassed}<span className="text-fg-placeholder">/12</span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {stock.signals.map(s => (
                        <span key={s} className="px-2 py-0.5 bg-surface border border-border-subtle rounded text-[10px] text-fg-muted font-mono">
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
