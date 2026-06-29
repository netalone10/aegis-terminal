import { useQuery } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import { FileText, Copy, TrendingUp, TrendingDown, Minus, AlertTriangle, Shield, Target, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../../lib/api'

/* ── types ──────────────────────────────────────────────────────── */
interface PairCard {
  symbol: string
  bias: string
  confidence: number
  premiumDiscount: string
  action: string
  keyLevels: { type: string; label: string; zone: number[]; strength: string }[]
  tradeSetup: { direction: string; entry: number; sl: number; tp1: number; tp2: number; rr1: number; rr2: number } | null
  signals: string[]
  meta: { atr: number; rsi: number; ema20: number; ema50: number }
}

interface NewsEvent {
  title: string
  currency: string
  impact: string
  date: string
  forecast: string
  previous: string
  actual: string | null
}

interface BestSetup {
  symbol: string
  direction: string
  confidence: number
  entry: number
  sl: number
  tp1: number
  tp2: number
  rr: number
  reason: string
}

interface DailyPlan {
  date: string
  overview: {
    overallBias: string
    riskMood: string
    marketOpen: boolean
    killZones: string[]
    pairCount: number
    bullCount: number
    bearCount: number
    neutralCount: number
  }
  pairs: PairCard[]
  news: NewsEvent[]
  bestSetup: BestSetup | null
  riskBudget: {
    accountSize: number
    riskPct: number
    maxRisk: number
    label: string
  }
  checklist: string[]
}

/* ── constants ──────────────────────────────────────────────────── */
const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  CNY: '🇨🇳', IDR: '🇮🇩', AUD: '🇦🇺', NZD: '🇳🇿',
  CAD: '🇨🇦', CHF: '🇨🇭',
}

/* ── helpers ────────────────────────────────────────────────────── */
function biasArrow(bias: string) {
  if (bias === 'bullish') return <TrendingUp size={16} style={{ color: 'var(--kt-up, #22c55e)' }} />
  if (bias === 'bearish') return <TrendingDown size={16} style={{ color: 'var(--kt-dn, #ef4444)' }} />
  return <Minus size={16} style={{ color: 'var(--kt-muted)' }} />
}

function biasColor(bias: string) {
  if (bias === 'bullish') return 'var(--kt-up, #22c55e)'
  if (bias === 'bearish') return 'var(--kt-dn, #ef4444)'
  return 'var(--kt-muted)'
}

function actionBadge(action: string) {
  const map: Record<string, { bg: string; color: string }> = {
    BUY: { bg: 'rgba(34,197,94,.18)', color: 'var(--kt-up, #22c55e)' },
    SELL: { bg: 'rgba(239,68,68,.18)', color: 'var(--kt-dn, #ef4444)' },
    WAIT: { bg: 'rgba(148,163,184,.12)', color: 'var(--kt-muted)' },
  }
  const s = map[action] ?? map.WAIT
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 4,
      fontSize: 'var(--xs, 11px)', fontWeight: 700, letterSpacing: '0.05em',
      background: s.bg, color: s.color,
    }}>
      {action}
    </span>
  )
}

