import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Crosshair, Clock, TrendingUp, TrendingDown, Minus, Target, Layers } from 'lucide-react'
import { api } from '../../lib/api'

const TIMEFRAMES = [
  { key: '1D', label: 'Daily' },
  { key: '4H', label: '4H' },
  { key: '1H', label: '1H' },
] as const

type TFKey = typeof TIMEFRAMES[number]['key']

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

function BiasIcon({ bias }: { bias: string }) {
  if (bias === 'bullish') return <TrendingUp size={16} style={{ color: 'var(--kt-up)' }} />
  if (bias === 'bearish') return <TrendingDown size={16} style={{ color: 'var(--kt-dn)' }} />
  return <Minus size={16} style={{ color: 'var(--kt-gold)' }} />
}

function getDecimals(symbol: string): number {
  if (symbol.includes('JPY') || symbol.includes('IDR')) return 2
  if (symbol.includes('XAU')) return 2
  return 5  // forex pairs: 5 decimals
}

function fmt(val: number, symbol: string): string {
  return val.toFixed(getDecimals(symbol))
}

function SMCPanel({ data }: { data: SMCData }) {
  const biasClass = data.bias === 'bullish' ? 'badge-bull' : data.bias === 'bearish' ? 'badge-bear' : 'badge-neutral'
  const pdColor = data.premiumDiscount === 'premium' ? 'var(--kt-dn)' : 'var(--kt-up)'
  const dec = getDecimals(data.symbol)

  const levelClass = (type: string) => {
    if (type === 'bullish_ob') return 'ob-bull'
    if (type === 'bearish_ob') return 'ob-bear'
    if (type === 'bullish_fvg') return 'fvg-bull'
    if (type === 'bearish_fvg') return 'fvg-bear'
    if (type === 'equilibrium') return 'eq'
    if (type.startsWith('fib')) return 'fib'
    if (type.startsWith('liquidity')) return 'liq'
    return ''
  }

  return (
    <div className="kt-panel" id={`smc-${data.symbol.replace('/', '-')}`}>
      <div className="kt-panel-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="code" style={{ fontSize: 'var(--md)', fontWeight: 600 }}>{data.symbol}</span>
          <span className={biasClass}>{data.bias.toUpperCase()}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span className="kt-stat-value">{data.confidence}%</span>
          <span className="kt-stat-label" style={{ margin: 0 }}>confidence</span>
        </div>
      </div>

      <div className="kt-panel-body">
        {/* Bias / Zone / KillZone */}
        <div className="kt-stat-grid kt-stat-grid-3" style={{ marginBottom: 16 }}>
          <div className="kt-stat">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BiasIcon bias={data.bias} />
              <div>
                <div className="kt-stat-label" style={{ marginBottom: 2 }}>Bias</div>
                <div style={{
                  color: data.bias === 'bullish' ? 'var(--kt-up)' : data.bias === 'bearish' ? 'var(--kt-dn)' : 'var(--kt-gold)',
                  fontSize: 'var(--md)', fontWeight: 600,
                }}>
                  {data.bias.charAt(0).toUpperCase() + data.bias.slice(1)}
                </div>
              </div>
            </div>
          </div>
          <div className="kt-stat">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={16} style={{ color: pdColor }} />
              <div>
                <div className="kt-stat-label" style={{ marginBottom: 2 }}>Zone</div>
                <div style={{ color: pdColor, fontSize: 'var(--md)', fontWeight: 600 }}>
                  {data.premiumDiscount.charAt(0).toUpperCase() + data.premiumDiscount.slice(1)}
                </div>
              </div>
            </div>
          </div>
          <div className="kt-stat">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={16} style={{ color: data.killZone !== 'none' ? 'var(--kt-up)' : 'var(--kt-muted)' }} />
              <div>
                <div className="kt-stat-label" style={{ marginBottom: 2 }}>Kill Zone</div>
                <div style={{
                  color: data.killZone !== 'none' ? 'var(--kt-up)' : 'var(--kt-text2)',
                  fontSize: 'var(--md)', fontWeight: 600,
                }}>
                  {data.killZone.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bull/Bear Score */}
        <div className="kt-grid-2" style={{ marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="kt-stat-label" style={{ margin: 0 }}>Bull Score</span>
              <span style={{ color: 'var(--kt-up)', fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)' }}>{data.bullScore.toFixed(0)}</span>
            </div>
            <div className="kt-bar-track">
              <div className="kt-bar-fill up" style={{ width: `${data.bullScore}%` }} />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="kt-stat-label" style={{ margin: 0 }}>Bear Score</span>
              <span style={{ color: 'var(--kt-dn)', fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)' }}>{data.bearScore.toFixed(0)}</span>
            </div>
            <div className="kt-bar-track">
              <div className="kt-bar-fill dn" style={{ width: `${data.bearScore}%` }} />
            </div>
          </div>
        </div>

        {/* Structure */}
        <div style={{ marginBottom: 16 }}>
          <div className="kt-stat-label" style={{ marginBottom: 8 }}>Structure</div>
          <div className="kt-stat-grid kt-stat-grid-3">
            {[
              { label: 'EMA Bias', value: data.structure.emaBias },
              { label: 'Long-term', value: data.structure.longTermBias },
              { label: 'Price vs EMA', value: data.structure.priceVsEma },
            ].map(s => (
              <div key={s.label} className="kt-stat" style={{ textAlign: 'center' }}>
                <div className="kt-stat-label" style={{ marginBottom: 2 }}>{s.label}</div>
                <div style={{
                  color: s.value === 'bullish' ? 'var(--kt-up)' : s.value === 'bearish' ? 'var(--kt-dn)' : 'var(--kt-gold)',
                  fontSize: 'var(--sm)', fontWeight: 700, fontFamily: 'var(--font-mono)',
                }}>
                  {s.value.toUpperCase()}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Signals */}
        {data.signals.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="kt-stat-label" style={{ marginBottom: 8 }}>Signals</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.signals.map((sig, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'start', gap: 8, fontSize: 'var(--md)' }}>
                  <span style={{ color: 'var(--kt-up)', marginTop: 1 }}>→</span>
                  <span style={{ color: 'var(--kt-text2)' }}>{sig}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Key Levels */}
        {data.levels.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="kt-stat-label" style={{ marginBottom: 8 }}>Key Levels</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {data.levels.map((level, i) => (
                <div key={i} className={`kt-level-row ${levelClass(level.type)}`}>
                  <span style={{ color: 'var(--kt-text2)', fontSize: 'var(--sm)' }}>{level.label}</span>
                  <span style={{ color: 'var(--kt-text)', fontSize: 'var(--sm)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {fmt(level.zone[0], data.symbol)} — {fmt(level.zone[1], data.symbol)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trade Setup */}
        {data.tradeSetup && (
          <div className="kt-card" style={{ marginBottom: 0 }}>
            <div className="kt-card-pad">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Target size={13} style={{ color: 'var(--kt-up)' }} />
                <span style={{ color: 'var(--kt-text)', fontSize: 'var(--sm)', fontWeight: 600 }}>Trade Setup</span>
                <span className={data.tradeSetup.direction === 'bullish' ? 'badge-bull' : 'badge-bear'} style={{ marginLeft: 'auto' }}>
                  {data.tradeSetup.direction.toUpperCase()}
                </span>
              </div>
              <div className="kt-grid-2" style={{ gap: 8 }}>
                {[
                  { label: 'Entry', value: fmt(data.tradeSetup.entry, data.symbol), color: 'var(--kt-text)' },
                  { label: 'Stop Loss', value: fmt(data.tradeSetup.sl, data.symbol), color: 'var(--kt-dn)' },
                  { label: `TP1 (R:R ${data.tradeSetup.rr1?.toFixed(1)})`, value: fmt(data.tradeSetup.tp1, data.symbol), color: 'var(--kt-up)' },
                  { label: `TP2 (R:R ${data.tradeSetup.rr2?.toFixed(1)})`, value: fmt(data.tradeSetup.tp2, data.symbol), color: 'var(--kt-up)' },
                  { label: 'TP3', value: fmt(data.tradeSetup.tp3, data.symbol), color: 'var(--kt-up)' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)' }}>{r.label}</span>
                    <span style={{ color: r.color, fontSize: 'var(--sm)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Meta indicators */}
        {data.meta && (
          <div className="kt-stat-grid kt-stat-grid-5" style={{ marginTop: 14 }}>
            {[
              { label: 'RSI', value: data.meta.rsi?.toFixed(1) },
              { label: 'ATR', value: data.meta.atr?.toFixed(dec) },
              { label: 'EMA20', value: data.meta.ema20?.toFixed(dec) },
              { label: 'EMA50', value: data.meta.ema50?.toFixed(dec) },
              { label: 'SMA200', value: data.meta.sma200?.toFixed(dec) },
            ].map(m => (
              <div key={m.label} className="kt-stat" style={{ textAlign: 'center' }}>
                <div className="kt-stat-label" style={{ marginBottom: 2 }}>{m.label}</div>
                <div style={{ color: 'var(--kt-text2)', fontSize: 'var(--sm)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  {m.value ?? '—'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Decision() {
  const [tf, setTf] = useState<TFKey>('1D')

  const { data: smcData, isLoading } = useQuery<SMCData[]>({
    queryKey: ['smc-batch', tf],
    queryFn: () => api(`/api/smc/batch?tf=${tf}`),
    refetchInterval: 120_000,
    retry: false,
  })

  const pairs = smcData ?? []

  return (
    <div>
      <div className="kt-route-head">
        <div>
          <div className="kt-kicker">Smart Money Concepts</div>
          <h1>SMC Analysis</h1>
          <p>Structure, Order Blocks, FVG, Kill Zones — per-pair breakdown</p>
        </div>
        <div className="kt-route-actions">
          {/* Timeframe selector */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--kt-bg2)', borderRadius: 8, padding: 3, border: '1px solid var(--kt-border)' }}>
            {TIMEFRAMES.map(t => (
              <button
                key={t.key}
                onClick={() => setTf(t.key)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  fontSize: 'var(--xs)',
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  background: tf === t.key ? 'var(--kt-gold)' : 'transparent',
                  color: tf === t.key ? '#000' : 'var(--kt-text2)',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="kt-status-dot" />
          <span>Auto-refresh 2min</span>
        </div>
      </div>

      {isLoading ? (
        <div className="kt-grid-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="kt-panel">
              <div className="kt-panel-body">
                <div className="skeleton w-20 h-3 mb-3" />
                <div className="skeleton w-32 h-8 mb-3" />
                <div className="skeleton w-full h-40" />
              </div>
            </div>
          ))}
        </div>
      ) : pairs.length > 0 ? (
        <div className="kt-grid-2">
          {pairs.map((pair) => (
            <SMCPanel key={`${pair.symbol}-${tf}`} data={pair} />
          ))}
        </div>
      ) : (
        <div className="kt-panel">
          <div className="kt-empty">
            <Crosshair size={32} />
            <p>No SMC data available</p>
            <p style={{ fontSize: 'var(--xs)', marginTop: 4, color: 'var(--kt-dim)' }}>Data will appear when the API returns analysis</p>
          </div>
        </div>
      )}
    </div>
  )
}
