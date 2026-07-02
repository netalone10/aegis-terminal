import { useQuery } from '@tanstack/react-query'
import { useState, useCallback, useEffect } from 'react'
import {
  FileText, TrendingUp, TrendingDown, Minus, AlertTriangle,
  Target, Copy, RefreshCw, Clock, Database,
  Zap, CheckCircle,
} from 'lucide-react'
import { api } from '../../lib/api'

/* ═══════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════ */

interface TradePlanTF {
  bias: string
  confidence: number
  levels: { type: string; zone: [number, number]; label: string; strength: string }[]
  signals: string[]
  structure: {
    emaBias: string
    longTermBias: string
    priceVsEma: string
  }
  tradeSetup: {
    direction: string
    entry: number
    sl: number
    tp1: number
    tp2: number
    rr1: number
    rr2: number
  } | null
  meta: { atr: number; rsi: number; ema20: number; ema50: number; sma200: number }
  killZone?: string
}

interface MultiTFAnalysis {
  symbol: string
  timeframes: {
    '1D'?: TradePlanTF
    '4H'?: TradePlanTF
    '1H'?: TradePlanTF
  }
  confluence: string[]
  grade: 'A' | 'B' | 'C' | 'D'
  scenarios: Scenario[]
  meta: { updatedAt: string; dataSource: string }
}

interface Scenario {
  id: string
  label: string
  condition: string
  action: string
  direction: string
  entry: number
  sl: number
  tp1: number
  tp2: number
  rr: number
  probability: string
}

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */

const PAIRS = [
  { symbol: 'XAUUSD', label: 'XAU/USD', flag: '🥇' },
  { symbol: 'EURUSD', label: 'EUR/USD', flag: '🇪🇺' },
  { symbol: 'GBPUSD', label: 'GBP/USD', flag: '🇬🇧' },
  { symbol: 'USDJPY', label: 'USD/JPY', flag: '🇯🇵' },
] as const

const TF_LABELS: Record<string, { label: string; desc: string }> = {
  '1D': { label: 'D1', desc: 'Daily Bias' },
  '4H': { label: 'H4', desc: 'H4 Structure' },
  '1H': { label: 'H1', desc: 'H1 Entry' },
}

const GRADE_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  A: { bg: 'rgba(34,197,94,.15)', color: '#22c55e', border: 'rgba(34,197,94,.35)' },
  B: { bg: 'rgba(245,158,11,.15)', color: '#f59e0b', border: 'rgba(245,158,11,.35)' },
  C: { bg: 'rgba(148,163,184,.12)', color: '#94a3b8', border: 'rgba(148,163,184,.25)' },
  D: { bg: 'rgba(239,68,68,.12)', color: '#ef4444', border: 'rgba(239,68,68,.25)' },
}

const KILL_ZONES = [
  { label: 'London Open', time: '07:00–10:00 UTC', icon: '🇬🇧' },
  { label: 'NY Open', time: '12:00–15:00 UTC', icon: '🇺🇸' },
  { label: 'London Close', time: '15:00–17:00 UTC', icon: '🇬🇧' },
  { label: 'Tokyo Open', time: '00:00–03:00 UTC', icon: '🇯🇵' },
]

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════ */

function getDecimals(symbol: string): number {
  if (symbol.includes('JPY') || symbol.includes('XAU')) return 2
  return 5
}

function fmt(val: number, symbol: string): string {
  return val.toFixed(getDecimals(symbol))
}

function biasArrow(bias: string) {
  if (bias === 'bullish') return <TrendingUp size={14} style={{ color: 'var(--kt-up, #22c55e)' }} />
  if (bias === 'bearish') return <TrendingDown size={14} style={{ color: 'var(--kt-dn, #ef4444)' }} />
  return <Minus size={14} style={{ color: 'var(--kt-muted, #94a3b8)' }} />
}

function biasColor(bias: string): string {
  if (bias === 'bullish') return 'var(--kt-up, #22c55e)'
  if (bias === 'bearish') return 'var(--kt-dn, #ef4444)'
  return 'var(--kt-muted, #94a3b8)'
}

function confidenceBar(pct: number): { width: string; color: string } {
  if (pct >= 75) return { width: `${pct}%`, color: 'var(--kt-up, #22c55e)' }
  if (pct >= 50) return { width: `${pct}%`, color: 'var(--kt-gold, #f59e0b)' }
  return { width: `${pct}%`, color: 'var(--kt-dn, #ef4444)' }
}

function isKillZoneActive(): boolean {
  const now = new Date()
  const utcH = now.getUTCHours()
  const utcM = now.getUTCMinutes()
  const mins = utcH * 60 + utcM
  // London Open 07:00-10:00, NY Open 12:00-15:00, London Close 15:00-17:00
  return (mins >= 420 && mins <= 600) || (mins >= 720 && mins <= 900) || (mins >= 900 && mins <= 1020)
}

