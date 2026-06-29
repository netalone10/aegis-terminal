import { useState, useMemo } from 'react'
import { api } from '../../lib/api'

const STRATEGIES = [
  { id: 'ob_entry', label: 'Order Block Entry', desc: 'Enter at OB zone, SL below OB, TP 1.5 ATR', icon: '🧱' },
  { id: 'fvg_fill', label: 'FVG Fill', desc: 'Enter on FVG fill, SL beyond gap, TP 1 ATR', icon: '📊' },
  { id: 'bos_continuation', label: 'BOS Continuation', desc: 'Enter on BOS, SL at structure break, TP at liquidity', icon: '⚡' },
  { id: 'confluence', label: 'Confluence (3/3 TF)', desc: 'All TFs aligned — highest quality setups', icon: '🎯' },
]

const PAIRS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'GBP/JPY', 'AUD/USD', 'XAU/USD']
const TIMEFRAMES = ['15m', '1h', '4h', '1D']

interface BacktestResult {
  strategy: string
  strategyLabel: string
  pair: string
  startDate: string
  endDate: string
  totalTrades: number
  wins: number
  losses: number
  winRate: number
  avgWin: number
  avgLoss: number
  profitFactor: number
  maxDrawdown: number
  expectancy: number
  monthlyReturns: { month: string; return: number; trades: number }[]
  equityCurve: number[]
  monteCarlo: { simulations: number; drawdown95: number; drawdown99: number }
}

