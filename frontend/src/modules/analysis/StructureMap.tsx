import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Map, Crosshair, Clock, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { api } from '../../lib/api'

/* ── Constants ── */
const PAIRS = [
  'XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY',
  'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
] as const
const TIMEFRAMES = ['1D', '4H', '1H', '15m'] as const
type Timeframe = typeof TIMEFRAMES[number]

/* ── Types ── */
interface Level {
  type: string
  zone: [number, number]
  label: string
  strength: string
}

interface StructurePoint {
  type: 'HH' | 'HL' | 'LH' | 'LL' | 'sw_high' | 'sw_low'
  price: number
  index: number
}

interface SMCData {
  symbol: string
  bias: string
  confidence: number
  premiumDiscount?: string
  killZone?: string
  bullScore?: number
  bearScore?: number
  signals: string[]
  levels: Level[]
  tradeSetup?: {
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
    swingHigh?: number
    swingLow?: number
    structureBreak?: string
    structurePoints?: StructurePoint[]
  }
  meta: {
    atr: number
    rsi: number
    ema20: number
    ema50: number
    sma200: number
  }
}

/* ── Helpers ── */
function getDecimals(pair: string): number {
  if (pair.includes('JPY') || pair.includes('XAU') || pair.includes('XAG')) return 2
  return 5
}

function fmt(val: number, pair: string): string {
  return val.toFixed(getDecimals(pair))
}

function isBullishStructure(data: SMCData): boolean {
  return data.bias === 'bullish' ||
    (data.structure?.emaBias === 'bullish' && data.structure?.longTermBias === 'bullish')
}

function getStructureLabel(data: SMCData): string {
  const pts = data.structure?.structurePoints ?? []
  const last4 = pts.slice(-4)
  if (last4.length >= 4) {
    const types = last4.map(p => p.type).join('/')
    if (types.includes('HH') && types.includes('HL')) return 'BULL STRUCTURE'
    if (types.includes('LH') && types.includes('LL')) return 'BEAR STRUCTURE'
  }
  if (data.bias === 'bullish') return 'BULL STRUCTURE'
  if (data.bias === 'bearish') return 'BEAR STRUCTURE'
  return 'NEUTRAL'
}

/* ── Level visual config ── */
function levelStyle(type: string): {
  color: string
  borderStyle: string
  height: number
  opacity: number
  label: string
  icon: string
} {
  switch (type) {
    case 'bullish_ob': return { color: '#22c55e', borderStyle: 'solid', height: 10, opacity: 0.9, label: 'Bullish OB', icon: '🟢' }
    case 'bearish_ob': return { color: '#ef4444', borderStyle: 'solid', height: 10, opacity: 0.9, label: 'Bearish OB', icon: '🔴' }
    case 'bullish_fvg': return { color: '#4ade80', borderStyle: 'dashed', height: 8, opacity: 0.85, label: 'Bullish FVG', icon: '△' }
    case 'bearish_fvg': return { color: '#f87171', borderStyle: 'dashed', height: 8, opacity: 0.85, label: 'Bearish FVG', icon: '▽' }
    case 'equilibrium': return { color: '#ffffff', borderStyle: 'dashed', height: 3, opacity: 0.8, label: 'EQ', icon: '—' }
    case 'liquidity_buy': case 'bsl': return { color: '#f59e0b', borderStyle: 'dashed', height: 2, opacity: 0.9, label: 'BSL', icon: '⚡' }
    case 'liquidity_sell': case 'ssl': return { color: '#f59e0b', borderStyle: 'dashed', height: 2, opacity: 0.9, label: 'SSL', icon: '⚡' }
    default:
      if (type.startsWith('fib')) return { color: '#a855f7', borderStyle: 'dotted', height: 2, opacity: 0.75, label: type.replace('fib_', 'Fib '), icon: '◇' }
      return { color: 'var(--kt-muted)', borderStyle: 'solid', height: 3, opacity: 0.5, label: type, icon: '·' }
  }
}

