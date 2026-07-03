import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Zap, Target, Clock, TrendingUp, TrendingDown, Minus, Shield, AlertTriangle, CheckCircle } from 'lucide-react'
import { api } from '../../lib/api'

interface SwingPoint {
  price: number
  type: string
  time: number
}

interface FVG {
  type: string
  top: number
  bottom: number
  gap: number
  time: number
}

interface OrderBlock {
  type: string
  high: number
  low: number
  time: number
}

interface Setup {
  type: 'long' | 'short'
  entry: number
  sl: number
  tp: number
  rr: number
  reason: string
  confluence: string[]
  status: 'active' | 'waiting'
}

interface Signal {
  symbol: string
  bias: 'bullish' | 'bearish' | 'neutral'
  confidence: number
  price: number
  spread: number
  zone: 'premium' | 'discount' | 'equilibrium'
  killZone: string
  structure: {
    trend: string
    swingHighs: SwingPoint[]
    swingLows: SwingPoint[]
    bos: boolean
    choch: boolean
  }
  levels: {
    resistance: number[]
    support: number[]
    fvgs: FVG[]
    orderBlocks: OrderBlock[]
    equilibrium: number
  }
  setups: Setup[]
  timestamp: number
  reasoning?: {
    summary: string
    structure: string
    candlePattern?: string
    multiTf: string
    zoneNote: string
  }
}

interface SignalHistory {
  id: number
  symbol: string
  bias: string
  confidence: number
  price: number
  entry: number
  sl: number
  tp: number
  rr: number
  result: string
  reason: string
  created_at: string
}

const PAIRS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY']

function biasIcon(bias: string) {
  if (bias === 'bullish') return <TrendingUp size={14} style={{ color: 'var(--kt-up)' }} />
  if (bias === 'bearish') return <TrendingDown size={14} style={{ color: 'var(--kt-dn)' }} />
  return <Minus size={14} style={{ color: 'var(--kt-muted)' }} />
}

function biasColor(bias: string) {
  if (bias === 'bullish') return 'var(--kt-up)'
  if (bias === 'bearish') return 'var(--kt-dn)'
  return 'var(--kt-muted)'
}

function formatPrice(p: number) {
  return p.toFixed(2)
}