export default function Backtest() {
  const [strategy, setStrategy] = useState('ob_entry')
  const [pair, setPair] = useState('BTC/USD')
  const [timeframe, setTimeframe] = useState('1h')
  const [startDate, setStartDate] = useState('2024-01-01')
  const [endDate, setEndDate] = useState('2025-06-30')
  const [riskPercent, setRiskPercent] = useState(1)
  const [initialBalance, setInitialBalance] = useState(10000)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [history, setHistory] = useState<BacktestResult[]>([])
  const [error, setError] = useState('')

  const runBacktest = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api('/api/backtest/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pair, timeframe, strategy, startDate, endDate, riskPercent, initialBalance }),
      })
      setResult(data as BacktestResult)
      setHistory(prev => {
        const filtered = prev.filter(r => r.strategy !== strategy)
        return [...filtered, data as BacktestResult].slice(-4)
      })
    } catch (e: any) {
      setError(e.message || 'Backtest failed')
    } finally {
      setLoading(false)
    }
  }

  const eqCurve = useMemo(() => {
    if (!result?.equityCurve?.length) return []
    const eq = result.equityCurve
    const min = Math.min(...eq)
    const max = Math.max(...eq)
    const range = max - min || 1
    return eq.map((v, i) => ({
      x: (i / (eq.length - 1)) * 100,
      y: 100 - ((v - min) / range) * 100,
      val: v,
    }))
  }, [result?.equityCurve])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sm)' }}>
      {/* Disclaimer */}
      <div className="kt-panel" style={{ padding: 'var(--sm)', borderLeft: '3px solid var(--kt-gold)', background: 'rgba(255,200,0,0.04)' }}>
        <span style={{ color: 'var(--kt-gold)', fontFamily: 'var(--font-mono)', fontSize: 'var(--xs)' }}>
          ⚠ Backtested results are hypothetical and do not guarantee future performance.
        </span>
      </div>

      {/* Strategy Selector */}
      <div className="kt-panel" style={{ padding: 'var(--md)' }}>
        <p className="kt-kicker">STRATEGY SELECTOR</p>
        <div className="kt-grid-4" style={{ marginTop: 'var(--sm)' }}>
          {STRATEGIES.map(s => (
            <div
              key={s.id}
              className="kt-card kt-card-pad"
              onClick={() => setStrategy(s.id)}
              style={{
                cursor: 'pointer',
                border: strategy === s.id ? '1px solid var(--kt-gold)' : '1px solid var(--kt-border)',
                background: strategy === s.id ? 'rgba(255,200,0,0.06)' : undefined,
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: '1.3rem', marginBottom: '4px' }}>{s.icon}</div>
              <p style={{ color: 'var(--kt-text)', fontWeight: 600, fontSize: 'var(--sm)' }}>{s.label}</p>
              <p style={{ color: 'var(--kt-text2)', fontSize: 'var(--xs)', marginTop: '2px' }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Config Row */}
      <div className="kt-panel" style={{ padding: 'var(--md)' }}>
        <p className="kt-kicker">CONFIGURATION</p>
        <div style={{ display: 'flex', gap: 'var(--md)', marginTop: 'var(--sm)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: 'var(--xs)', color: 'var(--kt-text2)' }}>
            Pair
            <select value={pair} onChange={e => setPair(e.target.value)} style={inputStyle}>
              {PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: 'var(--xs)', color: 'var(--kt-text2)' }}>
            Timeframe
            <select value={timeframe} onChange={e => setTimeframe(e.target.value)} style={inputStyle}>
              {TIMEFRAMES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: 'var(--xs)', color: 'var(--kt-text2)' }}>
            Start Date
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: 'var(--xs)', color: 'var(--kt-text2)' }}>
            End Date
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: 'var(--xs)', color: 'var(--kt-text2)' }}>
            Risk %
            <input type="number" value={riskPercent} onChange={e => setRiskPercent(Number(e.target.value))} min={0.1} max={10} step={0.1} style={{ ...inputStyle, width: '70px' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: 'var(--xs)', color: 'var(--kt-text2)' }}>
            Balance ($)
            <input type="number" value={initialBalance} onChange={e => setInitialBalance(Number(e.target.value))} min={100} step={100} style={{ ...inputStyle, width: '100px' }} />
          </label>
          <button
            onClick={runBacktest}
            disabled={loading}
            style={{
              padding: '8px 20px',
              background: 'var(--kt-gold)',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 'var(--xs)',
              fontFamily: 'var(--font-mono)',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'RUNNING...' : '▶ RUN BACKTEST'}
          </button>
        </div>
      </div>

      {error && <div className="kt-panel" style={{ padding: 'var(--sm)', color: 'var(--kt-dn)' }}>Error: {error}</div>}

      {/* Results */}
      {result && (
        <>
          {/* Key Metrics */}
          <div className="kt-panel" style={{ padding: 'var(--md)' }}>
            <p className="kt-kicker">{result.strategyLabel} — {result.pair}</p>
            <div className="kt-grid-3" style={{ marginTop: 'var(--sm)' }}>
              {[
                { label: 'Total Trade', value: result.totalTrades, color: 'var(--kt-text)' },
                { label: 'Win Rate', value: `${result.winRate}%`, color: 'var(--kt-up)' },
                { label: 'Profit Factor', value: result.profitFactor.toFixed(2), color: result.profitFactor > 1 ? 'var(--kt-up)' : 'var(--kt-dn)' },
                { label: 'Drawdown Maks', value: `${result.maxDrawdown}%`, color: 'var(--kt-dn)' },
                { label: 'Expectancy', value: `${result.expectancy}%`, color: result.expectancy > 0 ? 'var(--kt-up)' : 'var(--kt-dn)' },
                { label: 'Avg Win / Avg Loss', value: `$${result.avgWin.toFixed(0)} / $${result.avgLoss.toFixed(0)}`, color: 'var(--kt-text)' },
              ].map(m => (
                <div key={m.label} className="kt-stat">
                  <span style={{ color: 'var(--kt-text2)', fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)' }}>{m.label}</span>
                  <span style={{ color: m.color, fontSize: '1.4rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{m.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Equity Curve */}
          <div className="kt-panel" style={{ padding: 'var(--md)' }}>
            <p className="kt-kicker">EQUITY CURVE</p>
            <div style={{ marginTop: 'var(--sm)', position: 'relative', height: '180px', background: 'var(--kt-bg2)', borderRadius: '4px', overflow: 'hidden', padding: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', height: '100%', gap: '1px' }}>
                {eqCurve.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${100 - p.y}%`,
                      background: p.val >= (result.equityCurve[0] || 0) ? 'var(--kt-up)' : 'var(--kt-dn)',
                      opacity: 0.7,
                      borderRadius: '1px 1px 0 0',
                      transition: 'height 0.3s',
                    }}
                    title={`$${p.val.toLocaleString()}`}
                  />
                ))}
              </div>
              <div style={{ position: 'absolute', top: 8, left: 8, fontSize: 'var(--xs)', color: 'var(--kt-text2)', fontFamily: 'var(--font-mono)' }}>
                ${result.equityCurve[0]?.toLocaleString()}
              </div>
              <div style={{ position: 'absolute', bottom: 8, right: 8, fontSize: 'var(--xs)', color: 'var(--kt-text)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                ${result.equityCurve[result.equityCurve.length - 1]?.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Monthly Returns Heatmap */}
          <div className="kt-panel" style={{ padding: 'var(--md)' }}>
            <p className="kt-kicker">MONTHLY RETURNS</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: 'var(--sm)' }}>
              {result.monthlyReturns.map((mr, i) => (
                <div
                  key={i}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '3px',
                    fontSize: 'var(--xs)',
                    fontFamily: 'var(--font-mono)',
                    background: mr.return >= 0 ? 'rgba(0,200,120,0.15)' : 'rgba(255,60,60,0.15)',
                    color: mr.return >= 0 ? 'var(--kt-up)' : 'var(--kt-dn)',
                    border: `1px solid ${mr.return >= 0 ? 'rgba(0,200,120,0.3)' : 'rgba(255,60,60,0.3)'}`,
                    minWidth: '80px',
                    textAlign: 'center',
                  }}
                  title={`${mr.trades} trades`}
                >
                  <div style={{ fontWeight: 600 }}>{mr.month}</div>
                  <div>{mr.return > 0 ? '+' : ''}{mr.return}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* Trade Distribution */}
          <div className="kt-panel" style={{ padding: 'var(--md)' }}>
            <p className="kt-kicker">TRADE DISTRIBUTION</p>
            <div style={{ display: 'flex', gap: 'var(--md)', marginTop: 'var(--sm)', alignItems: 'flex-end', height: '100px' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <div style={{
                  width: '60%',
                  height: `${(result.wins / result.totalTrades) * 100}px`,
                  background: 'var(--kt-up)',
                  borderRadius: '3px 3px 0 0',
                  minHeight: '4px',
                }} />
                <span style={{ fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)', color: 'var(--kt-up)' }}>
                  Wins: {result.wins}
                </span>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <div style={{
                  width: '60%',
                  height: `${(result.losses / result.totalTrades) * 100}px`,
                  background: 'var(--kt-dn)',
                  borderRadius: '3px 3px 0 0',
                  minHeight: '4px',
                }} />
                <span style={{ fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)', color: 'var(--kt-dn)' }}>
                  Losses: {result.losses}
                </span>
              </div>
            </div>
          </div>

          {/* Monte Carlo */}
          <div className="kt-panel" style={{ padding: 'var(--md)' }}>
            <p className="kt-kicker">MONTE CARLO SIMULATION</p>
            <div className="kt-grid-2" style={{ marginTop: 'var(--sm)' }}>
              <div className="kt-stat">
                <span style={{ color: 'var(--kt-text2)', fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)' }}>
                  Based on {result.monteCarlo.simulations} simulations
                </span>
                <span style={{ color: 'var(--kt-gold)', fontSize: 'var(--sm)' }}>
                  95% chance of not exceeding {result.monteCarlo.drawdown95}% drawdown
                </span>
              </div>
              <div className="kt-stat">
                <span style={{ color: 'var(--kt-text2)', fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)' }}>
                  99th percentile worst case
                </span>
                <span style={{ color: 'var(--kt-dn)', fontSize: 'var(--sm)' }}>
                  {result.monteCarlo.drawdown99}% max drawdown
                </span>
              </div>
            </div>
          </div>

          {/* Strategy Comparison */}
          {history.length > 1 && (
            <div className="kt-panel" style={{ padding: 'var(--md)' }}>
              <p className="kt-kicker">STRATEGY COMPARISON</p>
              <div style={{ marginTop: 'var(--sm)', overflow: 'auto' }}>
                <table className="kt-table" style={{ width: '100%', fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Strategy</th>
                      <th style={thStyle}>Trades</th>
                      <th style={thStyle}>Win %</th>
                      <th style={thStyle}>PF</th>
                      <th style={thStyle}>Max DD</th>
                      <th style={thStyle}>Expect.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((r, i) => (
                      <tr key={i} style={{ background: r.strategy === result.strategy ? 'rgba(255,200,0,0.05)' : undefined }}>
                        <td style={tdStyle}>{r.strategyLabel}</td>
                        <td style={tdStyle}>{r.totalTrades}</td>
                        <td style={{ ...tdStyle, color: 'var(--kt-up)' }}>{r.winRate}%</td>
                        <td style={{ ...tdStyle, color: r.profitFactor > 1 ? 'var(--kt-up)' : 'var(--kt-dn)' }}>{r.profitFactor.toFixed(2)}</td>
                        <td style={{ ...tdStyle, color: 'var(--kt-dn)' }}>{r.maxDrawdown}%</td>
                        <td style={{ ...tdStyle, color: r.expectancy > 0 ? 'var(--kt-up)' : 'var(--kt-dn)' }}>{r.expectancy}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: 'var(--kt-bg)',
  border: '1px solid var(--kt-border)',
  color: 'var(--kt-text)',
  padding: '6px 10px',
  borderRadius: '4px',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--xs)',
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  color: 'var(--kt-text2)',
  borderBottom: '1px solid var(--kt-border)',
  fontWeight: 600,
}

const tdStyle: React.CSSProperties = {
  padding: '6px 8px',
  color: 'var(--kt-text)',
  borderBottom: '1px solid var(--kt-border)',
}
