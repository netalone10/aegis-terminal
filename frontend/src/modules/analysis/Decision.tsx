import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Crosshair, TrendingUp, TrendingDown, Minus, Target, Zap,
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Shield, Eye,
} from 'lucide-react'
import { api } from '../../lib/api'

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

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
  meta: { atr: number; rsi: number; ema20: number; ema50: number; sma200: number }
}
interface ConfluenceData {
  symbol: string
  daily: { bias: string; confidence: number; bullScore: number; bearScore: number }
  h4: { bias: string; confidence: number; bullScore: number; bearScore: number }
  h1: { bias: string; confidence: number; bullScore: number; bearScore: number }
  confluence: { score: number; alignment: string; weightedBias: string; signals: string[] }
}

/* ═══════════════════════════════════════════════════════════════
   SIGNAL ENGINE — derive actionable signals from data
   ═══════════════════════════════════════════════════════════════ */

type SignalType = 'entry' | 'warning' | 'info' | 'avoid'
interface Signal {
  type: SignalType
  label: string
  detail: string
  strength: 'strong' | 'moderate' | 'weak'
}

function generateSignals(data: SMCData, conf?: ConfluenceData): Signal[] {
  const sigs: Signal[] = []
  const { bias, confidence, premiumDiscount, killZone, structure, meta, levels } = data

  // 1. BIAS SIGNAL
  if (confidence >= 70) {
    sigs.push({
      type: bias === 'bullish' ? 'entry' : 'warning',
      label: `${bias.toUpperCase()} BIAS (${confidence}%)`,
      detail: `Strong ${bias} conviction. ${structure?.emaBias === bias ? 'EMA alignment confirms.' : 'Watch for EMA confirmation.'}`,
      strength: confidence >= 80 ? 'strong' : 'moderate',
    })
  } else {
    sigs.push({
      type: 'info',
      label: 'NEUTRAL BIAS',
      detail: 'No clear directional bias. Wait for structure development.',
      strength: 'weak',
    })
  }

  // 2. STRUCTURE SIGNAL
  const pts = structure?.structurePoints ?? []
  const last4 = pts.slice(-4)
  if (last4.length >= 4) {
    const hasHH = last4.some(p => p.type === 'HH')
    const hasHL = last4.some(p => p.type === 'HL')
    const hasLH = last4.some(p => p.type === 'LH')
    const hasLL = last4.some(p => p.type === 'LL')
    if (hasHH && hasHL) {
      sigs.push({ type: 'entry', label: 'BULL STRUCTURE', detail: 'HH + HL sequence intact. Higher highs, higher lows.', strength: 'strong' })
    } else if (hasLH && hasLL) {
      sigs.push({ type: 'warning', label: 'BEAR STRUCTURE', detail: 'LH + LL sequence intact. Lower highs, lower lows.', strength: 'strong' })
    }
  }
  if (structure?.structureBreak) {
    sigs.push({
      type: structure.structureBreak === 'bullish' ? 'entry' : 'warning',
      label: `BOS ${structure.structureBreak.toUpperCase()}`,
      detail: `Break of structure detected on ${bias} side.`,
      strength: 'strong',
    })
  }

  // 3. ZONE SIGNAL
  const nearOB = levels.find(l =>
    (l.type === 'bullish_ob' && premiumDiscount === 'discount') ||
    (l.type === 'bearish_ob' && premiumDiscount === 'premium')
  )
  if (nearOB) {
    sigs.push({
      type: 'entry',
      label: nearOB.type === 'bullish_ob' ? 'DEMAND ZONE HIT' : 'SUPPLY ZONE HIT',
      detail: `Price at ${nearOB.label} (${fmt(nearOB.zone[0], data.symbol)} — ${fmt(nearOB.zone[1], data.symbol)})`,
      strength: 'strong',
    })
  }

  // 4. PREMIUM/DISCOUNT
  if (premiumDiscount === 'discount') {
    sigs.push({ type: 'entry', label: 'DISCOUNT ZONE', detail: 'Price below equilibrium — favorable for buys.', strength: 'moderate' })
  } else if (premiumDiscount === 'premium') {
    sigs.push({ type: 'warning', label: 'PREMIUM ZONE', detail: 'Price above equilibrium — favorable for sells.', strength: 'moderate' })
  }

  // 5. KILL ZONE
  if (killZone && killZone !== 'none') {
    sigs.push({ type: 'info', label: `KILL ZONE: ${killZone.replace(/_/g, ' ').toUpperCase()}`, detail: 'Active session — higher probability setup.', strength: 'moderate' })
  } else {
    sigs.push({ type: 'avoid', label: 'NO KILL ZONE', detail: 'Outside active session — lower probability.', strength: 'weak' })
  }

  // 6. RSI EXTREME
  if (meta?.rsi) {
    if (meta.rsi > 70) sigs.push({ type: 'warning', label: `RSI OVERBOUGHT (${meta.rsi.toFixed(1)})`, detail: 'Momentum stretched — watch for reversal.', strength: 'moderate' })
    else if (meta.rsi < 30) sigs.push({ type: 'entry', label: `RSI OVERSOLD (${meta.rsi.toFixed(1)})`, detail: 'Momentum depleted — potential bounce.', strength: 'moderate' })
  }

  // 7. CONFLUENCE
  if (conf?.confluence) {
    const { score, alignment } = conf.confluence
    if (alignment === 'strong') {
      sigs.push({ type: 'entry', label: `STRONG CONFLUENCE (${score}%)`, detail: `All timeframes aligned ${conf.confluence.weightedBias}.`, strength: 'strong' })
    } else if (alignment === 'conflict') {
      sigs.push({ type: 'avoid', label: `CONFLUENCE CONFLICT (${score}%)`, detail: 'Timeframes disagree — avoid or reduce size.', strength: 'moderate' })
    }
  }

  // 8. EMA ALIGNMENT
  if (structure?.emaBias === 'bullish' && structure?.longTermBias === 'bullish') {
    sigs.push({ type: 'entry', label: 'EMA ALIGNMENT BULL', detail: 'Short + long term EMAs both bullish.', strength: 'moderate' })
  } else if (structure?.emaBias === 'bearish' && structure?.longTermBias === 'bearish') {
    sigs.push({ type: 'warning', label: 'EMA ALIGNMENT BEAR', detail: 'Short + long term EMAs both bearish.', strength: 'moderate' })
  }

  // 9. FVG PROXIMITY
  const nearFVG = levels.find(l => l.type.includes('fvg'))
  if (nearFVG) {
    sigs.push({
      type: 'info',
      label: nearFVG.type.includes('bullish') ? 'BULLISH FVG NEARBY' : 'BEARISH FVG NEARBY',
      detail: `Fair value gap at ${fmt(nearFVG.zone[0], data.symbol)} — ${fmt(nearFVG.zone[1], data.symbol)}`,
      strength: 'weak',
    })
  }

  return sigs
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

function getDecimals(p: string) {
  if (p.includes('JPY') || p.includes('XAU') || p.includes('XAG') || p.includes('IDR')) return 2
  return 5
}
function fmt(val: number, p: string) { return val.toFixed(getDecimals(p)) }

function BiasIcon({ bias, size = 14 }: { bias: string; size?: number }) {
  if (bias === 'bullish') return <TrendingUp size={size} style={{ color: 'var(--kt-up)' }} />
  if (bias === 'bearish') return <TrendingDown size={size} style={{ color: 'var(--kt-dn)' }} />
  return <Minus size={size} style={{ color: 'var(--kt-muted)' }} />
}

function SignalIcon({ type }: { type: SignalType }) {
  switch (type) {
    case 'entry': return <CheckCircle size={14} style={{ color: '#22c55e' }} />
    case 'warning': return <AlertTriangle size={14} style={{ color: '#f59e0b' }} />
    case 'avoid': return <Shield size={14} style={{ color: '#ef4444' }} />
    default: return <Eye size={14} style={{ color: '#60a5fa' }} />
  }
}

function SignalStrength({ strength }: { strength: string }) {
  const cfg = { strong: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)' }, moderate: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' }, weak: { color: 'var(--kt-muted)', bg: 'rgba(128,128,128,0.12)' } }[strength] ?? { color: 'var(--kt-muted)', bg: 'transparent' }
  return <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, padding: '1px 6px', borderRadius: 4, background: cfg.bg, color: cfg.color }}>{strength}</span>
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENTS
   ═══════════════════════════════════════════════════════════════ */