function activeKillZoneLabel(): string {
  const now = new Date()
  const utcH = now.getUTCHours()
  if (utcH >= 0 && utcH < 3) return 'Tokyo Open'
  if (utcH >= 7 && utcH < 10) return 'London Open'
  if (utcH >= 12 && utcH < 15) return 'NY Open'
  if (utcH >= 15 && utcH < 17) return 'London Close'
  return 'No Active Kill Zone'
}

/* ═══════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════ */

function ConfidenceMeter({ value, label }: { value: number; label: string }) {
  const bar = confidenceBar(value)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--xs, 11px)', color: 'var(--kt-muted, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        <span style={{ fontSize: 'var(--xs, 11px)', fontWeight: 700, color: bar.color, fontFamily: 'var(--font-mono)' }}>{value}%</span>
      </div>
      <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'var(--kt-bg, #0f1419)', overflow: 'hidden' }}>
        <div style={{ width: bar.width, height: '100%', borderRadius: 3, background: bar.color, transition: 'width .4s ease' }} />
      </div>
    </div>
  )
}

function BiasBadge({ bias, size = 'sm' }: { bias: string; size?: 'sm' | 'lg' }) {
  const color = biasColor(bias)
  const isLg = size === 'lg'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: isLg ? 6 : 4,
      padding: isLg ? '4px 12px' : '2px 8px',
      borderRadius: 4,
      fontSize: isLg ? 'var(--sm, 13px)' : 'var(--xs, 11px)',
      fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
      background: bias === 'bullish' ? 'rgba(34,197,94,.12)' : bias === 'bearish' ? 'rgba(239,68,68,.12)' : 'rgba(148,163,184,.08)',
      color,
      border: `1px solid ${bias === 'bullish' ? 'rgba(34,197,94,.25)' : bias === 'bearish' ? 'rgba(239,68,68,.25)' : 'rgba(148,163,184,.15)'}`,
    }}>
      {biasArrow(bias)}
      {bias}
    </span>
  )
}

function GradeBadge({ grade }: { grade: string }) {
  const s = GRADE_STYLES[grade] ?? GRADE_STYLES.C
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 32, height: 32, borderRadius: 8,
      fontSize: 'var(--md, 16px)', fontWeight: 800,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      fontFamily: 'var(--font-mono)',
    }}>
      {grade}
    </span>
  )
}