/* ── Determine context zone ── */
function getContext(levels: Level[], price: number, pd?: string): {
  text: string
  emoji: string
  color: string
} {
  if (!price || !levels?.length) return { text: 'AWAITING DATA', emoji: '⏳', color: 'var(--kt-muted)' }

  const tolerance = price * 0.003

  const nearBullOB = levels.some(
    l => l.type === 'bullish_ob' && price >= l.zone[0] - tolerance && price <= l.zone[1] + tolerance
  )
  const nearBearOB = levels.some(
    l => l.type === 'bearish_ob' && price >= l.zone[0] - tolerance && price <= l.zone[1] + tolerance
  )

  if ((pd === 'discount' || pd === 'below') && nearBullOB)
    return { text: 'BUY ZONE — Price in demand area', emoji: '🟢', color: '#22c55e' }
  if ((pd === 'premium' || pd === 'above') && nearBearOB)
    return { text: 'SELL ZONE — Price in supply area', emoji: '🔴', color: '#ef4444' }
  if (pd === 'discount' || pd === 'below')
    return { text: 'DISCOUNT ZONE — Below equilibrium', emoji: '🟢', color: '#22c55e' }
  if (pd === 'premium' || pd === 'above')
    return { text: 'PREMIUM ZONE — Above equilibrium', emoji: '🔴', color: '#ef4444' }
  return { text: 'NEUTRAL — At equilibrium', emoji: '🟡', color: '#f59e0b' }
}

/* ── Connection Status Indicator ── */
function ConnectionDot({ isLive, lastUpdate }: { isLive: boolean; lastUpdate: Date | null }) {
  return (
    <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--kt-muted)]">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{
          backgroundColor: isLive ? '#22c55e' : '#ef4444',
          boxShadow: isLive ? '0 0 6px #22c55e' : '0 0 6px #ef4444',
        }}
      />
      <span>{isLive ? 'LIVE' : 'OFFLINE'}</span>
      {lastUpdate && (
        <>
          <span className="text-[var(--kt-dim)]">·</span>
          <Clock size={10} />
          <span>{lastUpdate.toLocaleTimeString()}</span>
        </>
      )}
    </div>
  )
}