function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleString('id-ID', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

function timeAgo(ts: number) {
  const diff = Math.floor(Date.now() / 1000) - ts
  if (diff < 5) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function resultColor(result: string) {
  if (result === 'hit_tp') return 'var(--kt-up)'
  if (result === 'hit_sl') return 'var(--kt-dn)'
  if (result === 'open') return 'var(--kt-gold)'
  return 'var(--kt-muted)'
}

export default function Signals() {
  const [symbol, setSymbol] = useState('XAUUSD')

  const { data: signal, isLoading, dataUpdatedAt } = useQuery<Signal>({
    queryKey: ['signal', symbol],
    queryFn: () => api(`/api/signals/${symbol}`),
    refetchInterval: 10_000,
    retry: 1,
  })

  const { data: history = [] } = useQuery<SignalHistory[]>({
    queryKey: ['signal-history', symbol],
    queryFn: () => api(`/api/signals/history/${symbol}?limit=20`),
    refetchInterval: 30_000,
    retry: false,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div className="kt-route-head">
        <div>
          <div className="kt-kicker">Lab Signals</div>
          <h1>SMC/ICT Signals</h1>
          <p>Real-time market structure analysis with entry setups</p>
        </div>
      </div>

      {/* Symbol Selector */}
      <div className="kt-card" style={{ marginBottom: 0 }}>
        <div className="kt-card-pad" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {PAIRS.map(p => (
            <button
              key={p}
              className={`kt-tag ${symbol === p ? 'gold' : ''}`}
              onClick={() => setSymbol(p)}
              style={{ cursor: 'pointer', minWidth: 70, justifyContent: 'center' }}
            >
              {p}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', color: 'var(--kt-dim)', fontSize: 'var(--xs)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {dataUpdatedAt && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#46c97f', animation: 'pulse-dot 2s infinite' }} />
                Updated {timeAgo(Math.floor(dataUpdatedAt / 1000))}
              </span>
            )}
          </span>
        </div>
      </div>

      {isLoading && (
        <div className="kt-card">
          <div className="kt-card-pad" style={{ textAlign: 'center', padding: 40 }}>
            <span style={{ color: 'var(--kt-muted)' }}>Analyzing market structure...</span>
          </div>
        </div>
      )}

      {signal && (
        <>
          {/* ═══ BIAS BANNER ═══ */}
          <div className="kt-card" style={{
            borderLeft: `3px solid ${biasColor(signal.bias)}`,
            background: signal.bias === 'bullish' ? 'rgba(34,197,94,.06)' : signal.bias === 'bearish' ? 'rgba(239,68,68,.06)' : 'rgba(148,163,184,.04)',
          }}>
            <div className="kt-card-pad">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Zap size={20} style={{ color: 'var(--kt-gold)' }} />
                <span className="mono" style={{ fontSize: 'var(--lg)', fontWeight: 700, color: 'var(--kt-text)' }}>
                  {signal.symbol}
                </span>
                <span style={{ fontSize: 'var(--xxl)', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--kt-text)' }}>
                  {formatPrice(signal.price)}
                </span>
                <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
                  Spread: {signal.spread}pts
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {biasIcon(signal.bias)}
                  <span style={{ fontSize: 'var(--md)', fontWeight: 700, color: biasColor(signal.bias), textTransform: 'uppercase' }}>
                    {signal.bias}
                  </span>
                  <span style={{ fontSize: 'var(--sm)', color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>
                    {signal.confidence}%
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                <span className={`kt-tag ${signal.zone === 'discount' ? 'gold' : ''}`} style={{ fontSize: 9 }}>
                  {signal.zone.toUpperCase()}
                </span>
                <span className="kt-tag" style={{ fontSize: 9 }}>
                  {signal.killZone}
                </span>
                {signal.structure.bos && (
                  <span className="kt-tag gold" style={{ fontSize: 9 }}>BOS CONFIRMED</span>
                )}
              </div>
            </div>
          </div>

          {/* ═══ MARKET STRUCTURE ═══ */}
          <div className="kt-card">
            <div className="kt-card-pad">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Target size={16} style={{ color: 'var(--kt-gold)' }} />
                <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>Market Structure</span>
                <span className="kt-tag gold" style={{ marginLeft: 'auto', fontSize: 9 }}>{signal.structure.trend}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Swing Highs */}
                <div>
                  <div style={{ fontSize: 9, color: 'var(--kt-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Swing Highs</div>
                  {signal.structure.swingHighs.map((s, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--kt-border)' }}>
                      <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>{formatTime(s.time)}</span>
                      <span className="mono" style={{ fontSize: 'var(--xs)', color: biasColor(s.type === 'HH' ? 'bullish' : 'bearish'), fontWeight: 600 }}>
                        {s.type} {formatPrice(s.price)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Swing Lows */}
                <div>
                  <div style={{ fontSize: 9, color: 'var(--kt-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Swing Lows</div>
                  {signal.structure.swingLows.map((s, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--kt-border)' }}>
                      <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>{formatTime(s.time)}</span>
                      <span className="mono" style={{ fontSize: 'var(--xs)', color: biasColor(s.type === 'HL' ? 'bullish' : 'bearish'), fontWeight: 600 }}>
                        {s.type} {formatPrice(s.price)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ═══ KEY LEVELS ═══ */}
          <div className="kt-card">
            <div className="kt-card-pad">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Shield size={16} style={{ color: 'var(--kt-gold)' }} />
                <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>Key Levels</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                {/* Resistance */}
                <div>
                  <div style={{ fontSize: 9, color: 'var(--kt-dn)', textTransform: 'uppercase', marginBottom: 6 }}>Resistance</div>
                  {signal.levels.resistance.map((r, i) => (
                    <div key={i} className="mono" style={{ fontSize: 'var(--sm)', padding: '4px 8px', marginBottom: 4, borderRadius: 4, background: 'rgba(239,68,68,.08)', color: 'var(--kt-dn)' }}>
                      {formatPrice(r)}
                    </div>
                  ))}
                </div>

                {/* Support */}
                <div>
                  <div style={{ fontSize: 9, color: 'var(--kt-up)', textTransform: 'uppercase', marginBottom: 6 }}>Support</div>
                  {signal.levels.support.map((s, i) => (
                    <div key={i} className="mono" style={{ fontSize: 'var(--sm)', padding: '4px 8px', marginBottom: 4, borderRadius: 4, background: 'rgba(34,197,94,.08)', color: 'var(--kt-up)' }}>
                      {formatPrice(s)}
                    </div>
                  ))}
                </div>

                {/* FVGs */}
                <div>
                  <div style={{ fontSize: 9, color: 'var(--kt-gold)', textTransform: 'uppercase', marginBottom: 6 }}>Fair Value Gaps</div>
                  {signal.levels.fvgs.slice(-3).map((f, i) => (
                    <div key={i} style={{ padding: '4px 8px', marginBottom: 4, borderRadius: 4, background: f.type === 'bull' ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)' }}>
                      <span className="mono" style={{ fontSize: 'var(--xs)', color: f.type === 'bull' ? 'var(--kt-up)' : 'var(--kt-dn)' }}>
                        {f.type === 'bull' ? '▲' : '▼'} {formatPrice(f.bottom)} - {formatPrice(f.top)}
                      </span>
                      <span style={{ fontSize: 9, color: 'var(--kt-muted)', marginLeft: 6 }}>({f.gap.toFixed(1)}pts)</span>
                    </div>
                  ))}
                </div>

                {/* Order Blocks */}
                <div>
                  <div style={{ fontSize: 9, color: 'var(--kt-gold)', textTransform: 'uppercase', marginBottom: 6 }}>Order Blocks</div>
                  {signal.levels.orderBlocks.slice(-3).map((o, i) => (
                    <div key={i} style={{ padding: '4px 8px', marginBottom: 4, borderRadius: 4, background: o.type === 'bull_ob' ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)' }}>
                      <span className="mono" style={{ fontSize: 'var(--xs)', color: o.type === 'bull_ob' ? 'var(--kt-up)' : 'var(--kt-dn)' }}>
                        {o.type === 'bull_ob' ? '🟢 BULL OB' : '🔴 BEAR OB'} {formatPrice(o.low)} - {formatPrice(o.high)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Equilibrium */}
              <div style={{ marginTop: 10, padding: '6px 10px', borderRadius: 6, background: 'rgba(245,158,11,.06)', borderLeft: '3px solid var(--kt-gold)', fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
                Equilibrium: <span className="mono" style={{ color: 'var(--kt-text)' }}>{formatPrice(signal.levels.equilibrium)}</span>
              </div>
            </div>
          </div>

          {/* ═══ SETUPS ═══ */}
          <div className="kt-card">
            <div className="kt-card-pad">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <AlertTriangle size={16} style={{ color: 'var(--kt-gold)' }} />
                <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>Trade Setups</span>
                {signal.setups.length === 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>No setups — wait for pullback</span>
                )}
              </div>

              {signal.setups.map((setup, i) => (
                <div key={i} style={{
                  padding: 12,
                  marginBottom: 10,
                  borderRadius: 8,
                  border: `1px solid ${setup.type === 'long' ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)'}`,
                  background: setup.type === 'long' ? 'rgba(34,197,94,.04)' : 'rgba(239,68,68,.04)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span className={setup.type === 'long' ? 'badge-bull' : 'badge-bear'} style={{ fontSize: 'var(--xs)', fontWeight: 700 }}>
                      {setup.type.toUpperCase()}
                    </span>
                    {setup.status === 'active' ? (
                      <CheckCircle size={12} style={{ color: 'var(--kt-up)' }} />
                    ) : (
                      <Clock size={12} style={{ color: 'var(--kt-muted)' }} />
                    )}
                    <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
                      {setup.status === 'active' ? 'ACTIVE' : 'WAITING'}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
                      {setup.reason}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--kt-muted)' }}>ENTRY</div>
                      <div className="mono" style={{ fontSize: 'var(--sm)', fontWeight: 600 }}>{formatPrice(setup.entry)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--kt-muted)' }}>STOP LOSS</div>
                      <div className="mono" style={{ fontSize: 'var(--sm)', fontWeight: 600, color: 'var(--kt-dn)' }}>{formatPrice(setup.sl)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--kt-muted)' }}>TARGET</div>
                      <div className="mono" style={{ fontSize: 'var(--sm)', fontWeight: 600, color: 'var(--kt-up)' }}>{formatPrice(setup.tp)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--kt-muted)' }}>R:R</div>
                      <div className="mono" style={{ fontSize: 'var(--sm)', fontWeight: 700, color: setup.rr >= 2 ? 'var(--kt-up)' : 'var(--kt-gold)' }}>{setup.rr}:1</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {setup.confluence.map((c, j) => (
                      <span key={j} className="kt-tag" style={{ fontSize: 9 }}>{c}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ═══ REASONING ═══ */}
          {signal.reasoning && (
            <div className="kt-card">
              <div className="kt-card-pad">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Target size={16} style={{ color: 'var(--kt-gold)' }} />
                  <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>Reasoning</span>
                </div>

                {/* Summary */}
                <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(245,158,11,.06)', borderLeft: '3px solid var(--kt-gold)', marginBottom: 12 }}>
                  <div style={{ fontSize: 'var(--sm)', color: 'var(--kt-text)', lineHeight: 1.5 }}>
                    {signal.reasoning.summary}
                  </div>
                </div>

                {/* Detail Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                  <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,.03)' }}>
                    <div style={{ fontSize: 9, color: 'var(--kt-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Structure</div>
                    <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-text2)', lineHeight: 1.4 }}>{signal.reasoning.structure}</div>
                  </div>
                  <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,.03)' }}>
                    <div style={{ fontSize: 9, color: 'var(--kt-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Multi-TF</div>
                    <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-text2)', lineHeight: 1.4 }}>{signal.reasoning.multiTf}</div>
                  </div>
                  <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,.03)' }}>
                    <div style={{ fontSize: 9, color: 'var(--kt-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Zone</div>
                    <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-text2)', lineHeight: 1.4 }}>{signal.reasoning.zoneNote}</div>
                  </div>
                  {signal.reasoning.candlePattern && (
                    <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,.03)' }}>
                      <div style={{ fontSize: 9, color: 'var(--kt-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Candle Pattern</div>
                      <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-text2)', lineHeight: 1.4 }}>{signal.reasoning.candlePattern}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══ SIGNAL HISTORY ═══ */}
          {history.length > 0 && (
            <div className="kt-card">
              <div className="kt-card-pad">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Clock size={16} style={{ color: 'var(--kt-gold)' }} />
                  <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>Signal History</span>
                  <span className="kt-tag" style={{ fontSize: 9, marginLeft: 'auto' }}>{history.length} signals</span>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="kt-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Time</th>
                        <th style={{ textAlign: 'left' }}>Bias</th>
                        <th style={{ textAlign: 'right' }}>Price</th>
                        <th style={{ textAlign: 'right' }}>Entry</th>
                        <th style={{ textAlign: 'right' }}>SL</th>
                        <th style={{ textAlign: 'right' }}>TP</th>
                        <th style={{ textAlign: 'right' }}>R:R</th>
                        <th style={{ textAlign: 'center' }}>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.id}>
                          <td style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
                            {new Date(h.created_at).toLocaleString('id-ID', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
                          </td>
                          <td>
                            <span className={h.bias === 'bullish' ? 'badge-bull' : h.bias === 'bearish' ? 'badge-bear' : 'kt-tag'} style={{ fontSize: 9 }}>
                              {h.bias.toUpperCase()}
                            </span>
                          </td>
                          <td className="mono" style={{ textAlign: 'right', fontSize: 'var(--xs)' }}>{formatPrice(h.price)}</td>
                          <td className="mono" style={{ textAlign: 'right', fontSize: 'var(--xs)' }}>{formatPrice(h.entry)}</td>
                          <td className="mono" style={{ textAlign: 'right', fontSize: 'var(--xs)', color: 'var(--kt-dn)' }}>{formatPrice(h.sl)}</td>
                          <td className="mono" style={{ textAlign: 'right', fontSize: 'var(--xs)', color: 'var(--kt-up)' }}>{formatPrice(h.tp)}</td>
                          <td className="mono" style={{ textAlign: 'right', fontSize: 'var(--xs)' }}>{h.rr}:1</td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: 9, fontWeight: 600, color: resultColor(h.result), textTransform: 'uppercase' }}>
                              {h.result.replace('_', ' ')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(245,158,11,.04)', borderLeft: '3px solid var(--kt-gold)', fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
            ⚠️ This is automated SMC/ICT analysis, not financial advice. Always do your own research before trading.
          </div>
        </>
      )}
    </div>
  )
}