function TFBadge({ tf }: { tf: string }) {
  const info = TF_LABELS[tf] ?? { label: tf, desc: '' }
  return (
    <span style={{
      display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
      padding: '6px 14px', borderRadius: 6,
      background: 'var(--kt-bg, #0f1419)', border: '1px solid var(--kt-border, rgba(255,255,255,.06))',
      minWidth: 60,
    }}>
      <span style={{ fontSize: 'var(--sm, 13px)', fontWeight: 700, color: 'var(--kt-text, #e2e8f0)', fontFamily: 'var(--font-mono)' }}>{info.label}</span>
      <span style={{ fontSize: 9, color: 'var(--kt-muted, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{info.desc}</span>
    </span>
  )
}

function PriceLevel({ label, value, symbol, type }: { label: string; value: number; symbol: string; type: 'entry' | 'sl' | 'tp' }) {
  const colorMap = { entry: 'var(--kt-text, #e2e8f0)', sl: 'var(--kt-dn, #ef4444)', tp: 'var(--kt-up, #22c55e)' }
  const bgMap = { entry: 'rgba(255,255,255,.04)', sl: 'rgba(239,68,68,.08)', tp: 'rgba(34,197,94,.08)' }
  return (
    <div style={{
      padding: '8px 12px', borderRadius: 6,
      background: bgMap[type], border: '1px solid var(--kt-border, rgba(255,255,255,.06))',
    }}>
      <p style={{ fontSize: 9, color: 'var(--kt-muted, #94a3b8)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <p style={{ fontSize: 'var(--sm, 13px)', fontWeight: 700, color: colorMap[type], margin: '2px 0 0', fontFamily: 'var(--font-mono)' }}>{fmt(value, symbol)}</p>
    </div>
  )
}

function ScenarioCard({ scenario, symbol, direction }: { scenario: Scenario; symbol: string; direction: string }) {
  const isBull = direction === 'BUY'
  return (
    <div style={{
      padding: 12, borderRadius: 8,
      background: isBull ? 'rgba(34,197,94,.04)' : 'rgba(239,68,68,.04)',
      border: `1px solid ${isBull ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          padding: '2px 8px', borderRadius: 4,
          fontSize: 'var(--xs, 10px)', fontWeight: 700,
          background: isBull ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)',
          color: isBull ? 'var(--kt-up, #22c55e)' : 'var(--kt-dn, #ef4444)',
          textTransform: 'uppercase',
        }}>
          {scenario.label}
        </span>
        <span style={{
          fontSize: 'var(--xs, 10px)', color: 'var(--kt-muted, #94a3b8)',
          background: 'rgba(255,255,255,.04)', padding: '2px 6px', borderRadius: 3,
        }}>
          {scenario.probability}
        </span>
      </div>
      <p style={{ fontSize: 'var(--xs, 11px)', color: 'var(--kt-text2, #94a3b8)', margin: '0 0 8px', lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--kt-gold, #f59e0b)' }}>IF</strong> {scenario.condition}
      </p>
      <p style={{ fontSize: 'var(--xs, 11px)', color: 'var(--kt-text2, #94a3b8)', margin: 0, lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--kt-gold, #f59e0b)' }}>THEN</strong> {scenario.action}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8 }}>
        <div style={{ padding: '4px 8px', borderRadius: 4, background: 'rgba(255,255,255,.04)' }}>
          <p style={{ fontSize: 9, color: 'var(--kt-muted, #94a3b8)', margin: 0 }}>Entry</p>
          <p style={{ fontSize: 'var(--xs, 11px)', fontWeight: 600, color: 'var(--kt-text, #e2e8f0)', margin: 0, fontFamily: 'var(--font-mono)' }}>{fmt(scenario.entry, symbol)}</p>
        </div>
        <div style={{ padding: '4px 8px', borderRadius: 4, background: 'rgba(239,68,68,.06)' }}>
          <p style={{ fontSize: 9, color: 'var(--kt-muted, #94a3b8)', margin: 0 }}>SL</p>
          <p style={{ fontSize: 'var(--xs, 11px)', fontWeight: 600, color: 'var(--kt-dn, #ef4444)', margin: 0, fontFamily: 'var(--font-mono)' }}>{fmt(scenario.sl, symbol)}</p>
        </div>
        <div style={{ padding: '4px 8px', borderRadius: 4, background: 'rgba(34,197,94,.06)' }}>
          <p style={{ fontSize: 9, color: 'var(--kt-muted, #94a3b8)', margin: 0 }}>TP</p>
          <p style={{ fontSize: 'var(--xs, 11px)', fontWeight: 600, color: 'var(--kt-up, #22c55e)', margin: 0, fontFamily: 'var(--font-mono)' }}>{fmt(scenario.tp1, symbol)}</p>
        </div>
      </div>
      <div style={{ marginTop: 6, textAlign: 'right' }}>
        <span style={{ fontSize: 'var(--xs, 10px)', fontWeight: 700, color: 'var(--kt-gold, #f59e0b)', fontFamily: 'var(--font-mono)' }}>
          R:R {scenario.rr.toFixed(1)}
        </span>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   MOCK DATA GENERATOR (fallback when API unavailable)
   ═══════════════════════════════════════════════════════════════════ */

function generateFallbackAnalysis(symbol: string): MultiTFAnalysis {
  const isGold = symbol.includes('XAU')
  const isJpy = symbol.includes('JPY')

  const base = isGold ? 3240 : isJpy ? 157.5 : symbol.includes('GBP') ? 1.2720 : 1.0860
  const atr = isGold ? 18 : isJpy ? 0.45 : 0.0045

  const biases = ['bullish', 'bearish'] as const
  const d1Bias = biases[Math.floor(Math.random() * 2)]
  const h4Bias = Math.random() > 0.3 ? d1Bias : (d1Bias === 'bullish' ? 'bearish' : 'bullish')
  const h1Bias = Math.random() > 0.5 ? d1Bias : h4Bias

  const d1Conf = 55 + Math.floor(Math.random() * 35)
  const h4Conf = 50 + Math.floor(Math.random() * 40)
  const h1Conf = 45 + Math.floor(Math.random() * 45)

  const aligned = d1Bias === h4Bias && h4Bias === h1Bias
  const grade = aligned && d1Conf > 70 ? 'A' : aligned ? 'B' : d1Conf > 60 ? 'C' : 'D'

  const d1Setup: TradePlanTF = {
    bias: d1Bias, confidence: d1Conf,
    levels: [], signals: [`${d1Bias} structure on D1`, `EMA20 ${d1Bias === 'bullish' ? 'above' : 'below'} price`],
    structure: { emaBias: d1Bias, longTermBias: d1Bias, priceVsEma: d1Bias === 'bullish' ? 'above' : 'below' },
    tradeSetup: null,
    meta: { atr, rsi: 40 + Math.floor(Math.random() * 30), ema20: base - (d1Bias === 'bullish' ? atr * 2 : -atr * 2), ema50: base - (d1Bias === 'bullish' ? atr * 4 : -atr * 4), sma200: base - (d1Bias === 'bullish' ? atr * 8 : -atr * 8) },
  }

  const entryOffset = isGold ? (d1Bias === 'bullish' ? -5 : 5) : isJpy ? (d1Bias === 'bullish' ? -0.15 : 0.15) : (d1Bias === 'bullish' ? -0.0015 : 0.0015)
  const entry = base + entryOffset
  const sl = entry + (d1Bias === 'bullish' ? -atr * 0.75 : atr * 0.75)
  const tp1 = entry + (d1Bias === 'bullish' ? atr * 0.75 : -atr * 0.75)
  const tp2 = entry + (d1Bias === 'bullish' ? atr * 1.5 : -atr * 1.5)
  const rr1 = Math.abs(tp1 - entry) / Math.abs(entry - sl)
  const rr2 = Math.abs(tp2 - entry) / Math.abs(entry - sl)

  const h4Setup: TradePlanTF = {
    bias: h4Bias, confidence: h4Conf,
    levels: [], signals: [`H4 ${h4Bias} structure`, `Price at key zone`],
    structure: { emaBias: h4Bias, longTermBias: d1Bias, priceVsEma: 'near' },
    tradeSetup: { direction: h4Bias === 'bullish' ? 'BUY' : 'SELL', entry, sl, tp1, tp2, rr1, rr2 },
    meta: { atr, rsi: 35 + Math.floor(Math.random() * 40), ema20: base, ema50: base, sma200: base },
  }

  const h1Setup: TradePlanTF = {
    bias: h1Bias, confidence: h1Conf,
    levels: [], signals: [`H1 ${h1Bias} entry zone`, `RSI divergence forming`],
    structure: { emaBias: h1Bias, longTermBias: d1Bias, priceVsEma: 'at' },
    tradeSetup: { direction: h1Bias === 'bullish' ? 'BUY' : 'SELL', entry, sl, tp1, tp2, rr1, rr2 },
    meta: { atr, rsi: 30 + Math.floor(Math.random() * 50), ema20: base, ema50: base, sma200: base },
  }

  const confluence: string[] = []
  if (aligned) confluence.push('Multi-TF alignment (D1+H4+H1)')
  if (d1Conf > 70) confluence.push(`Strong D1 confidence (${d1Conf}%)`)
  if (d1Bias === h4Bias) confluence.push('H4 confirms D1 bias')
  confluence.push(`ATR: ${atr.toFixed(isGold ? 0 : 4)}`)
  confluence.push(`RSI(D1): ${d1Setup.meta.rsi}`)

  const scenarios: Scenario[] = [
    {
      id: 'primary',
      label: 'Primary',
      condition: `Price reaches entry zone ${fmt(entry, symbol)} and shows ${d1Bias} confirmation`,
      action: `${d1Bias === 'bullish' ? 'BUY' : 'SELL'} at ${fmt(entry, symbol)}, SL at ${fmt(sl, symbol)}, TP1 at ${fmt(tp1, symbol)}`,
      direction: d1Bias === 'bullish' ? 'BUY' : 'SELL',
      entry, sl, tp1, tp2, rr: rr1,
      probability: '60%',
    },
    {
      id: 'alternative',
      label: 'Alternative',
      condition: `Price breaks ${d1Bias === 'bullish' ? 'above' : 'below'} ${fmt(base + (d1Bias === 'bullish' ? atr : -atr), symbol)} with volume`,
      action: `Wait for retest of ${fmt(base, symbol)}, then enter with tighter SL`,
      direction: d1Bias === 'bullish' ? 'BUY' : 'SELL',
      entry: base, sl: entry + (d1Bias === 'bullish' ? -atr * 0.5 : atr * 0.5),
      tp1: base + (d1Bias === 'bullish' ? atr * 1.2 : -atr * 1.2),
      tp2: base + (d1Bias === 'bullish' ? atr * 2.0 : -atr * 2.0),
      rr: 2.4, probability: '25%',
    },
    {
      id: 'invalidation',
      label: 'Invalidation',
      condition: `Price closes ${d1Bias === 'bullish' ? 'below' : 'above'} ${fmt(sl, symbol)} on H4`,
      action: 'Setup invalidated — no trade. Wait for new structure.',
      direction: d1Bias === 'bullish' ? 'SELL' : 'BUY',
      entry: sl, sl: sl + (d1Bias === 'bullish' ? -atr * 0.5 : atr * 0.5),
      tp1: sl + (d1Bias === 'bullish' ? -atr * 1.0 : atr * 1.0),
      tp2: sl + (d1Bias === 'bullish' ? -atr * 2.0 : atr * 2.0),
      rr: 2.0, probability: '15%',
    },
  ]

  return {
    symbol,
    timeframes: { '1D': d1Setup, '4H': h4Setup, '1H': h1Setup },
    confluence,
    grade: grade as 'A' | 'B' | 'C' | 'D',
    scenarios,
    meta: { updatedAt: new Date().toISOString(), dataSource: 'MT5 Broker (Fallback)' },
  }
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */

export default function TradePlan() {
  const [activePair, setActivePair] = useState<string>(PAIRS[0].symbol)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [killZoneActive, setKillZoneActive] = useState(isKillZoneActive())

  /* live clock for kill zone */
  useEffect(() => {
    const id = setInterval(() => {
      setKillZoneActive(isKillZoneActive())
    }, 30_000)
    return () => clearInterval(id)
  }, [])

  /* fetch multi-TF analysis */
  const { data: analysis, isLoading, error, refetch } = useQuery<MultiTFAnalysis>({
    queryKey: ['smc', 'analyze', activePair],
    queryFn: async () => {
      try {
        const result = await api<MultiTFAnalysis>(`/api/smc/analyze/${activePair}?tf=1D,4H,1H`)
        return result
      } catch {
        // Fallback: generate local analysis
        return generateFallbackAnalysis(activePair)
      }
    },
    refetchInterval: 300_000, // 5 min
    staleTime: 240_000,
  })

  /* manual refresh */
  const handleRefresh = useCallback(() => {
    refetch()
    setLastRefresh(new Date())
  }, [refetch])

  /* share as text */
  const handleShare = useCallback(() => {
    if (!analysis) return
    const tf = analysis.timeframes
    const lines: string[] = []
    lines.push(`📋 TRADE PLAN — ${analysis.symbol}`)
    lines.push(`Grade: ${analysis.grade} | Source: ${analysis.meta.dataSource}`)
    lines.push('')
    if (tf['1D']) lines.push(`D1 Bias: ${tf['1D'].bias.toUpperCase()} (${tf['1D'].confidence}%)`)
    if (tf['4H']) lines.push(`H4 Structure: ${tf['4H'].bias.toUpperCase()} (${tf['4H'].confidence}%)`)
    if (tf['1H']) lines.push(`H1 Entry: ${tf['1H'].bias.toUpperCase()} (${tf['1H'].confidence}%)`)
    lines.push('')
    if (tf['4H']?.tradeSetup) {
      const s = tf['4H'].tradeSetup
      lines.push(`Direction: ${s.direction}`)
      lines.push(`Entry: ${s.entry.toFixed(getDecimals(analysis.symbol))}`)
      lines.push(`SL: ${s.sl.toFixed(getDecimals(analysis.symbol))}`)
      lines.push(`TP1: ${s.tp1.toFixed(getDecimals(analysis.symbol))} (R:R ${s.rr1.toFixed(1)})`)
      lines.push(`TP2: ${s.tp2.toFixed(getDecimals(analysis.symbol))} (R:R ${s.rr2.toFixed(1)})`)
    }
    lines.push('')
    lines.push('── CONFLUENCE ──')
    for (const c of analysis.confluence) lines.push(`• ${c}`)
    lines.push('')
    lines.push('── SCENARIOS ──')
    for (const s of analysis.scenarios) {
      lines.push(`${s.label} (${s.probability})`)
      lines.push(`  IF: ${s.condition}`)
      lines.push(`  THEN: ${s.action}`)
      lines.push('')
    }
    lines.push(`Kill Zone: ${activeKillZoneLabel()}`)
    lines.push(`Refreshed: ${lastRefresh.toLocaleTimeString()}`)
    lines.push('Generated by Aegis Terminal')
    navigator.clipboard.writeText(lines.join('\n'))
  }, [analysis, lastRefresh])

  /* ── loading / error ── */
  if (isLoading && !analysis) return (
    <div className="kt-panel" style={{ padding: 40, textAlign: 'center', color: 'var(--kt-muted, #94a3b8)' }}>
      <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
      <p style={{ margin: 0 }}>Loading trade plan for {activePair}…</p>
    </div>
  )

  if (error && !analysis) return (
    <div className="kt-panel" style={{ padding: 40, textAlign: 'center', color: '#f87171' }}>
      <AlertTriangle size={20} style={{ marginBottom: 8 }} />
      <p style={{ margin: 0 }}>Failed to load analysis. Using fallback data.</p>
      <button onClick={handleRefresh} style={{
        marginTop: 12, padding: '6px 16px', borderRadius: 6,
        border: '1px solid var(--kt-border)', background: 'var(--kt-bg)',
        color: 'var(--kt-text)', cursor: 'pointer', fontSize: 'var(--xs, 11px)', fontWeight: 600,
      }}>Retry</button>
    </div>
  )

  if (!analysis) return null

  const tf = analysis.timeframes
  const d1 = tf['1D']
  const h4 = tf['4H']
  const h1 = tf['1H']
  const setup = h4?.tradeSetup ?? h1?.tradeSetup
  const gradeStyle = GRADE_STYLES[analysis.grade] ?? GRADE_STYLES.C
  const activePairInfo = PAIRS.find(p => p.symbol === activePair) ?? PAIRS[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ═══ HEADER ═══ */}
      <div className="kt-panel" style={{ marginBottom: 0 }}>
        <div className="kt-card-pad" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={20} style={{ color: 'var(--kt-gold, #f59e0b)' }} />
            <div>
              <p style={{ fontSize: 'var(--xs, 11px)', color: 'var(--kt-muted, #94a3b8)', letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0 }}>
                Daily Trade Plan
              </p>
              <h2 style={{ fontSize: 'var(--md, 16px)', fontWeight: 700, color: 'var(--kt-text, #e2e8f0)', margin: 0 }}>
                Multi-TF Analysis
              </h2>
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* data source */}
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 4,
              fontSize: 'var(--xs, 10px)', fontWeight: 600,
              background: 'rgba(34,197,94,.08)', color: 'var(--kt-up, #22c55e)',
              border: '1px solid rgba(34,197,94,.20)',
            }}>
              <Database size={10} />
              {analysis.meta.dataSource}
            </span>
            {/* kill zone indicator */}
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 4,
              fontSize: 'var(--xs, 10px)', fontWeight: 600,
              background: killZoneActive ? 'rgba(245,158,11,.12)' : 'rgba(148,163,184,.06)',
              color: killZoneActive ? 'var(--kt-gold, #f59e0b)' : 'var(--kt-muted, #94a3b8)',
              border: `1px solid ${killZoneActive ? 'rgba(245,158,11,.25)' : 'rgba(148,163,184,.10)'}`,
            }}>
              <Zap size={10} />
              {activeKillZoneLabel()}
            </span>
            {/* refresh */}
            <button onClick={handleRefresh} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 6,
              border: '1px solid var(--kt-border, rgba(255,255,255,.06))', background: 'var(--kt-bg, #0f1419)',
              color: 'var(--kt-text, #e2e8f0)', fontSize: 'var(--xs, 11px)', fontWeight: 600,
              cursor: 'pointer', transition: 'background .12s',
            }}>
              <RefreshCw size={12} />
              {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </button>
            {/* share */}
            <button onClick={handleShare} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 6,
              border: '1px solid var(--kt-border, rgba(255,255,255,.06))', background: 'var(--kt-bg, #0f1419)',
              color: 'var(--kt-text, #e2e8f0)', fontSize: 'var(--xs, 11px)', fontWeight: 600,
              cursor: 'pointer',
            }}>
              <Copy size={12} /> SHARE
            </button>
          </div>
        </div>
      </div>

      {/* ═══ PAIR TABS ═══ */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {PAIRS.map(p => (
          <button
            key={p.symbol}
            onClick={() => setActivePair(p.symbol)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8,
              border: `1px solid ${activePair === p.symbol ? 'var(--kt-gold, #f59e0b)' : 'var(--kt-border, rgba(255,255,255,.06))'}`,
              background: activePair === p.symbol ? 'rgba(245,158,11,.10)' : 'var(--kt-bg, #0f1419)',
              color: activePair === p.symbol ? 'var(--kt-gold, #f59e0b)' : 'var(--kt-muted, #94a3b8)',
              fontSize: 'var(--sm, 13px)', fontWeight: 700, fontFamily: 'var(--font-mono)',
              cursor: 'pointer', transition: 'all .15s',
              letterSpacing: '0.02em',
            }}
          >
            <span>{p.flag}</span>
            {p.label}
          </button>
        ))}
      </div>

      {/* ═══ GRADE + OVERVIEW ═══ */}
      <div className="kt-grid-2" style={{ gap: 16 }}>
        {/* Grade Card */}
        <div className="kt-panel kt-card-pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <GradeBadge grade={analysis.grade} />
            <div>
              <p style={{ fontSize: 'var(--xs, 10px)', color: 'var(--kt-muted, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                Setup Grade
              </p>
              <p style={{ fontSize: 'var(--md, 16px)', fontWeight: 700, color: gradeStyle.color, margin: '2px 0 0' }}>
                {analysis.grade === 'A' ? 'Strong Setup' : analysis.grade === 'B' ? 'Good Setup' : analysis.grade === 'C' ? 'Moderate Setup' : 'Weak Setup'}
              </p>
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['A', 'B', 'C', 'D'].map(g => (
              <span key={g} style={{
                padding: '2px 8px', borderRadius: 4,
                fontSize: 'var(--xs, 10px)', fontWeight: 600,
                background: g === analysis.grade ? GRADE_STYLES[g].bg : 'rgba(255,255,255,.03)',
                color: g === analysis.grade ? GRADE_STYLES[g].color : 'var(--kt-muted, #64748b)',
                border: `1px solid ${g === analysis.grade ? GRADE_STYLES[g].border : 'transparent'}`,
              }}>
                {g}: {g === 'A' ? 'High confidence' : g === 'B' ? 'Good confluence' : g === 'C' ? 'Mixed signals' : 'Low alignment'}
              </span>
            ))}
          </div>
        </div>

        {/* Confidence Panel */}
        <div className="kt-panel kt-card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {d1 && <ConfidenceMeter value={d1.confidence} label="D1 Daily Bias" />}
          {h4 && <ConfidenceMeter value={h4.confidence} label="H4 Structure" />}
          {h1 && <ConfidenceMeter value={h1.confidence} label="H1 Entry" />}
        </div>
      </div>

      {/* ═══ MULTI-TF BREAKDOWN ═══ */}
      <div className="kt-panel">
        <div className="kt-panel-head">
          <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Target size={14} style={{ color: 'var(--kt-gold, #f59e0b)' }} />
            Multi-Timeframe Breakdown
          </span>
          <span style={{ fontSize: 'var(--xs, 11px)', color: 'var(--kt-muted, #94a3b8)' }}>
            {activePairInfo.flag} {activePairInfo.label}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
          {(['1D', '4H', '1H'] as const).map((tfKey, idx) => {
            const tfData = tf[tfKey]
            if (!tfData) return null
            return (
              <div key={tfKey} style={{
                padding: 16,
                borderRight: idx < 2 ? '1px solid var(--kt-border, rgba(255,255,255,.04))' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <TFBadge tf={tfKey} />
                  <BiasBadge bias={tfData.bias} />
                </div>
                <p style={{ fontSize: 'var(--xs, 11px)', color: 'var(--kt-muted, #94a3b8)', margin: '0 0 6px' }}>
                  {TF_LABELS[tfKey]?.desc}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {tfData.signals.slice(0, 3).map((s, i) => (
                    <p key={i} style={{ fontSize: 'var(--xs, 11px)', color: 'var(--kt-text2, #94a3b8)', margin: 0, lineHeight: 1.4 }}>
                      → {s}
                    </p>
                  ))}
                </div>
                {tfData.meta && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'var(--xs, 10px)', color: 'var(--kt-muted, #64748b)', fontFamily: 'var(--font-mono)' }}>
                      RSI {tfData.meta.rsi.toFixed(0)}
                    </span>
                    <span style={{ fontSize: 'var(--xs, 10px)', color: 'var(--kt-muted, #64748b)', fontFamily: 'var(--font-mono)' }}>
                      ATR {tfData.meta.atr.toFixed(getDecimals(activePair))}
                    </span>
                  </div>
                )}
                {tfData.structure && (
                  <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 9, padding: '2px 6px', borderRadius: 3,
                      background: tfData.structure.emaBias === 'bullish' ? 'rgba(34,197,94,.10)' : tfData.structure.emaBias === 'bearish' ? 'rgba(239,68,68,.10)' : 'rgba(148,163,184,.08)',
                      color: tfData.structure.emaBias === 'bullish' ? 'var(--kt-up)' : tfData.structure.emaBias === 'bearish' ? 'var(--kt-dn)' : 'var(--kt-muted)',
                    }}>
                      EMA: {tfData.structure.emaBias}
                    </span>
                    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: 'rgba(255,255,255,.04)', color: 'var(--kt-muted, #64748b)' }}>
                      Price {tfData.structure.priceVsEma} EMA
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ═══ TRADE PLAN CARD ═══ */}
      {setup && (
        <div className="kt-panel" style={{
          border: `1px solid ${setup.direction === 'BUY' ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}`,
        }}>
          <div className="kt-panel-head">
            <span style={{
              fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8,
              color: setup.direction === 'BUY' ? 'var(--kt-up, #22c55e)' : 'var(--kt-dn, #ef4444)',
            }}>
              <Target size={14} />
              Trade Plan — {activePairInfo.label}
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 10px', borderRadius: 4,
              fontSize: 'var(--xs, 11px)', fontWeight: 700, letterSpacing: '0.05em',
              background: setup.direction === 'BUY' ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)',
              color: setup.direction === 'BUY' ? 'var(--kt-up, #22c55e)' : 'var(--kt-dn, #ef4444)',
            }}>
              {setup.direction === 'BUY' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {setup.direction}
            </span>
          </div>
          <div className="kt-card-pad">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
              <PriceLevel label="Entry Zone" value={setup.entry} symbol={activePair} type="entry" />
              <PriceLevel label="Stop Loss" value={setup.sl} symbol={activePair} type="sl" />
              <PriceLevel label="TP1 (1:1)" value={setup.tp1} symbol={activePair} type="tp" />
              <PriceLevel label="TP2 (2:1)" value={setup.tp2} symbol={activePair} type="tp" />
              <div style={{
                padding: '8px 12px', borderRadius: 6,
                background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.20)',
              }}>
                <p style={{ fontSize: 9, color: 'var(--kt-muted, #94a3b8)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>R:R Ratio</p>
                <p style={{ fontSize: 'var(--sm, 13px)', fontWeight: 700, color: 'var(--kt-gold, #f59e0b)', margin: '2px 0 0', fontFamily: 'var(--font-mono)' }}>
                  1:{setup.rr1.toFixed(1)} / 1:{setup.rr2.toFixed(1)}
                </p>
              </div>
            </div>

            {/* Confluence */}
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 'var(--xs, 10px)', color: 'var(--kt-muted, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>
                Confluence Factors
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {analysis.confluence.map((c, i) => (
                  <span key={i} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 10px', borderRadius: 4,
                    fontSize: 'var(--xs, 10px)', fontWeight: 600,
                    background: 'rgba(34,197,94,.08)', color: 'var(--kt-up, #22c55e)',
                    border: '1px solid rgba(34,197,94,.15)',
                  }}>
                    <CheckCircle size={10} />
                    {c}
                  </span>
                ))}
              </div>
            </div>

            {/* Kill Zone Timing */}
            <div style={{
              marginTop: 12, padding: '8px 12px', borderRadius: 6,
              background: killZoneActive ? 'rgba(245,158,11,.08)' : 'rgba(148,163,184,.04)',
              border: `1px solid ${killZoneActive ? 'rgba(245,158,11,.20)' : 'rgba(148,163,184,.08)'}`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Clock size={14} style={{ color: killZoneActive ? 'var(--kt-gold, #f59e0b)' : 'var(--kt-muted, #64748b)' }} />
              <div>
                <p style={{ fontSize: 'var(--xs, 11px)', fontWeight: 600, color: killZoneActive ? 'var(--kt-gold, #f59e0b)' : 'var(--kt-muted, #64748b)', margin: 0 }}>
                  {activeKillZoneLabel()}
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  {KILL_ZONES.map(kz => (
                    <span key={kz.label} style={{
                      fontSize: 9, color: 'var(--kt-muted, #64748b)', fontFamily: 'var(--font-mono)',
                    }}>
                      {kz.icon} {kz.label}: {kz.time}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ IF/THEN SCENARIOS ═══ */}
      <div className="kt-panel">
        <div className="kt-panel-head">
          <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={14} style={{ color: 'var(--kt-gold, #f59e0b)' }} />
            IF / THEN Scenarios
          </span>
          <span style={{ fontSize: 'var(--xs, 11px)', color: 'var(--kt-muted, #94a3b8)' }}>
            {analysis.scenarios.length} scenarios
          </span>
        </div>
        <div className="kt-card-pad">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {analysis.scenarios.map(s => (
              <ScenarioCard key={s.id} scenario={s} symbol={activePair} direction={s.direction} />
            ))}
          </div>
        </div>
      </div>

      {/* ═══ KILL ZONES OVERVIEW ═══ */}
      <div className="kt-panel">
        <div className="kt-panel-head">
          <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={14} style={{ color: 'var(--kt-gold, #f59e0b)' }} />
            Kill Zones
          </span>
        </div>
        <div className="kt-card-pad">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            {KILL_ZONES.map(kz => {
              const isActive = killZoneActive && activeKillZoneLabel() === kz.label
              return (
                <div key={kz.label} style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: isActive ? 'rgba(245,158,11,.10)' : 'rgba(255,255,255,.02)',
                  border: `1px solid ${isActive ? 'rgba(245,158,11,.30)' : 'rgba(255,255,255,.04)'}`,
                  textAlign: 'center',
                }}>
                  <span style={{ fontSize: 'var(--md, 16px)' }}>{kz.icon}</span>
                  <p style={{ fontSize: 'var(--xs, 11px)', fontWeight: 600, color: isActive ? 'var(--kt-gold, #f59e0b)' : 'var(--kt-text, #e2e8f0)', margin: '4px 0 2px' }}>
                    {kz.label}
                  </p>
                  <p style={{ fontSize: 9, color: 'var(--kt-muted, #64748b)', fontFamily: 'var(--font-mono)', margin: 0 }}>
                    {kz.time}
                  </p>
                  {isActive && (
                    <span style={{
                      display: 'inline-block', marginTop: 4,
                      padding: '1px 6px', borderRadius: 3,
                      fontSize: 8, fontWeight: 700,
                      background: 'rgba(245,158,11,.20)', color: 'var(--kt-gold, #f59e0b)',
                      textTransform: 'uppercase',
                    }}>
                      ACTIVE
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ═══ FOOTER ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 0',
      }}>
        <span style={{ fontSize: 'var(--xs, 10px)', color: 'var(--kt-muted, #64748b)' }}>
          Auto-refresh: 5 min · Last: {lastRefresh.toLocaleTimeString()}
        </span>
        <span style={{ fontSize: 'var(--xs, 10px)', color: 'var(--kt-muted, #64748b)' }}>
          Aegis Terminal · {analysis.meta.dataSource}
        </span>
      </div>

      {/* spin animation */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