/* ── Signal Panel ── */
function SignalPanel({ signals }: { signals: Signal[] }) {
  const [expanded, setExpanded] = useState(true)
  const entries = signals.filter(s => s.type === 'entry')
  const warnings = signals.filter(s => s.type === 'warning')
  const avoids = signals.filter(s => s.type === 'avoid')
  const infos = signals.filter(s => s.type === 'info')

  const verdict = entries.length > warnings.length ? 'BUY' : warnings.length > entries.length ? 'SELL' : 'WAIT'
  const verdictColor = verdict === 'BUY' ? '#22c55e' : verdict === 'SELL' ? '#ef4444' : '#f59e0b'

  return (
    <div style={{
      background: 'var(--kt-bg2)', borderRadius: 12, border: `1px solid ${verdictColor}30`,
      overflow: 'hidden',
    }}>
      {/* Verdict Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', cursor: 'pointer',
          background: `${verdictColor}08`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Zap size={16} style={{ color: verdictColor }} />
          <span style={{ fontWeight: 700, fontSize: 15, color: verdictColor, letterSpacing: 1 }}>
            {verdict}
          </span>
          <span style={{ fontSize: 11, color: 'var(--kt-muted)' }}>
            {entries.length} buy · {warnings.length} warn · {avoids.length} avoid
          </span>
        </div>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </div>

      {/* Signal List */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${verdictColor}20`, padding: '8px 0' }}>
          {[...entries, ...warnings, ...avoids, ...infos].map((sig, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'start', gap: 10, padding: '10px 16px',
              borderBottom: i < signals.length - 1 ? '1px solid var(--kt-border)' : 'none',
            }}>
              <SignalIcon type={sig.type} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{sig.label}</span>
                  <SignalStrength strength={sig.strength} />
                </div>
                <p style={{ fontSize: 11, color: 'var(--kt-muted)', margin: 0, lineHeight: 1.4 }}>{sig.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Confluence Strip ── */
function ConfluenceStrip({ conf }: { conf: ConfluenceData }) {
  const { daily, h4, h1, confluence } = conf
  const alignCfg = {
    strong: { color: '#22c55e', label: 'STRONG' },
    partial: { color: '#f59e0b', label: 'PARTIAL' },
    conflict: { color: '#ef4444', label: 'CONFLICT' },
  }[confluence.alignment] ?? { color: 'var(--kt-muted)', label: 'N/A' }

  return (
    <div style={{
      background: 'var(--kt-bg2)', borderRadius: 12, border: '1px solid var(--kt-border)',
      padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={14} style={{ color: alignCfg.color }} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>Multi-TF Confluence</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: alignCfg.color }}>
            {confluence.score}%
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
            padding: '2px 8px', borderRadius: 4,
            background: `${alignCfg.color}18`, color: alignCfg.color,
          }}>{alignCfg.label}</span>
        </div>
      </div>

      {/* TF Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {[
          { label: '1D', data: daily },
          { label: '4H', data: h4 },
          { label: '1H', data: h1 },
        ].map(tf => (
          <div key={tf.label} style={{
            background: 'var(--kt-bg)', borderRadius: 8, padding: 10,
            border: '1px solid var(--kt-border)', textAlign: 'center',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--kt-muted)', letterSpacing: 1.5, marginBottom: 6 }}>
              {tf.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
              <BiasIcon bias={tf.data.bias} size={12} />
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: tf.data.bias === 'bullish' ? 'var(--kt-up)' : tf.data.bias === 'bearish' ? 'var(--kt-dn)' : 'var(--kt-muted)',
              }}>
                {tf.data.bias.toUpperCase()}
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--kt-muted)' }}>
              {tf.data.confidence}%
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Trade Setup Card ── */
function TradeSetupCard({ setup, symbol }: { setup: TradeSetup; symbol: string }) {
  const isBull = setup.direction === 'bullish'
  const color = isBull ? '#22c55e' : '#ef4444'

  return (
    <div style={{
      background: 'var(--kt-bg2)', borderRadius: 12, border: `1px solid ${color}30`,
      padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Target size={14} style={{ color }} />
        <span style={{ fontSize: 12, fontWeight: 600 }}>Trade Setup</span>
        <span style={{
          marginLeft: 'auto', fontSize: 10, fontWeight: 700, letterSpacing: 1,
          padding: '2px 8px', borderRadius: 4,
          background: `${color}18`, color,
        }}>
          {setup.direction.toUpperCase()}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { label: 'Entry', value: fmt(setup.entry, symbol), color: 'var(--kt-text)', bold: true },
          { label: 'Stop Loss', value: fmt(setup.sl, symbol), color: '#ef4444', bold: true },
          { label: `TP1 (R:R ${setup.rr1?.toFixed(1)})`, value: fmt(setup.tp1, symbol), color: '#22c55e' },
          { label: `TP2 (R:R ${setup.rr2?.toFixed(1)})`, value: fmt(setup.tp2, symbol), color: '#22c55e' },
          { label: 'TP3', value: fmt(setup.tp3, symbol), color: '#22c55e' },
        ].map(r => (
          <div key={r.label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '6px 10px', borderRadius: 6, background: 'var(--kt-bg)',
          }}>
            <span style={{ fontSize: 11, color: 'var(--kt-muted)' }}>{r.label}</span>
            <span style={{
              fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: r.bold ? 700 : 600, color: r.color,
            }}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Key Levels ── */
function KeyLevels({ levels, symbol }: { levels: Level[]; symbol: string }) {
  const [showAll, setShowAll] = useState(false)
  const displayed = showAll ? levels : levels.slice(0, 8)

  const typeColor = (t: string) => {
    if (t.includes('bullish')) return '#22c55e'
    if (t.includes('bearish')) return '#ef4444'
    if (t.includes('liquidity') || t.includes('bsl') || t.includes('ssl')) return '#f59e0b'
    if (t.includes('fvg')) return '#a855f7'
    return 'var(--kt-muted)'
  }

  return (
    <div style={{ background: 'var(--kt-bg2)', borderRadius: 12, border: '1px solid var(--kt-border)', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--kt-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Key Levels</span>
          <span style={{ fontSize: 10, color: 'var(--kt-muted)' }}>{levels.length} zones</span>
        </div>
      </div>
      <div>
        {displayed.map((lvl, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 16px', borderBottom: i < displayed.length - 1 ? '1px solid var(--kt-border)' : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 3, height: 16, borderRadius: 2, background: typeColor(lvl.type) }} />
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--kt-text2)' }}>{lvl.label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--kt-muted)' }}>{lvl.strength}</span>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {fmt(lvl.zone[0], symbol)} — {fmt(lvl.zone[1], symbol)}
              </span>
            </div>
          </div>
        ))}
      </div>
      {levels.length > 8 && (
        <button
          onClick={() => setShowAll(!showAll)}
          style={{
            width: '100%', padding: '8px', background: 'none', border: 'none',
            color: 'var(--kt-gold)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {showAll ? 'Show less' : `Show all ${levels.length} levels`}
        </button>
      )}
    </div>
  )
}

/* ── Structure Mini ── */
function StructureMini({ data }: { data: SMCData }) {
  const pts = data.structure?.structurePoints ?? []
  const last4 = pts.slice(-4)
  let structLabel = 'NEUTRAL'
  let structColor = 'var(--kt-muted)'
  if (last4.length >= 4) {
    const hasHH = last4.some(p => p.type === 'HH')
    const hasHL = last4.some(p => p.type === 'HL')
    const hasLH = last4.some(p => p.type === 'LH')
    const hasLL = last4.some(p => p.type === 'LL')
    if (hasHH && hasHL) { structLabel = 'BULL STRUCTURE'; structColor = '#22c55e' }
    else if (hasLH && hasLL) { structLabel = 'BEAR STRUCTURE'; structColor = '#ef4444' }
  }

  return (
    <div style={{ background: 'var(--kt-bg2)', borderRadius: 12, border: '1px solid var(--kt-border)', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Structure</span>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '2px 8px', borderRadius: 4,
          background: `${structColor}18`, color: structColor,
        }}>{structLabel}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {[
          { label: 'EMA Bias', value: data.structure?.emaBias },
          { label: 'Long-term', value: data.structure?.longTermBias },
          { label: 'Price vs EMA', value: data.structure?.priceVsEma },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center', padding: 8, background: 'var(--kt-bg)', borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: 'var(--kt-muted)', marginBottom: 4 }}>{s.label}</div>
            <div style={{
              fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
              color: s.value === 'bullish' ? 'var(--kt-up)' : s.value === 'bearish' ? 'var(--kt-dn)' : 'var(--kt-gold)',
            }}>
              {s.value?.toUpperCase() ?? '—'}
            </div>
          </div>
        ))}
      </div>

      {/* Meta indicators */}
      {data.meta && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'RSI', value: data.meta.rsi?.toFixed(1), color: (data.meta.rsi ?? 50) > 70 ? '#ef4444' : (data.meta.rsi ?? 50) < 30 ? '#22c55e' : 'var(--kt-text2)' },
            { label: 'ATR', value: data.meta.atr?.toFixed(getDecimals(data.symbol)) },
            { label: 'EMA20', value: data.meta.ema20?.toFixed(getDecimals(data.symbol)) },
            { label: 'EMA50', value: data.meta.ema50?.toFixed(getDecimals(data.symbol)) },
            { label: 'SMA200', value: data.meta.sma200?.toFixed(getDecimals(data.symbol)) },
          ].map(m => (
            <div key={m.label} style={{
              padding: '4px 10px', borderRadius: 6, background: 'var(--kt-bg)',
              fontSize: 10, fontFamily: 'var(--font-mono)',
            }}>
              <span style={{ color: 'var(--kt-muted)' }}>{m.label} </span>
              <span style={{ fontWeight: 600, color: m.color ?? 'var(--kt-text2)' }}>{m.value ?? '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */

export default function Decision() {
  const [tf, setTf] = useState<TFKey>('1D')
  const [selected, setSelected] = useState<string>('XAUUSD')
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const { data: smcRaw, isLoading, error, dataUpdatedAt } = useQuery<any>({
    queryKey: ['smc-batch', tf],
    queryFn: () => api(`/api/smc/batch?tf=${tf}`),
    refetchInterval: 60_000,
    retry: 2,
  })

  const { data: confRaw } = useQuery<any>({
    queryKey: ['smc-confluence'],
    queryFn: () => api('/api/smc/confluence'),
    refetchInterval: 120_000,
  })

  useEffect(() => { if (dataUpdatedAt) setLastUpdate(new Date(dataUpdatedAt)) }, [dataUpdatedAt])

  // Normalize API response (data may be wrapped or flat)
  const smcData: SMCData[] = useMemo(() => {
    if (!smcRaw) return []
    const arr = Array.isArray(smcRaw) ? smcRaw : (smcRaw.data ?? smcRaw.results ?? [])
    // Normalize symbol format (XAU/USD -> XAUUSD for matching)
    return arr.map((d: any) => ({
      ...d,
      symbol: d.symbol?.replace('/', '') ?? d.symbol,
    }))
  }, [smcRaw])

  const confData: ConfluenceData[] = useMemo(() => {
    if (!confRaw) return []
    const arr = Array.isArray(confRaw) ? confRaw : (confRaw.data ?? confRaw.results ?? [])
    return arr.map((d: any) => ({
      ...d,
      symbol: d.symbol?.replace('/', '') ?? d.symbol,
    }))
  }, [confRaw])

  const dataMap = useMemo(() => {
    const m: Record<string, SMCData> = {}
    smcData.forEach(d => { m[d.symbol] = d })
    return m
  }, [smcData])

  const confMap = useMemo(() => {
    const m: Record<string, ConfluenceData> = {}
    confData.forEach(d => { m[d.symbol] = d })
    return m
  }, [confData])

  const selectedData = dataMap[selected]
  const selectedConf = confMap[selected]
  const signals = selectedData ? generateSignals(selectedData, selectedConf) : []
  const isLive = !!smcData && !error

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--kt-bg)' }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid var(--kt-border)',
        flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Crosshair size={16} style={{ color: 'var(--kt-gold)' }} />
          <span style={{ fontSize: 14, fontWeight: 700 }}>SMC / ICT</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--kt-muted)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isLive ? '#22c55e' : '#ef4444', boxShadow: isLive ? '0 0 6px #22c55e' : '0 0 6px #ef4444' }} />
            <span>{isLive ? 'LIVE' : 'OFFLINE'}</span>
            {lastUpdate && <span> · {lastUpdate.toLocaleTimeString()}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2, background: 'var(--kt-bg2)', borderRadius: 8, padding: 3, border: '1px solid var(--kt-border)' }}>
          {TIMEFRAMES.map(t => (
            <button key={t.key} onClick={() => setTf(t.key)} style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono)',
              border: 'none', cursor: 'pointer', transition: 'all 0.15s',
              background: tf === t.key ? 'var(--kt-gold)' : 'transparent',
              color: tf === t.key ? '#000' : 'var(--kt-text2)',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* ── Main: Sidebar + Content ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Pair Sidebar */}
        <aside style={{
          width: 160, minWidth: 160, flexShrink: 0, padding: 12, overflowY: 'auto',
          borderRight: '1px solid var(--kt-border)', background: 'var(--kt-bg2)',
        }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--kt-muted)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10, paddingLeft: 4 }}>
            Pairs
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {smcData.map(pair => {
              const d = dataMap[pair.symbol]
              const isSel = pair.symbol === selected
              const bull = d?.bias === 'bullish'
              const bear = d?.bias === 'bearish'
              return (
                <button key={pair.symbol} onClick={() => setSelected(pair.symbol)} style={{
                  display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 12px', borderRadius: 8,
                  textAlign: 'left', transition: 'all 0.15s', fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer',
                  background: isSel ? 'rgba(234,179,8,0.12)' : 'var(--kt-bg2)',
                  border: `1px solid ${isSel ? 'rgba(234,179,8,0.35)' : 'var(--kt-border)'}`,
                  color: isSel ? 'var(--kt-gold)' : 'var(--kt-text)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, letterSpacing: 1 }}>{pair.symbol}</span>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: bull ? '#22c55e' : bear ? '#ef4444' : 'var(--kt-muted)' }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--kt-muted)' }}>
                    {d?.meta?.ema20 ? fmt(d.meta.ema20, pair.symbol) : '—'}
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        {/* Content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 12 }} />)}
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--kt-muted)' }}>
              <Crosshair size={36} style={{ marginBottom: 12, opacity: 0.3 }} />
              <p style={{ fontSize: 13 }}>Failed to load SMC data</p>
            </div>
          ) : selectedData ? (
            <div className="space-y-4">
              {/* Pair Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{selectedData.symbol}</span>
                  <BiasIcon bias={selectedData.bias} size={18} />
                  <span style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: 1,
                    color: selectedData.bias === 'bullish' ? 'var(--kt-up)' : selectedData.bias === 'bearish' ? 'var(--kt-dn)' : 'var(--kt-muted)',
                  }}>
                    {selectedData.bias.toUpperCase()}
                  </span>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--kt-gold)', fontSize: 16 }}>
                  {selectedData.meta?.ema20 ? fmt(selectedData.meta.ema20, selectedData.symbol) : '—'}
                </span>
              </div>

              {/* Signal Panel — TOP PRIORITY */}
              <SignalPanel signals={signals} />

              {/* Confluence */}
              {selectedConf && <ConfluenceStrip conf={selectedConf} />}

              {/* Structure */}
              <StructureMini data={selectedData} />

              {/* Trade Setup */}
              {selectedData.tradeSetup && (
                <TradeSetupCard setup={selectedData.tradeSetup} symbol={selectedData.symbol} />
              )}

              {/* Key Levels */}
              {selectedData.levels.length > 0 && (
                <KeyLevels levels={selectedData.levels} symbol={selectedData.symbol} />
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--kt-muted)' }}>
              <Crosshair size={36} style={{ marginBottom: 12, opacity: 0.3 }} />
              <p style={{ fontSize: 13 }}>Select a pair</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
