import React, { useState } from 'react'
import { Search, Filter } from 'lucide-react'

const FILTERS = [
  'Market Cap >1T', 'Volume >1M', 'RSI 30-70', 'MACD Signal',
  'Above SMA200', 'Golden Cross', 'BB Position', 'Revenue Growth >10%',
  'ROE >15%', 'D/E <1.5', 'Foreign Flow +', 'Sector Momentum +',
]

interface Stock {
  symbol: string; name: string; price: number; change: number;
  score: number; filtersPassed: number; signals: string[]; passedFilters: boolean[];
}

const MOCK_STOCKS: Stock[] = [
  { symbol: 'BBCA', name: 'Bank Central Asia', price: 9850, change: 1.24, score: 92, filtersPassed: 11, signals: ['Golden Cross', 'Foreign Buy', 'Breakout'], passedFilters: [true,true,true,true,true,true,true,true,true,true,true,true] },
  { symbol: 'BBRI', name: 'Bank Rakyat Indonesia', price: 4520, change: 0.88, score: 85, filtersPassed: 10, signals: ['Volume Surge', 'RSI Bullish'], passedFilters: [true,true,true,true,true,true,true,true,true,true,true,false] },
  { symbol: 'TLKM', name: 'Telkom Indonesia', price: 2680, change: -0.37, score: 78, filtersPassed: 9, signals: ['MACD Cross'], passedFilters: [true,true,true,true,true,true,true,true,true,false,false,true] },
  { symbol: 'ADRO', name: 'Adaro Energy', price: 2850, change: 2.15, score: 74, filtersPassed: 8, signals: ['Sector Rotation', 'Volume Breakout'], passedFilters: [true,true,true,false,true,true,true,true,true,false,false,false] },
  { symbol: 'ASII', name: 'Astra International', price: 5750, change: -0.52, score: 68, filtersPassed: 7, signals: ['Near Support'], passedFilters: [true,true,true,false,true,false,true,true,false,true,false,false] },
  { symbol: 'UNVR', name: 'Unilever Indonesia', price: 3120, change: 0.32, score: 55, filtersPassed: 5, signals: ['Consolidation'], passedFilters: [false,true,true,false,true,false,false,true,false,true,false,false] },
  { symbol: 'ICBP', name: 'Indofood CBP', price: 11200, change: -1.06, score: 45, filtersPassed: 4, signals: ['Below SMA200'], passedFilters: [true,false,true,false,false,false,true,false,true,false,false,false] },
  { symbol: 'EXCL', name: 'XL Axiata', price: 1920, change: -2.34, score: 32, filtersPassed: 3, signals: ['Death Cross', 'High D/E'], passedFilters: [false,false,true,true,false,false,false,false,false,false,true,false] },
]

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? 'gold' : score >= 60 ? 'up' : score >= 40 ? 'blue' : 'dn'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 140 }}>
      <div className="kt-bar-track" style={{ flex: 1 }}>
        <div className={`kt-bar-fill ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="mono" style={{
        color: score >= 80 ? 'var(--kt-gold)' : score >= 60 ? 'var(--kt-up)' : score >= 40 ? 'var(--kt-blue)' : 'var(--kt-dn)',
        fontSize: 'var(--sm)', fontWeight: 700, minWidth: 28, textAlign: 'right',
      }}>{score}</span>
    </div>
  )
}

export default function Scanner() {
  const [expandedStock, setExpandedStock] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilters, setActiveFilters] = useState<Set<number>>(new Set())

  const toggleFilter = (idx: number) => {
    const next = new Set(activeFilters)
    next.has(idx) ? next.delete(idx) : next.add(idx)
    setActiveFilters(next)
  }

  const filteredStocks = MOCK_STOCKS.filter(s =>
    s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div>
      <div className="kt-route-head">
        <div>
          <div className="kt-kicker">Stock Scanner</div>
          <h1>Scanner</h1>
          <p>Filter setups, watchlist, dan kandidat trade sesuai rule engine</p>
        </div>
        <span className="kt-pill">{filteredStocks.length} stocks</span>
      </div>

      {/* Filters */}
      <div className="kt-card" style={{ marginBottom: 16 }}>
        <div className="kt-card-pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Filter size={13} style={{ color: 'var(--kt-gold)' }} />
            <span className="kt-stat-label" style={{ margin: 0 }}>Active Filters</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {FILTERS.map((f, i) => (
              <button
                key={i}
                className={`kt-tag ${activeFilters.has(i) ? 'gold' : ''}`}
                onClick={() => toggleFilter(i)}
                style={{ cursor: 'pointer', background: activeFilters.has(i) ? 'var(--kt-goldf)' : 'transparent' }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--kt-dim)' }} />
        <input
          className="kt-input"
          style={{ width: '100%', paddingLeft: 34 }}
          placeholder="Search by symbol or name..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="kt-card">
        <table className="kt-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Price</th>
              <th>Change</th>
              <th>Score</th>
              <th>Filters</th>
              <th>Signals</th>
            </tr>
          </thead>
          <tbody>
            {filteredStocks.map(stock => {
              const isExpanded = expandedStock === stock.symbol
              const isUp = stock.change >= 0
              return (
                <React.Fragment key={stock.symbol}>
                  <tr
                    onClick={() => setExpandedStock(isExpanded ? null : stock.symbol)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="mono" style={{ color: 'var(--kt-text)', fontWeight: 600 }}>{stock.symbol}</span>
                        <span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)' }}>{stock.name}</span>
                      </div>
                    </td>
                    <td className="mono" style={{ color: 'var(--kt-text)' }}>{stock.price.toLocaleString()}</td>
                    <td className={`mono ${isUp ? 'up' : 'dn'}`}>{isUp ? '+' : ''}{stock.change.toFixed(2)}%</td>
                    <td><ScoreBar score={stock.score} /></td>
                    <td className="mono">{stock.filtersPassed}/{FILTERS.length}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {stock.signals.map(s => (
                          <span key={s} className="kt-tag" style={{ fontSize: '9px', padding: '2px 6px' }}>{s}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${stock.symbol}-expanded`}>
                      <td colSpan={6} style={{ padding: '12px 14px', background: 'var(--kt-bg1)' }}>
                        <div className="kt-stat-label" style={{ marginBottom: 8 }}>Filter Results</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {FILTERS.map((f, i) => (
                            <span
                              key={i}
                              className="kt-tag"
                              style={{
                                background: stock.passedFilters[i] ? 'var(--kt-upf)' : 'var(--kt-dnf)',
                                color: stock.passedFilters[i] ? 'var(--kt-up)' : 'var(--kt-dn)',
                                borderColor: stock.passedFilters[i] ? 'rgba(70,201,127,.24)' : 'rgba(255,77,79,.24)',
                              }}
                            >
                              {stock.passedFilters[i] ? '✓' : '✗'} {f}
                            </span>
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
      </div>
    </div>
  )
}