function moodLabel(mood: string) {
  if (mood === 'risk-on') return { text: 'RISK-ON', color: 'var(--kt-up, #22c55e)' }
  if (mood === 'risk-off') return { text: 'RISK-OFF', color: 'var(--kt-dn, #ef4444)' }
  return { text: 'MIXED', color: 'var(--kt-gold, #f59e0b)' }
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'NOW'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function impactDot(impact: string) {
  const colors: Record<string, string> = { high: '#ef4444', medium: '#f59e0b', low: '#64748b' }
  return <span style={{
    display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
    background: colors[impact.toLowerCase()] ?? colors.low,
  }} />
}

/* ── main component ─────────────────────────────────────────────── */
export default function TradePlan() {
  const [checked, setChecked] = useState<Record<number, boolean>>({})
  const [expandedPair, setExpandedPair] = useState<string | null>(null)

  const { data: plan, isLoading, error } = useQuery<DailyPlan>({
    queryKey: ['plan', 'daily'],
    queryFn: () => api<DailyPlan>('/api/plan/daily'),
    refetchInterval: 1_800_000, // 30 min
    staleTime: 900_000,
  })

  const toggleCheck = useCallback((i: number) => {
    setChecked(prev => ({ ...prev, [i]: !prev[i] }))
  }, [])

  /* share as formatted text */
  const handleShare = useCallback(() => {
    if (!plan) return
    const lines: string[] = []
    lines.push(`📋 DAILY TRADE PLAN — ${new Date(plan.date).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`)
    lines.push(`Market: ${plan.overview.marketOpen ? 'OPEN' : 'CLOSED'} | Bias: ${plan.overview.overallBias.toUpperCase()} | Mood: ${plan.overview.riskMood.toUpperCase()}`)
    if (plan.overview.killZones.length) lines.push(`Kill Zones: ${plan.overview.killZones.join(', ')}`)
    lines.push('')
    lines.push('── PAIRS ──')
    for (const p of plan.pairs) {
      lines.push(`${p.symbol} → ${p.action} (${p.bias}, ${p.confidence}%) | ${p.premiumDiscount}`)
      if (p.signals[0]) lines.push(`  ${p.signals[0]}`)
    }
    if (plan.bestSetup) {
      lines.push('')
      lines.push('── BEST SETUP ──')
      const b = plan.bestSetup
      lines.push(`${b.symbol} ${b.direction.toUpperCase()} @ ${b.entry?.toFixed(5)} | SL ${b.sl?.toFixed(5)} | TP ${b.tp1?.toFixed(5)} | R:R ${b.rr?.toFixed(1)}`)
    }
    lines.push('')
    lines.push(`💰 ${plan.riskBudget.label}`)
    lines.push('')
    if (plan.news.length) {
      lines.push('── NEWS TODAY ──')
      for (const e of plan.news) lines.push(`• ${e.currency} ${e.title} [${e.impact}]`)
    }
    lines.push('')
    lines.push('── CHECKLIST ──')
    for (const item of plan.checklist) lines.push(`☐ ${item}`)
    lines.push('')
    lines.push('Generated by Aegis Terminal')
    navigator.clipboard.writeText(lines.join('\n'))
  }, [plan])

  /* ── loading / error ── */
  if (isLoading) return (
    <div className="kt-panel" style={{ padding: 40, textAlign: 'center', color: 'var(--kt-muted)' }}>
      Generating daily plan…
    </div>
  )
  if (error || !plan) return (
    <div className="kt-panel" style={{ padding: 40, textAlign: 'center', color: '#f87171' }}>
      Failed to generate trade plan.
    </div>
  )

  const mood = moodLabel(plan.overview.riskMood)
  const today = new Date(plan.date)
  const dateStr = today.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const checkedCount = Object.values(checked).filter(Boolean).length

  return (
    <div>
      {/* ── header ────────────────────────────────────────────────── */}
      <div className="kt-panel" style={{ marginBottom: 16 }}>
        <div className="kt-card-pad" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={20} style={{ color: 'var(--kt-gold, #f59e0b)' }} />
            <div>
              <p style={{ fontSize: 'var(--xs, 11px)', color: 'var(--kt-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0 }}>
                {dateStr}
              </p>
              <h2 style={{ fontSize: 'var(--md, 16px)', fontWeight: 700, color: 'var(--kt-text)', margin: 0 }}>
                Rencana Trading Harian
              </h2>
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--xs, 11px)' }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: plan.overview.marketOpen ? 'var(--kt-up, #22c55e)' : '#ef4444',
                animation: plan.overview.marketOpen ? 'pulse 2s infinite' : 'none',
              }} />
              <span style={{ color: plan.overview.marketOpen ? 'var(--kt-up, #22c55e)' : '#ef4444', fontWeight: 600 }}>
                {plan.overview.marketOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
              </span>
            </span>
            <button
              onClick={handleShare}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 6,
                border: '1px solid var(--kt-border)', background: 'var(--kt-bg)',
                color: 'var(--kt-text)', fontSize: 'var(--xs, 11px)', fontWeight: 600,
                cursor: 'pointer', letterSpacing: '0.04em',
              }}
            >
              <Copy size={13} /> SHARE
            </button>
          </div>
        </div>
      </div>

      {/* ── overview ──────────────────────────────────────────────── */}
      <div className="kt-grid-2" style={{ marginBottom: 16 }}>
        <div className="kt-panel kt-card-pad">
          <p className="kt-kicker" style={{ marginBottom: 8 }}>OVERALL BIAS</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: biasColor(plan.overview.overallBias) }}>
              {biasArrow(plan.overview.overallBias)}
            </span>
            <span style={{ fontSize: 20, fontWeight: 800, color: biasColor(plan.overview.overallBias), textTransform: 'uppercase' }}>
              {plan.overview.overallBias}
            </span>
          </div>
          <div style={{ marginTop: 8, fontSize: 'var(--xs, 11px)', color: 'var(--kt-muted)', display: 'flex', gap: 12 }}>
            <span style={{ color: 'var(--kt-up)' }}>▲ {plan.overview.bullCount} bullish</span>
            <span style={{ color: 'var(--kt-dn)' }}>▼ {plan.overview.bearCount} bearish</span>
            {plan.overview.neutralCount > 0 && <span>— {plan.overview.neutralCount} neutral</span>}
          </div>
        </div>
        <div className="kt-panel kt-card-pad">
          <p className="kt-kicker" style={{ marginBottom: 8 }}>RISK MOOD</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: mood.color }}>{mood.text}</span>
          </div>
          {plan.overview.killZones.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 'var(--xs, 11px)', color: 'var(--kt-gold, #f59e0b)' }}>
              ⚡ {plan.overview.killZones.join(' · ')}
            </div>
          )}
          {plan.overview.killZones.length === 0 && (
            <div style={{ marginTop: 8, fontSize: 'var(--xs, 11px)', color: 'var(--kt-muted)' }}>
              No active Kill Zone
            </div>
          )}
        </div>
      </div>

      {/* ── best setup highlight ── */}
      {plan.bestSetup && (
        <div className="kt-panel" style={{
          marginBottom: 16, border: `1px solid ${biasColor(plan.bestSetup.direction === 'BUY' ? 'bullish' : 'bearish')}33`,
        }}>
          <div className="kt-card-pad">
            <p className="kt-kicker" style={{ marginBottom: 8 }}>🏆 BEST SETUP</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--md, 16px)', fontWeight: 700, color: 'var(--kt-text)', fontFamily: 'var(--font-mono)' }}>
                {plan.bestSetup.symbol}
              </span>
              {actionBadge(plan.bestSetup.direction)}
              <span style={{ fontSize: 'var(--sm, 13px)', color: 'var(--kt-muted)' }}>
                {plan.bestSetup.confidence}% confidence
              </span>
            </div>
            {plan.bestSetup.entry && (
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                {[
                  { label: 'Entry', value: plan.bestSetup.entry?.toFixed(5), color: 'var(--kt-text)' },
                  { label: 'Stop Loss', value: plan.bestSetup.sl?.toFixed(5), color: 'var(--kt-dn, #ef4444)' },
                  { label: 'TP1', value: plan.bestSetup.tp1?.toFixed(5), color: 'var(--kt-up, #22c55e)' },
                  { label: 'TP2', value: plan.bestSetup.tp2?.toFixed(5), color: 'var(--kt-up, #22c55e)' },
                  { label: 'R:R', value: plan.bestSetup.rr?.toFixed(2), color: 'var(--kt-gold, #f59e0b)' },
                ].map(l => (
                  <div key={l.label} style={{
                    padding: '8px 12px', borderRadius: 6,
                    background: 'var(--kt-bg)', border: '1px solid var(--kt-border)',
                  }}>
                    <p style={{ fontSize: 'var(--xs, 10px)', color: 'var(--kt-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l.label}</p>
                    <p style={{ fontSize: 'var(--sm, 13px)', fontWeight: 700, color: l.color, margin: '2px 0 0', fontFamily: 'var(--font-mono)' }}>{l.value}</p>
                  </div>
                ))}
              </div>
            )}
            {plan.bestSetup.reason && (
              <p style={{ marginTop: 8, fontSize: 'var(--xs, 12px)', color: 'var(--kt-text2, #94a3b8)' }}>
                {plan.bestSetup.reason}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── pair cards ── */}
      <div className="kt-panel" style={{ marginBottom: 16 }}>
        <div className="kt-panel-head">
          <span style={{ fontWeight: 600 }}>Pair Analysis</span>
          <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>{plan.pairs.length} pairs</span>
        </div>
        <div style={{ padding: 0 }}>
          {plan.pairs.map((p) => (
            <div key={p.symbol}>
              <div
                onClick={() => setExpandedPair(expandedPair === p.symbol ? null : p.symbol)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '100px 60px 1fr 72px 60px 32px',
                  alignItems: 'center',
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--kt-border, rgba(255,255,255,.04))',
                  cursor: 'pointer',
                  transition: 'background .12s',
                  background: 'transparent',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.02)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 'var(--sm, 13px)', color: 'var(--kt-text)' }}>
                  {p.symbol}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {biasArrow(p.bias)}
                  <span style={{ fontSize: 'var(--xs)', color: biasColor(p.bias), fontWeight: 600 }}>{p.confidence}%</span>
                </span>
                <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', fontStyle: 'italic' }}>
                  {p.premiumDiscount} zone
                </span>
                <span>{actionBadge(p.action)}</span>
                <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
                  {p.meta?.rsi ? `RSI ${p.meta.rsi.toFixed(0)}` : ''}
                </span>
                {expandedPair === p.symbol
                  ? <ChevronUp size={14} style={{ color: 'var(--kt-muted)' }} />
                  : <ChevronDown size={14} style={{ color: 'var(--kt-muted)' }} />
                }
              </div>

              {/* expanded detail */}
              {expandedPair === p.symbol && (
                <div style={{ padding: '12px 16px 16px', background: 'rgba(255,255,255,.015)', borderBottom: '1px solid var(--kt-border, rgba(255,255,255,.04))' }}>
                  {/* signals */}
                  {p.signals.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      {p.signals.map((s, i) => (
                        <p key={i} style={{ fontSize: 'var(--xs, 11px)', color: 'var(--kt-text2, #94a3b8)', margin: '2px 0' }}>
                          → {s}
                        </p>
                      ))}
                    </div>
                  )}
                  {/* key levels */}
                  {p.keyLevels.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                      {p.keyLevels.map((l, i) => (
                        <span key={i} style={{
                          padding: '3px 10px', borderRadius: 4,
                          fontSize: 'var(--xs, 10px)', fontWeight: 600,
                          background: l.type.includes('bullish') ? 'rgba(34,197,94,.12)' : l.type.includes('bearish') ? 'rgba(239,68,68,.12)' : 'rgba(148,163,184,.10)',
                          color: l.type.includes('bullish') ? 'var(--kt-up)' : l.type.includes('bearish') ? 'var(--kt-dn)' : 'var(--kt-muted)',
                          border: `1px solid ${l.type.includes('bullish') ? 'rgba(34,197,94,.25)' : l.type.includes('bearish') ? 'rgba(239,68,68,.25)' : 'rgba(148,163,184,.15)'}`,
                        }}>
                          {l.label}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* trade setup */}
                  {p.tradeSetup && (
                    <div style={{ display: 'flex', gap: 12, fontFamily: 'var(--font-mono)', fontSize: 'var(--xs, 11px)' }}>
                      <span>Entry: <b style={{ color: 'var(--kt-text)' }}>{p.tradeSetup.entry?.toFixed(5)}</b></span>
                      <span>SL: <b style={{ color: 'var(--kt-dn)' }}>{p.tradeSetup.sl?.toFixed(5)}</b></span>
                      <span>TP1: <b style={{ color: 'var(--kt-up)' }}>{p.tradeSetup.tp1?.toFixed(5)}</b></span>
                      <span>R:R: <b style={{ color: 'var(--kt-gold)' }}>{p.tradeSetup.rr1?.toFixed(2)}</b></span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="kt-grid-2" style={{ marginBottom: 16 }}>
        {/* ── news ── */}
        <div className="kt-panel">
          <div className="kt-panel-head">
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <AlertTriangle size={14} style={{ color: 'var(--kt-gold, #f59e0b)' }} />
              News Today
            </span>
            <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>{plan.news.length} events</span>
          </div>
          <div style={{ padding: 0 }}>
            {plan.news.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--kt-muted)', fontSize: 'var(--sm)' }}>
                No economic events today
              </div>
            )}
            {plan.news.map((e, i) => {
              const ms = new Date(e.date).getTime() - Date.now()
              const countdown = ms > 0 ? formatCountdown(ms) : 'PASSED'
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 16px',
                  borderBottom: '1px solid var(--kt-border, rgba(255,255,255,.04))',
                  fontSize: 'var(--sm, 13px)',
                  background: e.impact.toLowerCase() === 'high' && ms > 0 && ms < 7200000
                    ? 'rgba(239,68,68,.06)' : 'transparent',
                }}>
                  {impactDot(e.impact)}
                  <span style={{ fontSize: 'var(--xs)' }}>{CURRENCY_FLAGS[e.currency] ?? ''}</span>
                  <span style={{ flex: 1, color: 'var(--kt-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {e.title}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 'var(--xs, 11px)', fontWeight: 600,
                    color: countdown === 'PASSED' ? 'var(--kt-muted)' : 'var(--kt-gold, #f59e0b)',
                  }}>
                    {countdown === 'PASSED' ? '✓' : `T-${countdown}`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── risk budget ── */}
        <div className="kt-panel kt-card-pad">
          <p className="kt-kicker" style={{ marginBottom: 10 }}>RISK BUDGET</p>
          <div style={{
            padding: 16, borderRadius: 8,
            background: 'rgba(245,158,11,.08)',
            border: '1px solid rgba(245,158,11,.20)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Shield size={16} style={{ color: 'var(--kt-gold, #f59e0b)' }} />
              <span style={{ fontWeight: 700, color: 'var(--kt-gold, #f59e0b)', fontSize: 'var(--sm)' }}>
                {plan.riskBudget.riskPct}% Daily Max
              </span>
            </div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--md, 15px)', fontWeight: 700, color: 'var(--kt-text)', margin: '4px 0' }}>
              ${plan.riskBudget.maxRisk.toFixed(0)}
            </p>
            <p style={{ fontSize: 'var(--xs, 11px)', color: 'var(--kt-muted)', margin: 0 }}>
              on ${plan.riskBudget.accountSize.toLocaleString()} account
            </p>
          </div>
        </div>
      </div>

      {/* ── pre-trade checklist ── */}
      <div className="kt-panel" style={{ marginBottom: 16 }}>
        <div className="kt-panel-head">
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
            <Target size={14} style={{ color: 'var(--kt-gold, #f59e0b)' }} />
            Checklist Pra-Trade
          </span>
          <span style={{ fontSize: 'var(--xs)', color: checkedCount === plan.checklist.length ? 'var(--kt-up)' : 'var(--kt-muted)' }}>
            {checkedCount}/{plan.checklist.length}
          </span>
        </div>
        <div>
          {plan.checklist.map((item, i) => (
            <label
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 16px',
                borderBottom: '1px solid var(--kt-border, rgba(255,255,255,.04))',
                cursor: 'pointer',
                background: checked[i] ? 'rgba(34,197,94,.04)' : 'transparent',
                transition: 'background .12s',
              }}
            >
              <div
                onClick={() => toggleCheck(i)}
                style={{
                  width: 18, height: 18, borderRadius: 4,
                  border: '1px solid var(--kt-border-soft)',
                  cursor: 'pointer',
                  background: checked[i] ? 'var(--kt-upf)' : 'var(--kt-bg)',
                  color: checked[i] ? 'var(--kt-up)' : 'var(--kt-muted)',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {checked[i] ? '✓' : ''}
              </div>
              <span style={{ color: checked[i] ? 'var(--kt-text)' : 'var(--kt-text2)', fontSize: 13 }}>
                {item}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
