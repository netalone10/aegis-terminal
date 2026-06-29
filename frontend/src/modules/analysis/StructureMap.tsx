import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Map, Crosshair, ChevronDown } from 'lucide-react'
import { api } from '../../lib/api'

const SYMBOLS = ['XAU/USD', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/IDR', 'USD/CHF'] as const
type Symbol = typeof SYMBOLS[number]

type SMCData = {
  symbol: string
  bias: string
  confidence: number
  premiumDiscount: string
  killZone: string
  bullScore: number
  bearScore: number
  signals: string[]
  levels: { type: string; zone: [number, number]; label: string; strength: string }[]
  tradeSetup: {
    direction: string
    entry: number
    sl: number
    tp1: number
    tp2: number
    tp3: number
    rr1: number
    rr2: number
  } | null
  structure: {
    emaBias: string
    longTermBias: string
    priceVsEma: string
  }
  meta: {
    atr: number
    rsi: number
    ema20: number
    ema50: number
    sma200: number
  }
}

function getDecimals(symbol: string): number {
  if (symbol.includes('JPY') || symbol.includes('IDR')) return 2
  if (symbol.includes('XAU')) return 2
  return 5
}

function fmt(val: number, symbol: string): string {
  return val.toFixed(getDecimals(symbol))
}

/* ── level type → visual config ── */
function levelStyle(type: string): {
  color: string
  borderStyle: string
  height: number
  opacity: number
} {
  if (type === 'bullish_ob') return { color: '#22c55e', borderStyle: 'solid', height: 6, opacity: 0.85 }
  if (type === 'bearish_ob') return { color: '#ef4444', borderStyle: 'solid', height: 6, opacity: 0.85 }
  if (type === 'bullish_fvg' || type === 'bearish_fvg') return { color: '#f59e0b', borderStyle: 'dashed', height: 4, opacity: 0.8 }
  if (type === 'equilibrium') return { color: '#eab308', borderStyle: 'solid', height: 2, opacity: 1 }
  if (type.startsWith('fib')) return { color: '#3b82f6', borderStyle: 'dotted', height: 2, opacity: 0.7 }
  if (type.startsWith('liquidity')) return { color: type.includes('buy') ? '#22c55e' : '#ef4444', borderStyle: 'solid', height: 1, opacity: 0.5 }
  return { color: 'var(--kt-muted)', borderStyle: 'solid', height: 3, opacity: 0.5 }
}

function levelLabel(type: string): string {
  if (type === 'bullish_ob') return 'Bullish OB'
  if (type === 'bearish_ob') return 'Bearish OB'
  if (type === 'bullish_fvg') return 'Bullish FVG'
  if (type === 'bearish_fvg') return 'Bearish FVG'
  if (type === 'equilibrium') return 'Equilibrium'
  if (type.startsWith('fib')) return type.replace('fib_', 'Fib ').replace('_', ' ')
  if (type.startsWith('liquidity')) return type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
  return type
}

/* ── determine context zone ── */
function getContext(levels: SMCData['levels'], price: number, pd: string): {
  text: string
  emoji: string
  color: string
} {
  const tolerance = price * 0.003 // 0.3% proximity

  const nearBullOB = levels.some(
    l => l.type === 'bullish_ob' && price >= l.zone[0] - tolerance && price <= l.zone[1] + tolerance
  )
  const nearBearOB = levels.some(
    l => l.type === 'bearish_ob' && price >= l.zone[0] - tolerance && price <= l.zone[1] + tolerance
  )

  if (pd === 'discount' && nearBullOB) return { text: 'BUY ZONE — Price in demand area', emoji: '🟢', color: 'var(--kt-up)' }
  if (pd === 'premium' && nearBearOB) return { text: 'SELL ZONE — Price in supply area', emoji: '🔴', color: 'var(--kt-dn)' }
  return { text: 'NEUTRAL — Wait for setup', emoji: '🟡', color: 'var(--kt-gold)' }
}

/* ── Ladder Component ── */
function PriceLadder({ data }: { data: SMCData }) {
  const dec = getDecimals(data.symbol)
  const price = data.meta?.ema20 ?? 0 // current approx price from ema20

  // Compute price range from all levels + current price
  const allPrices = [price]
  for (const lvl of data.levels) {
    allPrices.push(lvl.zone[0], lvl.zone[1])
  }
  const minP = Math.min(...allPrices)
  const maxP = Math.max(...allPrices)
  const range = maxP - minP || 1
  const padding = range * 0.08
  const viewMin = minP - padding
  const viewMax = maxP + padding
  const viewRange = viewMax - viewMin

  // Price-to-percent (top = 100%, high price; bottom = 0%, low price)
  const toPct = (p: number) => ((viewMax - p) / viewRange) * 100

  // Zone width as percent of chart (max zone width = 60%)
  const maxZoneW = Math.max(...data.levels.map(l => l.zone[1] - l.zone[0]), 0.0001)
  const toWidth = (z: [number, number]) => Math.max(((z[1] - z[0]) / maxZoneW) * 60, 4)

  // Price scale ticks
  const tickCount = 8
  const step = viewRange / (tickCount - 1)
  const ticks = Array.from({ length: tickCount }, (_, i) => viewMax - step * i)

  const ctx = getContext(data.levels, price, data.premiumDiscount)

  return (
    <div className="kt-card" style={{ overflow: 'hidden' }}>
      <div className="kt-card-pad">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <span className="code" style={{ fontSize: 'var(--md)', fontWeight: 700 }}>{data.symbol}</span>
          <span className={data.bias === 'bullish' ? 'badge-bull' : data.bias === 'bearish' ? 'badge-bear' : 'badge-neutral'}>
            {data.bias.toUpperCase()}
          </span>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--sm)', color: 'var(--kt-text)' }}>
            {fmt(price, data.symbol)}
          </span>
        </div>

        {/* Context banner */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          borderRadius: 8, marginBottom: 14, fontSize: 'var(--sm)', fontWeight: 600,
          background: ctx.color === 'var(--kt-up)' ? 'rgba(34,197,94,0.1)' : ctx.color === 'var(--kt-dn)' ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)',
          border: `1px solid ${ctx.color === 'var(--kt-up)' ? 'rgba(34,197,94,0.25)' : ctx.color === 'var(--kt-dn)' ? 'rgba(239,68,68,0.25)' : 'rgba(234,179,8,0.25)'}`,
          color: ctx.color,
        }}>
          <span>{ctx.emoji}</span>
          <span>{ctx.text}</span>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14, fontSize: 'var(--xs)' }}>
          {[
            { color: '#22c55e', label: 'Bullish OB', dash: 'solid' },
            { color: '#ef4444', label: 'Bearish OB', dash: 'solid' },
            { color: '#f59e0b', label: 'FVG', dash: 'dashed' },
            { color: '#eab308', label: 'Equilibrium', dash: 'solid' },
            { color: '#3b82f6', label: 'Fib', dash: 'dotted' },
          ].map(l => (
            <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--kt-text2)' }}>
              <span style={{
                display: 'inline-block', width: 18, height: 2,
                borderTop: `2px ${l.dash} ${l.color}`,
              }} />
              {l.label}
            </span>
          ))}
        </div>

        {/* Ladder */}
        <div style={{ position: 'relative', height: 500, display: 'flex', overflowX: 'auto' }}>
          {/* Price scale (left) */}
          <div style={{
            position: 'relative', width: 70, minWidth: 70, flexShrink: 0,
            fontFamily: 'var(--font-mono)', fontSize: 'var(--xs)', color: 'var(--kt-text2)',
          }}>
            {ticks.map((t, i) => (
              <div key={i} style={{
                position: 'absolute', top: `${toPct(t)}%`, right: 6,
                transform: 'translateY(-50%)', whiteSpace: 'nowrap',
              }}>
                {fmt(t, data.symbol)}
              </div>
            ))}
          </div>

          {/* Chart area */}
          <div style={{ flex: 1, position: 'relative', borderLeft: '1px solid var(--kt-border)', minHeight: 500 }}>
            {/* Horizontal grid lines */}
            {ticks.map((t, i) => (
              <div key={i} style={{
                position: 'absolute', top: `${toPct(t)}%`, left: 0, right: 0,
                borderTop: '1px solid var(--kt-border)', opacity: 0.3,
              }} />
            ))}

            {/* Level bars */}
            {data.levels.map((lvl, i) => {
              const st = levelStyle(lvl.type)
              const top = toPct((lvl.zone[0] + lvl.zone[1]) / 2)
              const width = toWidth(lvl.zone)
              return (
                <div key={i} style={{ position: 'absolute', top: `${top}%`, left: '5%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', width: '90%' }}>
                  <div style={{
                    width: `${width}%`,
                    height: st.height,
                    background: st.color,
                    opacity: st.opacity,
                    borderTop: st.borderStyle === 'dashed' || st.borderStyle === 'dotted'
                      ? `2px ${st.borderStyle} ${st.color}` : 'none',
                    borderBottom: st.borderStyle === 'dashed' || st.borderStyle === 'dotted'
                      ? `2px ${st.borderStyle} ${st.color}` : 'none',
                    borderRadius: 2,
                    boxShadow: `0 0 6px ${st.color}44`,
                  }} />
                </div>
              )
            })}

            {/* Current price marker */}
            <div style={{
              position: 'absolute', top: `${toPct(price)}%`, left: 0, right: 0,
              transform: 'translateY(-50%)', zIndex: 10,
            }}>
              <div style={{
                height: 3,
                background: 'linear-gradient(90deg, var(--kt-gold), #fff, var(--kt-gold))',
                boxShadow: '0 0 12px var(--kt-gold), 0 0 4px var(--kt-gold)',
              }} />
              <div style={{
                position: 'absolute', right: -4, top: -8,
                background: 'var(--kt-gold)', color: '#000',
                fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
                padding: '2px 6px', borderRadius: 4,
                whiteSpace: 'nowrap',
              }}>
                {fmt(price, data.symbol)}
              </div>
            </div>
          </div>

          {/* Zone labels (right) */}
          <div style={{
            position: 'relative', width: 90, minWidth: 90, flexShrink: 0,
            borderLeft: '1px solid var(--kt-border)', fontSize: 'var(--xs)',
          }}>
            {data.levels.slice(0, 12).map((lvl, i) => {
              const top = toPct((lvl.zone[0] + lvl.zone[1]) / 2)
              const st = levelStyle(lvl.type)
              return (
                <div key={i} style={{
                  position: 'absolute', top: `${top}%`, left: 6,
                  transform: 'translateY(-50%)', color: st.color,
                  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                  whiteSpace: 'nowrap', opacity: 0.85,
                }}>
                  {levelLabel(lvl.type)}
                </div>
              )
            })}
          </div>
        </div>

        {/* Meta strip */}
        {data.meta && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--kt-border)' }}>
            {[
              { label: 'RSI', value: data.meta.rsi?.toFixed(1) },
              { label: 'ATR', value: data.meta.atr?.toFixed(dec) },
              { label: 'EMA20', value: data.meta.ema20?.toFixed(dec) },
              { label: 'EMA50', value: data.meta.ema50?.toFixed(dec) },
              { label: 'SMA200', value: data.meta.sma200?.toFixed(dec) },
              { label: 'Zone', value: data.premiumDiscount.charAt(0).toUpperCase() + data.premiumDiscount.slice(1) },
              { label: 'Confidence', value: `${data.confidence}%` },
            ].map(m => (
              <span key={m.label} style={{ display: 'flex', gap: 4, fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)' }}>
                <span style={{ color: 'var(--kt-muted)' }}>{m.label}:</span>
                <span style={{ color: 'var(--kt-text2)', fontWeight: 600 }}>{m.value ?? '—'}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Main Component ── */
export default function StructureMap() {
  const [symbol, setSymbol] = useState<Symbol>('XAU/USD')
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const { data: smcData, isLoading, error } = useQuery<SMCData[]>({
    queryKey: ['smc-batch-structure', '1D'],
    queryFn: () => api('/api/smc/batch?tf=1D'),
    refetchInterval: 120_000,
    retry: false,
  })

  const selectedData = useMemo(() => {
    if (!smcData) return null
    return smcData.find(d => d.symbol === symbol) ?? null
  }, [smcData, symbol])

  return (
    <div>
      {/* Symbol selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            onBlur={() => setTimeout(() => setDropdownOpen(false), 200)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', borderRadius: 8,
              background: 'var(--kt-bg2)', border: '1px solid var(--kt-border)',
              color: 'var(--kt-text)', fontSize: 'var(--sm)', fontWeight: 600,
              fontFamily: 'var(--font-mono)', cursor: 'pointer',
              minWidth: 140,
            }}
          >
            <Map size={14} style={{ color: 'var(--kt-gold)' }} />
            {symbol}
            <ChevronDown size={14} style={{ marginLeft: 'auto', color: 'var(--kt-muted)' }} />
          </button>
          {dropdownOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50,
              background: 'var(--kt-bg2)', border: '1px solid var(--kt-border)',
              borderRadius: 8, overflow: 'hidden', minWidth: 160,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}>
              {SYMBOLS.map(s => (
                <button
                  key={s}
                  onClick={() => { setSymbol(s); setDropdownOpen(false) }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '8px 14px', border: 'none', cursor: 'pointer',
                    fontFamily: 'var(--font-mono)', fontSize: 'var(--sm)',
                    background: s === symbol ? 'var(--kt-gold)' : 'transparent',
                    color: s === symbol ? '#000' : 'var(--kt-text)',
                    fontWeight: s === symbol ? 700 : 400,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (s !== symbol) e.currentTarget.style.background = 'var(--kt-bg)' }}
                  onMouseLeave={e => { if (s !== symbol) e.currentTarget.style.background = 'transparent' }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
          <Crosshair size={12} />
          <span>Market Peta Struktur — 1D timeframe</span>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="kt-card">
          <div className="kt-card-pad">
            <div className="skeleton w-20 h-3 mb-3" />
            <div className="skeleton w-32 h-8 mb-3" />
            <div className="skeleton w-full" style={{ height: 500 }} />
          </div>
        </div>
      ) : error ? (
        <div className="kt-card">
          <div className="kt-card-pad" style={{ textAlign: 'center', padding: 40 }}>
            <Crosshair size={32} style={{ color: 'var(--kt-muted)', marginBottom: 12 }} />
            <p style={{ color: 'var(--kt-text2)' }}>Failed to load structure data</p>
            <p style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', marginTop: 4 }}>
              Check API connection and try again
            </p>
          </div>
        </div>
      ) : selectedData ? (
        <PriceLadder data={selectedData} />
      ) : (
        <div className="kt-card">
          <div className="kt-card-pad" style={{ textAlign: 'center', padding: 40 }}>
            <Map size={32} style={{ color: 'var(--kt-muted)', marginBottom: 12 }} />
            <p style={{ color: 'var(--kt-text2)' }}>No data for {symbol}</p>
            <p style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', marginTop: 4 }}>
              Select a different pair or wait for data refresh
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