/* ── Sidebar Pair Selector ── */
function PairSidebar({
  pairs,
  selected,
  onSelect,
  dataMap,
}: {
  pairs: readonly string[]
  selected: string
  onSelect: (p: string) => void
  dataMap: Record<string, SMCData>
}) {
  return (
    <div className="flex flex-col gap-1">
      {pairs.map(pair => {
        const data = dataMap[pair]
        const isSelected = pair === selected
        const bull = data ? isBullishStructure(data) : null

        return (
          <button
            key={pair}
            onClick={() => onSelect(pair)}
            className={`
              flex flex-col gap-1 px-3 py-2 rounded-lg text-left transition-all duration-150
              font-mono text-xs
              ${isSelected
                ? 'bg-[var(--kt-gold)]/15 border border-[var(--kt-gold)]/40 text-[var(--kt-gold)]'
                : 'bg-[var(--kt-bg2)] border border-[var(--kt-border)] text-[var(--kt-text)] hover:bg-[var(--kt-bg3)] hover:border-[var(--kt-border)]'
              }
            `}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold tracking-wider">{pair}</span>
              {data && (
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: bull === true ? '#22c55e' : bull === false ? '#ef4444' : 'var(--kt-muted)',
                  }}
                />
              )}
            </div>
            {data && (
              <div className="flex items-center gap-2 text-[10px]">
                <span style={{ color: bull ? '#22c55e' : bull === false ? '#ef4444' : 'var(--kt-muted)' }}>
                  {bull ? <TrendingUp size={10} /> : bull === false ? <TrendingDown size={10} /> : <Minus size={10} />}
                </span>
                <span className="text-[var(--kt-muted)]">
                  {data.meta?.ema20 ? fmt(data.meta.ema20, pair) : '—'}
                </span>
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ── Price Ladder Component ── */
function PriceLadder({ data, pair }: { data: SMCData; pair: string }) {
  const dec = getDecimals(pair)
  const price = data.meta?.ema20 ?? 0

  // Compute price range from all levels + current price
  const allPrices = [price]
  for (const lvl of data.levels) {
    allPrices.push(lvl.zone[0], lvl.zone[1])
  }
  if (data.meta?.sma200) allPrices.push(data.meta.sma200)
  if (data.meta?.ema50) allPrices.push(data.meta.ema50)

  const minP = Math.min(...allPrices)
  const maxP = Math.max(...allPrices)
  const range = maxP - minP || 1
  const padding = range * 0.1
  const viewMin = minP - padding
  const viewMax = maxP + padding
  const viewRange = viewMax - viewMin

  // Price-to-percent (top = high price, bottom = low price)
  const toPct = (p: number) => Math.max(0, Math.min(100, ((viewMax - p) / viewRange) * 100))

  // Zone width as percent of chart
  const maxZoneW = Math.max(...data.levels.map(l => l.zone[1] - l.zone[0]), 0.0001)
  const toWidth = (z: [number, number]) => Math.max(((z[1] - z[0]) / maxZoneW) * 55, 6)

  // Price scale ticks
  const tickCount = 10
  const step = viewRange / (tickCount - 1)
  const ticks = Array.from({ length: tickCount }, (_, i) => viewMax - step * i)

  const ctx = getContext(data.levels, price, data.premiumDiscount)
  const structLabel = getStructureLabel(data)
  const isBull = isBullishStructure(data)
  const structurePoints = data.structure?.structurePoints ?? []

  return (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-base font-bold text-[var(--kt-text)]">{pair}</span>
          <span
            className="px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase tracking-wider"
            style={{
              background: isBull ? 'rgba(34,197,94,0.15)' : data.bias === 'bearish' ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)',
              color: isBull ? '#22c55e' : data.bias === 'bearish' ? '#ef4444' : '#f59e0b',
              border: `1px solid ${isBull ? 'rgba(34,197,94,0.3)' : data.bias === 'bearish' ? 'rgba(239,68,68,0.3)' : 'rgba(234,179,8,0.3)'}`,
            }}
          >
            {data.bias?.toUpperCase() ?? 'NEUTRAL'}
          </span>
          <span
            className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider"
            style={{
              background: isBull ? 'rgba(34,197,94,0.1)' : data.bias === 'bearish' ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)',
              color: isBull ? '#22c55e' : data.bias === 'bearish' ? '#ef4444' : '#f59e0b',
            }}
          >
            {structLabel}
          </span>
        </div>
        <span className="font-mono text-sm font-bold text-[var(--kt-gold)]">
          {fmt(price, pair)}
        </span>
      </div>

      {/* Context banner */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold"
        style={{
          background: ctx.color === '#22c55e' ? 'rgba(34,197,94,0.1)' : ctx.color === '#ef4444' ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)',
          border: `1px solid ${ctx.color === '#22c55e' ? 'rgba(34,197,94,0.25)' : ctx.color === '#ef4444' ? 'rgba(239,68,68,0.25)' : 'rgba(234,179,8,0.25)'}`,
          color: ctx.color,
        }}
      >
        <span>{ctx.emoji}</span>
        <span>{ctx.text}</span>
      </div>

      {/* Legend */}
      <div className="flex gap-4 flex-wrap text-[10px] font-mono text-[var(--kt-muted)]">
        {[
          { color: '#22c55e', label: 'Bull OB', style: 'solid' },
          { color: '#ef4444', label: 'Bear OB', style: 'solid' },
          { color: '#4ade80', label: 'Bull FVG', style: 'dashed' },
          { color: '#f87171', label: 'Bear FVG', style: 'dashed' },
          { color: '#f59e0b', label: 'BSL/SSL', style: 'dashed' },
          { color: '#ffffff', label: 'EQ', style: 'dashed' },
          { color: '#a855f7', label: 'Fib', style: 'dotted' },
        ].map(l => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span
              className="inline-block w-4 h-[2px]"
              style={{ borderTop: `2px ${l.style} ${l.color}` }}
            />
            {l.label}
          </span>
        ))}
      </div>

      {/* Ladder */}
      <div
        className="relative rounded-lg overflow-hidden"
        style={{
          background: 'var(--kt-bg2)',
          border: '1px solid var(--kt-border)',
          height: 560,
        }}
      >
        {/* Price scale (left) */}
        <div
          className="absolute top-0 left-0 bottom-0 z-20 font-mono text-[10px] text-[var(--kt-muted)]"
          style={{ width: 64 }}
        >
          {ticks.map((t, i) => (
            <div
              key={i}
              className="absolute right-2 whitespace-nowrap"
              style={{ top: `${toPct(t)}%`, transform: 'translateY(-50%)' }}
            >
              {fmt(t, pair)}
            </div>
          ))}
        </div>

        {/* Chart area */}
        <div
          className="absolute top-0 bottom-0"
          style={{ left: 64, right: 100 }}
        >
          {/* Horizontal grid lines */}
          {ticks.map((t, i) => (
            <div
              key={i}
              className="absolute left-0 right-0"
              style={{
                top: `${toPct(t)}%`,
                borderTop: '1px solid var(--kt-border)',
                opacity: 0.2,
              }}
            />
          ))}

          {/* Level bars */}
          {data.levels.map((lvl, i) => {
            const st = levelStyle(lvl.type)
            const mid = (lvl.zone[0] + lvl.zone[1]) / 2
            const top = toPct(mid)
            const width = toWidth(lvl.zone)
            return (
              <div
                key={i}
                className="absolute flex items-center"
                style={{
                  top: `${top}%`,
                  left: '4%',
                  transform: 'translateY(-50%)',
                  width: '92%',
                  zIndex: 5,
                }}
              >
                <div
                  className="relative group cursor-pointer"
                  style={{
                    width: `${width}%`,
                    height: st.height,
                    background: st.borderStyle === 'dashed' || st.borderStyle === 'dotted'
                      ? 'transparent'
                      : `${st.color}${Math.round(st.opacity * 255).toString(16).padStart(2, '0')}`,
                    borderTop: st.borderStyle === 'dashed' || st.borderStyle === 'dotted'
                      ? `2px ${st.borderStyle} ${st.color}`
                      : 'none',
                    borderBottom: st.borderStyle === 'dashed' || st.borderStyle === 'dotted'
                      ? `2px ${st.borderStyle} ${st.color}`
                      : 'none',
                    borderRadius: 2,
                    boxShadow: st.borderStyle === 'solid' ? `0 0 8px ${st.color}44` : 'none',
                    opacity: st.opacity,
                  }}
                >
                  {/* Hover tooltip */}
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full px-2 py-1 rounded text-[9px] font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30"
                    style={{
                      background: 'var(--kt-bg)',
                      border: `1px solid ${st.color}40`,
                      color: st.color,
                      marginRight: 4,
                    }}
                  >
                    {st.label} [{fmt(lvl.zone[0], pair)} – {fmt(lvl.zone[1], pair)}]
                  </div>
                </div>
              </div>
            )
          })}

          {/* EMA lines */}
          {data.meta?.ema20 && (
            <div
              className="absolute left-0 right-0 z-4"
              style={{ top: `${toPct(data.meta.ema20)}%` }}
            >
              <div className="h-[1px] w-full" style={{ borderTop: '1px dotted #60a5fa' }} />
            </div>
          )}
          {data.meta?.ema50 && (
            <div
              className="absolute left-0 right-0 z-4"
              style={{ top: `${toPct(data.meta.ema50)}%` }}
            >
              <div className="h-[1px] w-full" style={{ borderTop: '1px dotted #f472b6' }} />
            </div>
          )}
          {data.meta?.sma200 && (
            <div
              className="absolute left-0 right-0 z-4"
              style={{ top: `${toPct(data.meta.sma200)}%` }}
            >
              <div className="h-[1px] w-full" style={{ borderTop: '1px dotted #fb923c' }} />
            </div>
          )}

          {/* Structure points (HH/HL/LH/LL annotations) */}
          {structurePoints.map((pt, i) => {
            const top = toPct(pt.price)
            const isStruct = pt.type === 'HH' || pt.type === 'HL' || pt.type === 'LH' || pt.type === 'LL'
            if (!isStruct) return null

            const isBullType = pt.type === 'HH' || pt.type === 'HL'
            return (
              <div
                key={i}
                className="absolute flex items-center gap-1 z-10"
                style={{ top: `${top}%`, right: 0, transform: 'translateY(-50%)' }}
              >
                <div
                  className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold whitespace-nowrap"
                  style={{
                    background: isBullType ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
                    color: isBullType ? '#22c55e' : '#ef4444',
                    border: `1px solid ${isBullType ? '#22c55e40' : '#ef444440'}`,
                  }}
                >
                  {pt.type}
                </div>
              </div>
            )
          })}

          {/* Current price indicator — gold line */}
          {price > 0 && (
            <div
              className="absolute left-0 right-0 z-20"
              style={{ top: `${toPct(price)}%`, transform: 'translateY(-50%)' }}
            >
              <div
                className="h-[3px] w-full"
                style={{
                  background: 'linear-gradient(90deg, var(--kt-gold), rgba(255,255,255,0.8), var(--kt-gold))',
                  boxShadow: '0 0 12px var(--kt-gold), 0 0 4px var(--kt-gold)',
                }}
              />
              {/* Price label */}
              <div
                className="absolute -right-1 -top-2.5 px-2 py-0.5 rounded font-mono text-[10px] font-bold whitespace-nowrap z-30"
                style={{
                  background: 'var(--kt-gold)',
                  color: '#000',
                }}
              >
                {fmt(price, pair)}
              </div>
              {/* Small arrow */}
              <div
                className="absolute -left-1 -top-[3px]"
                style={{
                  width: 0,
                  height: 0,
                  borderTop: '4px solid transparent',
                  borderBottom: '4px solid transparent',
                  borderLeft: '6px solid var(--kt-gold)',
                }}
              />
            </div>
          )}
        </div>

        {/* Right panel — structure labels + level labels */}
        <div
          className="absolute top-0 bottom-0 z-20 font-mono text-[9px]"
          style={{ right: 0, width: 100 }}
        >
          {/* Level labels */}
          {data.levels.slice(0, 15).map((lvl, i) => {
            const st = levelStyle(lvl.type)
            const top = toPct((lvl.zone[0] + lvl.zone[1]) / 2)
            return (
              <div
                key={i}
                className="absolute whitespace-nowrap"
                style={{
                  top: `${top}%`,
                  left: 6,
                  transform: 'translateY(-50%)',
                  color: st.color,
                  fontSize: 9,
                  fontWeight: 600,
                  opacity: 0.85,
                }}
              >
                {st.icon} {st.label}
              </div>
            )
          })}
        </div>
      </div>

      {/* Meta strip */}
      {data.meta && (
        <div className="flex gap-4 flex-wrap pt-3 border-t border-[var(--kt-border)]">
          {[
            { label: 'RSI', value: data.meta.rsi?.toFixed(1), color: data.meta.rsi > 70 ? '#ef4444' : data.meta.rsi < 30 ? '#22c55e' : 'var(--kt-text2)' },
            { label: 'ATR', value: data.meta.atr?.toFixed(dec), color: 'var(--kt-text2)' },
            { label: 'EMA20', value: data.meta.ema20?.toFixed(dec), color: '#60a5fa' },
            { label: 'EMA50', value: data.meta.ema50?.toFixed(dec), color: '#f472b6' },
            { label: 'SMA200', value: data.meta.sma200?.toFixed(dec), color: '#fb923c' },
            { label: 'Zone', value: data.premiumDiscount?.charAt(0).toUpperCase() + (data.premiumDiscount?.slice(1) ?? ''), color: 'var(--kt-text2)' },
            { label: 'Conf', value: `${data.confidence}%`, color: 'var(--kt-text2)' },
            { label: 'Signals', value: data.signals?.length?.toString() ?? '0', color: 'var(--kt-gold)' },
          ].map(m => (
            <span key={m.label} className="flex gap-1 text-[10px] font-mono">
              <span className="text-[var(--kt-muted)]">{m.label}:</span>
              <span className="font-semibold" style={{ color: m.color }}>{m.value ?? '—'}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Main Component ── */
export default function StructureMap() {
  const [selectedPair, setSelectedPair] = useState<string>('XAUUSD')
  const [timeframe, setTimeframe] = useState<Timeframe>('1D')
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const { data: smcData, isLoading, error, dataUpdatedAt } = useQuery<SMCData[]>({
    queryKey: ['smc-batch-structure', timeframe],
    queryFn: () => api(`/api/smc/batch?tf=${timeframe}`),
    refetchInterval: 60_000,
    retry: 2,
  })

  // Track last update time
  useEffect(() => {
    if (dataUpdatedAt) {
      setLastUpdate(new Date(dataUpdatedAt))
    }
  }, [dataUpdatedAt])

  // Build lookup map
  const dataMap = useMemo(() => {
    const map: Record<string, any> = {}
    if (smcData) {
      for (const d of smcData) {
        map.set(d.symbol, d)
      }
    }
    return map
  }, [smcData])

  const selectedData = useMemo(() => {
    return dataMap[selectedPair] ?? null
  }, [dataMap, selectedPair])

  const isLive = !!smcData && !error

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--kt-bg)', minHeight: '100%' }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b flex-wrap gap-3"
        style={{ borderColor: 'var(--kt-border)' }}
      >
        <div className="flex items-center gap-3">
          <Map size={18} style={{ color: 'var(--kt-gold)' }} />
          <span className="text-sm font-semibold text-[var(--kt-text)]">Market Structure Map</span>
          <ConnectionDot isLive={isLive} lastUpdate={lastUpdate} />
        </div>

        {/* Timeframe selector */}
        <div className="flex items-center gap-1 bg-[var(--kt-bg2)] rounded-lg p-0.5">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`
                px-3 py-1 rounded-md text-[10px] font-mono font-bold transition-all
                ${tf === timeframe
                  ? 'bg-[var(--kt-gold)] text-black'
                  : 'text-[var(--kt-muted)] hover:text-[var(--kt-text)] hover:bg-[var(--kt-bg3)]'
                }
              `}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Main content: sidebar + ladder */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <aside
          className="w-44 min-w-[176px] flex-shrink-0 p-3 overflow-y-auto border-r"
          style={{
            background: 'var(--kt-bg2)',
            borderColor: 'var(--kt-border)',
          }}
        >
          <div className="text-[10px] font-mono font-bold text-[var(--kt-muted)] uppercase tracking-wider mb-3 px-1">
            Pairs
          </div>
          <PairSidebar
            pairs={PAIRS}
            selected={selectedPair}
            onSelect={setSelectedPair}
            dataMap={dataMap}
          />
        </aside>

        {/* Main area */}
        <main className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="space-y-4">
              <div className="skeleton w-24 h-4 mb-2" />
              <div className="skeleton w-48 h-6 mb-2" />
              <div className="skeleton w-full h-8 mb-4" />
              <div className="skeleton w-full" style={{ height: 500 }} />
              <div className="flex gap-3">
                <div className="skeleton w-20 h-3" />
                <div className="skeleton w-20 h-3" />
                <div className="skeleton w-20 h-3" />
              </div>
            </div>
          ) : error ? (
            <div
              className="flex flex-col items-center justify-center rounded-lg p-10"
              style={{
                background: 'var(--kt-bg2)',
                border: '1px solid var(--kt-border)',
              }}
            >
              <Crosshair size={36} style={{ color: 'var(--kt-muted)', marginBottom: 12 }} />
              <p className="text-sm text-[var(--kt-text2)] font-semibold">Failed to load structure data</p>
              <p className="text-[10px] text-[var(--kt-muted)] mt-1">Check API connection and try again</p>
            </div>
          ) : selectedData ? (
            <PriceLadder data={selectedData} pair={selectedPair} />
          ) : (
            <div
              className="flex flex-col items-center justify-center rounded-lg p-10"
              style={{
                background: 'var(--kt-bg2)',
                border: '1px solid var(--kt-border)',
              }}
            >
              <Map size={36} style={{ color: 'var(--kt-muted)', marginBottom: 12 }} />
              <p className="text-sm text-[var(--kt-text2)] font-semibold">No data for {selectedPair}</p>
              <p className="text-[10px] text-[var(--kt-muted)] mt-1">Select a different pair or wait for data refresh</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
