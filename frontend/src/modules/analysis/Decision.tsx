import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Crosshair, Clock, TrendingUp, TrendingDown, Minus, Target, Layers, ChevronDown, ChevronUp, Zap } from 'lucide-react'
import { api } from '../../lib/api'

const TIMEFRAMES = [
  { key: '1D', label: 'Daily' },
  { key: '4H', label: '4H' },
  { key: '1H', label: '1H' },
] as const
type TFKey = typeof TIMEFRAMES[number]['key']

interface Level {
  type: string; zone: [number, number]; label: string; strength: string
}
interface StructurePoint {
  type: 'HH' | 'HL' | 'LH' | 'LL' | 'sw_high' | 'sw_low'
  price: number; index: number
}
interface TradeSetup {
  direction: string; entry: number; sl: number
  tp1: number; tp2: number; tp3: number; rr1: number; rr2: number
}
interface SMCData {
  symbol: string; bias: string; confidence: number
  premiumDiscount: string; killZone: string
  bullScore: number; bearScore: number
  signals: string[]; levels: Level[]
  tradeSetup: TradeSetup | null
  structure: {
    emaBias: string; longTermBias: string; priceVsEma: string
    swingHigh?: number; swingLow?: number
    structureBreak?: string; structurePoints?: StructurePoint[]
  }
  meta: {
    atr: number; rsi: number
    ema20: number; ema50: number; sma200: number
  }
}
interface ConfluenceTF {
  timeframe: string; bias: string; trend: string
  ob: any[]; fvg: any[]; liquidity: any[]; score: number
}
interface ConfluencePair {
  pair: string; timeframes: Record<string, ConfluenceTF>
  confluence: { score: number; alignment: 'strong' | 'partial' | 'conflict'; bias: string }
}

function getDecimals(p: string) {
  if (p.includes('JPY') || p.includes('XAU') || p.includes('XAG') || p.includes('IDR')) return 2
  return 5
}
function fmt(val: number, p: string) { return val.toFixed(getDecimals(p)) }
function isBullish(d: SMCData) {
  return d.bias === 'bullish' || (d.structure?.emaBias === 'bullish' && d.structure?.longTermBias === 'bullish')
}
function getStructureLabel(d: SMCData): string {
  const pts = d.structure?.structurePoints ?? []
  const last4 = pts.slice(-4)
  if (last4.length >= 4) {
    const t = last4.map(p => p.type).join('/')
    if (t.includes('HH') && t.includes('HL')) return 'BULL STRUCTURE'
    if (t.includes('LH') && t.includes('LL')) return 'BEAR STRUCTURE'
  }
  if (d.bias === 'bullish') return 'BULL STRUCTURE'
  if (d.bias === 'bearish') return 'BEAR STRUCTURE'
  return 'NEUTRAL'
}
function levelStyle(type: string): { color: string; bs: string; h: number; op: number; label: string; icon: string } {
  switch (type) {
    case 'bullish_ob': return { color: '#22c55e', bs: 'solid', h: 10, op: 0.9, label: 'Bullish OB', icon: '🟢' }
    case 'bearish_ob': return { color: '#ef4444', bs: 'solid', h: 10, op: 0.9, label: 'Bearish OB', icon: '🔴' }
    case 'bullish_fvg': return { color: '#4ade80', bs: 'dashed', h: 8, op: 0.85, label: 'Bull FVG', icon: '△' }
    case 'bearish_fvg': return { color: '#f87171', bs: 'dashed', h: 8, op: 0.85, label: 'Bear FVG', icon: '▽' }
    case 'equilibrium': return { color: '#fff', bs: 'dashed', h: 3, op: 0.8, label: 'EQ', icon: '—' }
    case 'liquidity_buy': case 'bsl': return { color: '#f59e0b', bs: 'dashed', h: 2, op: 0.9, label: 'BSL', icon: '⚡' }
    case 'liquidity_sell': case 'ssl': return { color: '#f59e0b', bs: 'dashed', h: 2, op: 0.9, label: 'SSL', icon: '⚡' }
    default:
      if (type.startsWith('fib')) return { color: '#a855f7', bs: 'dotted', h: 2, op: 0.75, label: type.replace('fib_', 'Fib '), icon: '◇' }
      return { color: 'var(--kt-muted)', bs: 'solid', h: 3, op: 0.5, label: type, icon: '·' }
  }
}
function getContext(levels: Level[], price: number, pd?: string) {
  if (!price || !levels?.length) return { text: 'AWAITING DATA', emoji: '⏳', color: 'var(--kt-muted)' }
  const tol = price * 0.003
  const nearBull = levels.some(l => l.type === 'bullish_ob' && price >= l.zone[0] - tol && price <= l.zone[1] + tol)
  const nearBear = levels.some(l => l.type === 'bearish_ob' && price >= l.zone[0] - tol && price <= l.zone[1] + tol)
  if ((pd === 'discount' || pd === 'below') && nearBull) return { text: 'BUY ZONE — Demand area', emoji: '🟢', color: '#22c55e' }
  if ((pd === 'premium' || pd === 'above') && nearBear) return { text: 'SELL ZONE — Supply area', emoji: '🔴', color: '#ef4444' }
  if (pd === 'discount' || pd === 'below') return { text: 'DISCOUNT ZONE', emoji: '🟢', color: '#22c55e' }
  if (pd === 'premium' || pd === 'above') return { text: 'PREMIUM ZONE', emoji: '🔴', color: '#ef4444' }
  return { text: 'NEUTRAL — Equilibrium', emoji: '🟡', color: '#f59e0b' }
}

function BiasIcon({ bias }: { bias: string }) {
  if (bias === 'bullish') return <TrendingUp size={14} style={{ color: 'var(--kt-up)' }} />
  if (bias === 'bearish') return <TrendingDown size={14} style={{ color: 'var(--kt-dn)' }} />
  return <Minus size={14} style={{ color: 'var(--kt-muted)' }} />
}
function Badge({ bias }: { bias: string }) {
  const c = bias === 'bullish' ? 'badge-bull' : bias === 'bearish' ? 'badge-bear' : 'badge-neutral'
  return <span className={c}>{bias.toUpperCase()}</span>
}

function PriceLadder({ data }: { data: SMCData }) {
  const pair = data.symbol
  const price = data.meta?.ema20 ?? 0
  const allPrices = [price, ...data.levels.flatMap(l => [l.zone[0], l.zone[1]])]
  if (data.meta?.sma200) allPrices.push(data.meta.sma200)
  if (data.meta?.ema50) allPrices.push(data.meta.ema50)
  const minP = Math.min(...allPrices), maxP = Math.max(...allPrices)
  const range = maxP - minP || 1, pad = range * 0.1
  const vMin = minP - pad, vMax = maxP + pad, vR = vMax - vMin
  const toPct = (p: number) => Math.max(0, Math.min(100, ((vMax - p) / vR) * 100))
  const maxZW = Math.max(...data.levels.map(l => l.zone[1] - l.zone[0]), 0.0001)
  const toW = (z: [number, number]) => Math.max(((z[1] - z[0]) / maxZW) * 55, 6)
  const ticks = Array.from({ length: 8 }, (_, i) => vMax - (vR / 7) * i)
  const ctx = getContext(data.levels, price, data.premiumDiscount)
  const bull = isBullish(data)
  const structLabel = getStructureLabel(data)
  const pts = data.structure?.structurePoints ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge bias={data.bias} />
          <span style={{
            fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: 1,
            padding: '2px 8px', borderRadius: 999,
            background: bull ? 'rgba(34,197,94,0.12)' : data.bias === 'bearish' ? 'rgba(239,68,68,0.12)' : 'rgba(234,179,8,0.12)',
            color: bull ? '#22c55e' : data.bias === 'bearish' ? '#ef4444' : '#f59e0b',
          }}>{structLabel}</span>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--kt-gold)' }}>{fmt(price, pair)}</span>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
        background: ctx.color === '#22c55e' ? 'rgba(34,197,94,0.1)' : ctx.color === '#ef4444' ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)',
        border: `1px solid ${ctx.color === '#22c55e' ? 'rgba(34,197,94,0.25)' : ctx.color === '#ef4444' ? 'rgba(239,68,68,0.25)' : 'rgba(234,179,8,0.25)'}`,
        color: ctx.color,
      }}>
        <span>{ctx.emoji}</span><span>{ctx.text}</span>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--kt-muted)' }}>
        {[
          { c: '#22c55e', l: 'Bull OB', s: 'solid' }, { c: '#ef4444', l: 'Bear OB', s: 'solid' },
          { c: '#4ade80', l: 'Bull FVG', s: 'dashed' }, { c: '#f87171', l: 'Bear FVG', s: 'dashed' },
          { c: '#f59e0b', l: 'BSL/SSL', s: 'dashed' }, { c: '#fff', l: 'EQ', s: 'dashed' },
        ].map(l => (
          <span key={l.l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 16, height: 2, borderTop: `2px ${l.s} ${l.c}` }} />
            {l.l}
          </span>
        ))}
      </div>
      <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: 'var(--kt-bg2)', border: '1px solid var(--kt-border)', height: 420 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, zIndex: 20, width: 56, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--kt-muted)' }}>
          {ticks.map((t, i) => (
            <div key={i} style={{ position: 'absolute', right: 8, top: `${toPct(t)}%`, transform: 'translateY(-50%)', whiteSpace: 'nowrap' }}>
              {fmt(t, pair)}
            </div>
          ))}
        </div>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 56, right: 80 }}>
          {ticks.map((t, i) => (
            <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: `${toPct(t)}%`, borderTop: '1px solid var(--kt-border)', opacity: 0.2 }} />
          ))}
          {data.levels.map((lvl, i) => {
            const st = levelStyle(lvl.type)
            const mid = (lvl.zone[0] + lvl.zone[1]) / 2
            const w = toW(lvl.zone)
            const bg = st.bs === 'solid' ? `${st.color}${Math.round(st.op * 255).toString(16).padStart(2, '0')}` : 'transparent'
            const bdr = st.bs !== 'solid' ? `2px ${st.bs} ${st.color}` : 'none'
            return (
              <div key={i} style={{ position: 'absolute', top: `${toPct(mid)}%`, left: '4%', width: '92%', transform: 'translateY(-50%)', zIndex: 5, display: 'flex', alignItems: 'center' }}>
                <div title={`${st.label} [${fmt(lvl.zone[0], pair)} – ${fmt(lvl.zone[1], pair)}]`} style={{
                  width: `${w}%`, height: st.h, background: bg, borderTop: bdr, borderBottom: bdr,
                  borderRadius: 2, boxShadow: st.bs === 'solid' ? `0 0 8px ${st.color}44` : 'none', opacity: st.op, cursor: 'pointer',
                }} />
              </div>
            )
          })}
          {[{ v: data.meta?.ema20, c: '#60a5fa' }, { v: data.meta?.ema50, c: '#f472b6' }, { v: data.meta?.sma200, c: '#fb923c' }]
            .filter(e => e.v).map((e, i) => (
              <div key={i} style={{ position: 'absolute', left: 0, right: 0, zIndex: 4, top: `${toPct(e.v!)}%` }}>
                <div style={{ height: 1, width: '100%', borderTop: `1px dotted ${e.c}` }} />
              </div>
            ))
          }
          {pts.filter(p => ['HH', 'HL', 'LH', 'LL'].includes(p.type)).map((pt, i) => {
            const isBullPt = pt.type === 'HH' || pt.type === 'HL'
            return (
              <div key={i} style={{ position: 'absolute', top: `${toPct(pt.price)}%`, right: 0, transform: 'translateY(-50%)', zIndex: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{
                  padding: '1px 6px', borderRadius: 4, fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 700, whiteSpace: 'nowrap',
                  background: isBullPt ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
                  color: isBullPt ? '#22c55e' : '#ef4444', border: `1px solid ${isBullPt ? '#22c55e40' : '#ef444440'}`,
                }}>{pt.type}</span>
              </div>
            )
          })}
          {price > 0 && (
            <div style={{ position: 'absolute', left: 0, right: 0, zIndex: 20, top: `${toPct(price)}%`, transform: 'translateY(-50%)' }}>
              <div style={{ height: 3, width: '100%', background: 'linear-gradient(90deg, var(--kt-gold), rgba(255,255,255,0.8), var(--kt-gold))', boxShadow: '0 0 12px var(--kt-gold)' }} />
              <div style={{ position: 'absolute', right: -4, top: -10, padding: '2px 8px', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', background: 'var(--kt-gold)', color: '#000' }}>
                {fmt(price, pair)}
              </div>
            </div>
          )}
        </div>
        <div style={{ position: 'absolute', top: 0, bottom: 0, zIndex: 20, right: 0, width: 80, fontFamily: 'var(--font-mono)', fontSize: 9 }}>
          {data.levels.slice(0, 12).map((lvl, i) => {
            const st = levelStyle(lvl.type)
            return (
              <div key={i} style={{ position: 'absolute', top: `${toPct((lvl.zone[0] + lvl.zone[1]) / 2)}%`, left: 6, transform: 'translateY(-50%)', color: st.color, fontWeight: 600, opacity: 0.85, whiteSpace: 'nowrap' }}>
                {st.icon} {st.label}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ConfluenceSection({ pair }: { pair: string }) {
  const [expanded, setExpanded] = useState(false)
  const { data, isLoading } = useQuery<ConfluencePair[]>({
    queryKey: ['smc-confluence'],
    queryFn: () => api('/api/smc/confluence'),
    refetchInterval: 120_000,
  })
  const pc = data?.find(d => d.pair === pair)
  if (isLoading || !pc) return null
  const c = pc.confluence
  const alignCfg = {
    strong: { bg: 'var(--kt-upf)', color: 'var(--kt-up)', label: 'STRONG' },
    partial: { bg: 'var(--kt-goldf)', color: 'var(--kt-gold)', label: 'PARTIAL' },
    conflict: { bg: 'var(--kt-dnf)', color: 'var(--kt-dn)', label: 'CONFLICT' },
  }[c.alignment]

  return (
    <div className="kt-card" style={{ marginBottom: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Zap size={14} style={{ color: alignCfg.color }} />
          <span style={{ fontSize: 'var(--sm)', fontWeight: 600 }}>Multi-TF Confluence</span>
          <span style={{
            fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700,
            padding: '2px 8px', borderRadius: 999, background: alignCfg.bg, color: alignCfg.color,
          }}>{alignCfg.label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: alignCfg.color, fontSize: 'var(--md)' }}>{c.score}%</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>
      {expanded && (
        <div style={{ borderTop: '1px solid var(--kt-border-soft)', padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {Object.entries(pc.timeframes).map(([tf, d]) => (
              <div key={tf} style={{ background: 'var(--kt-bg)', borderRadius: 8, padding: 12, border: '1px solid var(--kt-border-soft)' }}>
                <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--kt-muted)', marginBottom: 6 }}>{tf}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <BiasIcon bias={d.bias} />
                  <span style={{ fontWeight: 600, fontSize: 13, color: d.bias === 'bullish' ? 'var(--kt-up)' : d.bias === 'bearish' ? 'var(--kt-dn)' : 'var(--kt-muted)' }}>
                    {d.bias?.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--kt-muted)' }}>
                  Trend: {d.trend} · Score: {d.score}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SMCPanel({ data }: { data: SMCData }) {
  const pdColor = data.premiumDiscount === 'premium' ? 'var(--kt-dn)' : 'var(--kt-up)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="kt-stat-grid kt-stat-grid-3">
        <div className="kt-stat">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BiasIcon bias={data.bias} />
            <div>
              <div className="kt-stat-label" style={{ marginBottom: 2 }}>Bias</div>
              <div style={{ color: data.bias === 'bullish' ? 'var(--kt-up)' : data.bias === 'bearish' ? 'var(--kt-dn)' : 'var(--kt-gold)', fontSize: 'var(--md)', fontWeight: 600 }}>
                {data.bias.charAt(0).toUpperCase() + data.bias.slice(1)}
              </div>
            </div>
          </div>
        </div>
        <div className="kt-stat">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Layers size={14} style={{ color: pdColor }} />
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
            <Clock size={14} style={{ color: data.killZone !== 'none' ? 'var(--kt-up)' : 'var(--kt-muted)' }} />
            <div>
              <div className="kt-stat-label" style={{ marginBottom: 2 }}>Kill Zone</div>
              <div style={{ color: data.killZone !== 'none' ? 'var(--kt-up)' : 'var(--kt-text2)', fontSize: 'var(--md)', fontWeight: 600 }}>
                {data.killZone.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="kt-grid-2">
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span className="kt-stat-label" style={{ margin: 0 }}>Bull Score</span>
            <span style={{ color: 'var(--kt-up)', fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)' }}>{data.bullScore.toFixed(0)}</span>
          </div>
          <div className="kt-bar-track"><div className="kt-bar-fill up" style={{ width: `${data.bullScore}%` }} /></div>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span className="kt-stat-label" style={{ margin: 0 }}>Bear Score</span>
            <span style={{ color: 'var(--kt-dn)', fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)' }}>{data.bearScore.toFixed(0)}</span>
          </div>
          <div className="kt-bar-track"><div className="kt-bar-fill dn" style={{ width: `${data.bearScore}%` }} /></div>
        </div>
      </div>

      {/* Structure mini-stats */}
      <div>
        <div className="kt-stat-label" style={{ marginBottom: 6 }}>Structure</div>
        <div className="kt-stat-grid kt-stat-grid-3">
          {[
            { label: 'EMA Bias', value: data.structure.emaBias },
            { label: 'Long-term', value: data.structure.longTermBias },
            { label: 'Price vs EMA', value: data.structure.priceVsEma },
          ].map(s => (
            <div key={s.label} className="kt-stat" style={{ textAlign: 'center' }}>
              <div className="kt-stat-label" style={{ marginBottom: 2 }}>{s.label}</div>
              <div style={{ color: s.value === 'bullish' ? 'var(--kt-up)' : s.value === 'bearish' ? 'var(--kt-dn)' : 'var(--kt-gold)', fontSize: 'var(--sm)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                {s.value.toUpperCase()}
              </div>
            </div>
          ))}
        </div>
      </div>
      <ConfluenceSection pair={data.symbol} />
      {data.signals.length > 0 && (
        <div>
          <div className="kt-stat-label" style={{ marginBottom: 6 }}>Signals</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.signals.map((sig, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'start', gap: 8, fontSize: 'var(--md)' }}>
                <span style={{ color: 'var(--kt-up)', marginTop: 1 }}>→</span>
                <span style={{ color: 'var(--kt-text2)' }}>{sig}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.levels.length > 0 && (
        <div>
          <div className="kt-stat-label" style={{ marginBottom: 6 }}>Key Levels</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {data.levels.map((lvl, i) => {
              const st = levelStyle(lvl.type)
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderRadius: 4, fontSize: 'var(--sm)', background: 'var(--kt-bg2)' }}>
                  <span style={{ color: st.color }}>{st.icon} {lvl.label}</span>
                  <span style={{ color: 'var(--kt-text)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {fmt(lvl.zone[0], data.symbol)} — {fmt(lvl.zone[1], data.symbol)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {data.tradeSetup && (
        <div className="kt-card" style={{ marginBottom: 0 }}>
          <div className="kt-card-pad">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Target size={13} style={{ color: 'var(--kt-up)' }} />
              <span style={{ color: 'var(--kt-text)', fontSize: 'var(--sm)', fontWeight: 600 }}>Trade Setup</span>
              <span className={data.tradeSetup.direction === 'bullish' ? 'badge-bull' : 'badge-bear'} style={{ marginLeft: 'auto' }}>
                {data.tradeSetup.direction.toUpperCase()}
              </span>
            </div>
            <div className="kt-grid-2" style={{ gap: 6 }}>
              {[
                { label: 'Entry', value: fmt(data.tradeSetup.entry, data.symbol), color: 'var(--kt-text)' },
                { label: 'Stop Loss', value: fmt(data.tradeSetup.sl, data.symbol), color: 'var(--kt-dn)' },
                { label: `TP1 (R:R ${data.tradeSetup.rr1?.toFixed(1)})`, value: fmt(data.tradeSetup.tp1, data.symbol), color: 'var(--kt-up)' },
                { label: `TP2 (R:R ${data.tradeSetup.rr2?.toFixed(1)})`, value: fmt(data.tradeSetup.tp2, data.symbol), color: 'var(--kt-up)' },
                { label: 'TP3', value: fmt(data.tradeSetup.tp3, data.symbol), color: 'var(--kt-up)' },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                  <span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)' }}>{r.label}</span>
                  <span style={{ color: r.color, fontSize: 'var(--sm)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {data.meta && (
        <div className="kt-stat-grid kt-stat-grid-5">
          {[
            { label: 'RSI', value: data.meta.rsi?.toFixed(1) },
            { label: 'ATR', value: data.meta.atr?.toFixed(getDecimals(data.symbol)) },
            { label: 'EMA20', value: data.meta.ema20?.toFixed(getDecimals(data.symbol)) },
            { label: 'EMA50', value: data.meta.ema50?.toFixed(getDecimals(data.symbol)) },
            { label: 'SMA200', value: data.meta.sma200?.toFixed(getDecimals(data.symbol)) },
          ].map(m => (
            <div key={m.label} className="kt-stat" style={{ textAlign: 'center' }}>
              <div className="kt-stat-label" style={{ marginBottom: 2 }}>{m.label}</div>
              <div style={{ color: 'var(--kt-text2)', fontSize: 'var(--sm)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{m.value ?? '—'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Decision() {
  const [tf, setTf] = useState<TFKey>('1D')
  const [selected, setSelected] = useState<string>('XAUUSD')
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const { data: smcData, isLoading, error, dataUpdatedAt } = useQuery<SMCData[]>({
    queryKey: ['smc-batch', tf],
    queryFn: () => api(`/api/smc/batch?tf=${tf}`),
    refetchInterval: 60_000,
    retry: 2,
  })

  useEffect(() => { if (dataUpdatedAt) setLastUpdate(new Date(dataUpdatedAt)) }, [dataUpdatedAt])

  const dataMap = useMemo(() => {
    const m: Record<string, SMCData> = {}
    smcData?.forEach(d => { m[d.symbol] = d })
    return m
  }, [smcData])

  const selectedData = dataMap[selected]
  const pairs = smcData ?? []
  const isLive = !!smcData && !error

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--kt-bg)', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--kt-border)', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="kt-kicker" style={{ marginBottom: 0 }}>Smart Money Concepts</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--kt-muted)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isLive ? '#22c55e' : '#ef4444', boxShadow: isLive ? '0 0 6px #22c55e' : '0 0 6px #ef4444' }} />
            <span>{isLive ? 'LIVE' : 'OFFLINE'}</span>
            {lastUpdate && <><span style={{ color: 'var(--kt-dim)' }}>·</span><Clock size={10} /><span>{lastUpdate.toLocaleTimeString()}</span></>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 2, background: 'var(--kt-bg2)', borderRadius: 8, padding: 3, border: '1px solid var(--kt-border)' }}>
            {TIMEFRAMES.map(t => (
              <button key={t.key} onClick={() => setTf(t.key)} style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 'var(--xs)', fontWeight: 600, fontFamily: 'var(--font-mono)',
                border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                background: tf === t.key ? 'var(--kt-gold)' : 'transparent',
                color: tf === t.key ? '#000' : 'var(--kt-text2)',
              }}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Main: sidebar + content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <aside style={{ width: 160, minWidth: 160, flexShrink: 0, padding: 12, overflowY: 'auto', borderRight: '1px solid var(--kt-border)', background: 'var(--kt-bg2)' }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--kt-muted)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10, paddingLeft: 4 }}>Pairs</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {pairs.map(pair => {
              const d = dataMap[pair.symbol]
              const isSel = pair.symbol === selected
              const bull = d ? isBullish(d) : null
              return (
                <button key={pair.symbol} onClick={() => setSelected(pair.symbol)} style={{
                  display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 12px', borderRadius: 8, textAlign: 'left',
                  transition: 'all 0.15s', fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer',
                  background: isSel ? 'rgba(234,179,8,0.12)' : 'var(--kt-bg2)',
                  border: `1px solid ${isSel ? 'rgba(234,179,8,0.35)' : 'var(--kt-border)'}`,
                  color: isSel ? 'var(--kt-gold)' : 'var(--kt-text)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, letterSpacing: 1 }}>{pair.symbol}</span>
                    {d && <span style={{ width: 6, height: 6, borderRadius: '50%', background: bull ? '#22c55e' : bull === false ? '#ef4444' : 'var(--kt-muted)' }} />}
                  </div>
                  {d && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                      <span style={{ color: bull ? '#22c55e' : bull === false ? '#ef4444' : 'var(--kt-muted)' }}>
                        {bull ? <TrendingUp size={10} /> : bull === false ? <TrendingDown size={10} /> : <Minus size={10} />}
                      </span>
                      <span style={{ color: 'var(--kt-muted)' }}>{d.meta?.ema20 ? fmt(d.meta.ema20, pair.symbol) : '—'}</span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </aside>
        <main style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="skeleton w-24 h-4" />
              <div className="skeleton w-48 h-6" />
              <div className="skeleton w-full" style={{ height: 400 }} />
            </div>
          ) : error ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, borderRadius: 8, background: 'var(--kt-bg2)', border: '1px solid var(--kt-border)' }}>
              <Crosshair size={36} style={{ color: 'var(--kt-muted)', marginBottom: 12 }} />
              <p style={{ fontSize: 'var(--sm)', color: 'var(--kt-text2)', fontWeight: 600 }}>Failed to load SMC data</p>
              <p style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', marginTop: 4 }}>Check API connection</p>
            </div>
          ) : selectedData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="code" style={{ fontSize: 'var(--md)', fontWeight: 600 }}>{selectedData.symbol}</span>
                  <Badge bias={selectedData.bias} />
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span className="kt-stat-value">{selectedData.confidence}%</span>
                  <span className="kt-stat-label" style={{ margin: 0 }}>confidence</span>
                </div>
              </div>

              {/* Bias + Structure mini */}
              <SMCPanel data={selectedData} />
              <div>
                <div className="kt-stat-label" style={{ marginBottom: 8 }}>Price Ladder</div>
                <PriceLadder data={selectedData} />
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, borderRadius: 8, background: 'var(--kt-bg2)', border: '1px solid var(--kt-border)' }}>
              <Crosshair size={36} style={{ color: 'var(--kt-muted)', marginBottom: 12 }} />
              <p style={{ fontSize: 'var(--sm)', color: 'var(--kt-text2)', fontWeight: 600 }}>No data for {selected}</p>
              <p style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', marginTop: 4 }}>Select a different pair</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
