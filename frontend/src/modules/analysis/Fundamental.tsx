import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle,
  Shield, ArrowUpRight, ArrowDownRight, BarChart3,
  RefreshCw, Calendar, Clock, Globe,
} from 'lucide-react'
import { api } from '../../lib/api'

/* ── types ─────────────────────────────────────────────────────────── */
interface RegimeData {
  regime: 'risk-on' | 'risk-off'
  tone: 'hawkish' | 'dovish' | 'neutral'
  usdStrength: 'strong' | 'weak' | 'neutral'
  confidence: number
  details: string
}

interface ChainRelease {
  event: string
  date: string
  consensus: string
  actual: string
  surprise: string
}

interface ChainData {
  name: string
  status: 'active' | 'stalled'
  trend: 'rising' | 'falling' | 'neutral'
  releases: ChainRelease[]
  prediction: { nextEvent: string; expectation: string; confidence: number } | null
}

interface ImpactRelease {
  event: string
  date: string
  country: string
  impactTier: string
  consensus: string
  actual: string
  previous: string
  surprisePct: number
  affectedSymbols: string[]
}

interface WeeklyDay {
  day: string
  type: string
  weight: number
  events: { name: string; time: string; tier: string; country: string }[]
}

interface SymbolBias {
  symbol: string
  bias: 'bullish' | 'bearish' | 'neutral'
  score: number
  reasoning: string
  lastUpdate: string
}

/* ── constants ─────────────────────────────────────────────────────── */
const REGIME_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'risk-on': { bg: 'rgba(34,197,94,.12)', text: '#22c55e', border: 'rgba(34,197,94,.25)' },
  'risk-off': { bg: 'rgba(239,68,68,.12)', text: '#ef4444', border: 'rgba(239,68,68,.25)' },
}

const TONE_COLORS: Record<string, { bg: string; text: string }> = {
  hawkish: { bg: 'rgba(239,68,68,.12)', text: '#f87171' },
  dovish: { bg: 'rgba(34,197,94,.12)', text: '#22c55e' },
  neutral: { bg: 'rgba(148,163,184,.08)', text: '#94a3b8' },
}

const USD_STRENGTH_COLORS: Record<string, { bg: string; text: string }> = {
  strong: { bg: 'rgba(239,68,68,.12)', text: '#f87171' },
  weak: { bg: 'rgba(34,197,94,.12)', text: '#22c55e' },
  neutral: { bg: 'rgba(148,163,184,.08)', text: '#94a3b8' },
}

const TIER_COLORS: Record<string, { bg: string; text: string }> = {
  S: { bg: 'rgba(239,68,68,.15)', text: '#f87171' },
  'S+': { bg: 'rgba(239,68,68,.20)', text: '#ef4444' },
  A: { bg: 'rgba(245,158,11,.12)', text: '#f59e0b' },
  B: { bg: 'rgba(148,163,184,.08)', text: '#94a3b8' },
  C: { bg: 'rgba(148,163,184,.05)', text: '#64748b' },
}

const CHAIN_STATUS: Record<string, { bg: string; text: string }> = {
  active: { bg: 'rgba(34,197,94,.12)', text: '#22c55e' },
  stalled: { bg: 'rgba(245,158,11,.12)', text: '#f59e0b' },
}

const DAY_TYPE_COLORS: Record<string, string> = {
  manipulation: '#ef4444',
  continuation: '#22c55e',
  reversal: '#f59e0b',
  expansion: '#3b82f6',
  distribution: '#a855f7',
}

const BIAS_ICONS: Record<string, typeof TrendingUp> = {
  bullish: TrendingUp,
  bearish: TrendingDown,
  neutral: Minus,
}

const BIAS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  bullish: { bg: 'rgba(34,197,94,.10)', text: '#22c55e', border: 'rgba(34,197,94,.20)' },
  bearish: { bg: 'rgba(239,68,68,.10)', text: '#ef4444', border: 'rgba(239,68,68,.20)' },
  neutral: { bg: 'rgba(148,163,184,.06)', text: '#94a3b8', border: 'rgba(148,163,184,.12)' },
}

import { SYMBOLS as NARRATIVE_SYMBOLS } from '../../lib/config'

const CARD_STYLE: React.CSSProperties = {
  background: '#12121a',
  border: '1px solid #1e1e2e',
  borderRadius: 10,
  overflow: 'hidden',
}

const SECTION_PAD: React.CSSProperties = { padding: '12px 16px' }

/* ── helpers ───────────────────────────────────────────────────────── */
function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
  } catch { return iso }
}

function trendIcon(trend: string) {
  if (trend === 'rising') return <ArrowUpRight size={14} style={{ color: '#22c55e' }} />
  if (trend === 'falling') return <ArrowDownRight size={14} style={{ color: '#ef4444' }} />
  return <Minus size={14} style={{ color: '#94a3b8' }} />
}

function surpriseColor(pct: number): string {
  if (Math.abs(pct) < 1) return '#64748b'
  return pct > 0 ? '#22c55e' : '#ef4444'
}

function tierBadge(tier: string) {
  const t = TIER_COLORS[tier] ?? TIER_COLORS.B
  return (
    <span style={{
      display: 'inline-block', padding: '2px 6px', borderRadius: 4,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
      background: t.bg, color: t.text, lineHeight: '16px',
    }}>
      {tier}
    </span>
  )
}

function CountryFlag({ code }: { code: string }) {
  const flags: Record<string, string> = {
    US: '🇺🇸', EU: '🇪🇺', GB: '🇬🇧', JP: '🇯🇵', DE: '🇩🇪', FR: '🇫🇷',
    CA: '🇨🇦', AU: '🇦🇺', CN: '🇨🇳', CH: '🇨🇭', NZ: '🇳🇿',
  }
  return <span>{flags[code] ?? code}</span>
}

/* ══════════════════════════════════════════════════════════════════════ */
/* ── MARKET STATUS BAR ────────────────────────────────────────────── */
/* ══════════════════════════════════════════════════════════════════════ */
interface MarketStatus {
  name: string
  icon: string
  open: boolean
  nextOpen?: string
}

function getMarketStatuses(): MarketStatus[] {
  const now = new Date()
  const utcHour = now.getUTCHours()
  const utcDay = now.getUTCDay() // 0=Sun, 6=Sat
  const utcMin = now.getUTCMinutes()
  const totalMin = utcHour * 60 + utcMin

  // DST check: Mar second Sun → Nov first Sun
  const year = now.getUTCFullYear()
  const marchSun1 = 8 - new Date(Date.UTC(year, 2, 1)).getUTCDay()
  const marchSun2 = marchSun1 + 7
  const novSun1 = 8 - new Date(Date.UTC(year, 10, 1)).getUTCDay()
  const isDST = (now >= new Date(Date.UTC(year, 2, marchSun2, 7, 0)) &&
    now < new Date(Date.UTC(year, 10, novSun1, 6, 0)))

  // Forex: Opens Sun 17:00 ET (UTC-4 DST, UTC-5 standard) → Fri 17:00 ET
  // In UTC: DST 21:00 Sun, Standard 22:00 Sun
  const fxOpenUTC = isDST ? 21 : 22
  const fxCloseUTC = fxOpenUTC

  // Forex is open from Sun 17:00 ET to Fri 17:00 ET
  let forexOpen = false
  if (utcDay === 0 && totalMin >= fxOpenUTC * 60) forexOpen = true
  else if (utcDay >= 1 && utcDay <= 4) forexOpen = true
  else if (utcDay === 5 && totalMin < fxCloseUTC * 60) forexOpen = true

  // NYSE/NASDAQ: Mon-Fri 09:30-16:00 ET
  // UTC: DST 13:30-20:00, Standard 14:30-21:00
  const stockOpenUTC = isDST ? 13.5 : 14.5
  const stockCloseUTC = isDST ? 20 : 21
  let stocksOpen = false
  if (utcDay >= 1 && utcDay <= 5) {
    if (totalMin >= stockOpenUTC * 60 && totalMin < stockCloseUTC * 60) stocksOpen = true
  }

  // Gold (XAUUSD): Same as forex hours
  const goldOpen = forexOpen

  // Crypto: Always open
  const cryptoOpen = true

  function nextOpenText(open: boolean, market: string): string | undefined {
    if (open) return undefined
    if (market === 'crypto') return undefined
    // Next Monday 04:00 WIB = Sun 21:00 UTC (DST) or 22:00 UTC (std)
    if (utcDay === 6 || (utcDay === 0 && totalMin < fxOpenUTC * 60)) {
      return 'Opens tonight ~04:00 WIB'
    }
    if (utcDay === 5 && totalMin >= fxCloseUTC * 60) {
      return 'Opens Sunday ~04:00 WIB'
    }
    if (utcDay === 0 && totalMin < fxOpenUTC * 60) {
      return 'Opens today ~04:00 WIB'
    }
    return 'Opens next session'
  }

  return [
    { name: 'Forex', icon: '💱', open: forexOpen, nextOpen: nextOpenText(forexOpen, 'forex') },
    { name: 'Stocks', icon: '📊', open: stocksOpen, nextOpen: nextOpenText(stocksOpen, 'stocks') },
    { name: 'Gold', icon: '🥇', open: goldOpen, nextOpen: nextOpenText(goldOpen, 'gold') },
    { name: 'Crypto', icon: '₿', open: cryptoOpen },
  ]
}

function MarketStatusBar() {
  const markets = getMarketStatuses()
  const now = new Date()
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' })
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Jakarta' })

  return (
    <div style={{
      ...CARD_STYLE,
      background: 'linear-gradient(135deg, #12121a 0%, #1a1a2e 100%)',
    }}>
      <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Globe size={14} style={{ color: '#f59e0b' }} />
          <span style={{ fontWeight: 700, fontSize: 13, color: '#e2e8f0' }}>Market Hours</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#64748b' }}>
            <Clock size={11} />
            {timeStr} WIB · {dateStr}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {markets.map((m) => (
            <div key={m.name} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 6,
              background: m.open ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.06)',
              border: `1px solid ${m.open ? 'rgba(34,197,94,.2)' : 'rgba(239,68,68,.12)'}`,
            }}>
              <span style={{ fontSize: 12 }}>{m.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: m.open ? '#22c55e' : '#ef4444' }}>
                {m.name}
              </span>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: m.open ? '#22c55e' : '#ef4444',
                boxShadow: m.open ? '0 0 6px rgba(34,197,94,.5)' : 'none',
                animation: m.open ? 'pulse-dot 2s infinite' : 'none',
              }} />
              {m.nextOpen && (
                <span style={{ fontSize: 9, color: '#64748b', whiteSpace: 'nowrap' }}>
                  {m.nextOpen}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════ */
/* ── SECTION 1: MARKET REGIME ──────────────────────────────────────── */
/* ══════════════════════════════════════════════════════════════════════ */
function RegimeSection({ regime }: { regime: RegimeData }) {
  const rc = REGIME_COLORS[regime.regime] ?? REGIME_COLORS['risk-on']
  const tc = TONE_COLORS[regime.tone] ?? TONE_COLORS.neutral
  const uc = USD_STRENGTH_COLORS[regime.usdStrength] ?? USD_STRENGTH_COLORS.neutral

  return (
    <div style={CARD_STYLE}>
      <div style={{ ...SECTION_PAD, borderBottom: '1px solid #1e1e2e' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={14} style={{ color: '#f59e0b' }} />
          <span style={{ fontWeight: 700, fontSize: 13, color: '#e2e8f0' }}>Market Regime</span>
        </div>
      </div>
      <div style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Regime badge */}
        <div style={{
          padding: '10px 18px', borderRadius: 8,
          background: rc.bg, border: `1px solid ${rc.border}`,
        }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: rc.text, textTransform: 'uppercase' }}>
            {regime.regime === 'risk-on' ? '📈' : '📉'} {regime.regime.replace('-', ' ')}
          </div>
        </div>

        {/* USD Tone */}
        <div style={{
          padding: '6px 12px', borderRadius: 6,
          background: tc.bg, border: '1px solid transparent',
          fontSize: 12, fontWeight: 600, color: tc.text,
        }}>
          {regime.tone.charAt(0).toUpperCase() + regime.tone.slice(1)} Tone
        </div>

        {/* USD Strength */}
        <div style={{
          padding: '6px 12px', borderRadius: 6,
          background: uc.bg, border: '1px solid transparent',
          fontSize: 12, fontWeight: 600, color: uc.text,
        }}>
          USD {String(regime.usdStrength).charAt(0).toUpperCase() + String(regime.usdStrength).slice(1)}
        </div>

        {/* Confidence */}
        <div style={{
          padding: '6px 12px', borderRadius: 6,
          background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.15)',
          fontSize: 12, fontWeight: 700, color: '#f59e0b',
          fontFamily: 'var(--font-mono)',
        }}>
          {regime.confidence}% confidence
        </div>
      </div>
      {regime.details && (
        <div style={{ padding: '0 16px 16px', fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
          {regime.details}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════ */
/* ── SECTION 2: CORRELATION CHAINS ─────────────────────────────────── */
/* ══════════════════════════════════════════════════════════════════════ */
function ChainsSection({ chains }: { chains: ChainData[] }) {
  return (
    <div style={CARD_STYLE}>
      <div style={{ ...SECTION_PAD, borderBottom: '1px solid #1e1e2e' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart3 size={14} style={{ color: '#f59e0b' }} />
          <span style={{ fontWeight: 700, fontSize: 13, color: '#e2e8f0' }}>Correlation Chains</span>
        </div>
      </div>
      <div style={{
        padding: 16,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 12,
      }}>
        {chains.map((chain, i) => {
          const sc = CHAIN_STATUS[chain.status] ?? CHAIN_STATUS.active
          return (
            <div key={i} style={{
              background: '#18182a',
              border: '1px solid #1e1e2e',
              borderRadius: 8,
              overflow: 'hidden',
            }}>
              {/* Chain header */}
              <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(30,30,46,.5)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 12, color: '#e2e8f0' }}>{chain.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {trendIcon(chain.trend)}
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                      background: sc.bg, color: sc.text, textTransform: 'uppercase',
                    }}>
                      {chain.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Releases */}
              <div style={{ padding: '8px 12px' }}>
                {(chain.releases ?? []).slice(0, 5).map((rel, j) => (
                  <div key={j} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '4px 0', fontSize: 11,
                    borderBottom: j < Math.min(chain.releases.length, 5) - 1 ? '1px solid rgba(30,30,46,.3)' : 'none',
                  }}>
                    <span style={{ color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {rel.event}
                    </span>
                    <span style={{ color: '#64748b', fontFamily: 'var(--font-mono)', fontSize: 10, marginLeft: 8, whiteSpace: 'nowrap' }}>
                      {rel.consensus} → {rel.actual}
                    </span>
                    <span style={{
                      color: surpriseColor(parseFloat(rel.surprise)),
                      fontFamily: 'var(--font-mono)', fontSize: 10, marginLeft: 8,
                      fontWeight: 600, whiteSpace: 'nowrap',
                    }}>
                      {rel.surprise}
                    </span>
                  </div>
                ))}
              </div>

              {/* Prediction */}
              {chain.prediction && typeof chain.prediction === 'object' && (
                <div style={{
                  padding: '8px 12px', borderTop: '1px solid rgba(30,30,46,.5)',
                  fontSize: 11, color: '#94a3b8',
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>💡 Next: {(chain.prediction as any).nextEvent}</div>
                  <div>Expectation: {(chain.prediction as any).expectation} · Confidence: {(chain.prediction as any).confidence}%</div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════ */
/* ── SECTION 3: RECENT IMPACT TABLE ────────────────────────────────── */
/* ══════════════════════════════════════════════════════════════════════ */
function ImpactsSection({ releases }: { releases: ImpactRelease[] }) {
  const sorted = [...releases].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <div style={CARD_STYLE}>
      <div style={{ ...SECTION_PAD, borderBottom: '1px solid #1e1e2e' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={14} style={{ color: '#f59e0b' }} />
          <span style={{ fontWeight: 700, fontSize: 13, color: '#e2e8f0' }}>Recent Impact Releases</span>
          <span style={{
            fontSize: 10, color: '#64748b',
            padding: '2px 8px', borderRadius: 4,
            background: 'rgba(100,116,139,.1)',
          }}>
            {sorted.length} releases
          </span>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e1e2e' }}>
              {['Date', 'Event', 'Tier', 'Consensus', 'Actual', 'Surprise', 'Direction'].map(h => (
                <th key={h} style={{
                  textAlign: h === 'Event' ? 'left' : 'right',
                  padding: '8px 12px', fontSize: 10,
                  color: '#64748b', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((rel, idx) => (
              <tr key={idx} style={{
                borderBottom: '1px solid rgba(30,30,46,.5)',
              }}>
                <td style={{
                  padding: '7px 12px', textAlign: 'right',
                  fontSize: 11, fontFamily: 'var(--font-mono)',
                  color: '#94a3b8', whiteSpace: 'nowrap',
                }}>
                  {formatDate(rel.date)}
                </td>
                <td style={{
                  padding: '7px 12px', textAlign: 'left',
                  fontSize: 12, color: '#e2e8f0',
                  whiteSpace: 'nowrap', overflow: 'hidden',
                  maxWidth: 200, textOverflow: 'ellipsis',
                }}>
                  {rel.event}
                </td>
                <td style={{ padding: '7px 12px', textAlign: 'right' }}>
                  {tierBadge(rel.impactTier)}
                </td>
                <td style={{
                  padding: '7px 12px', textAlign: 'right',
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  color: '#94a3b8',
                }}>
                  {rel.consensus ?? '—'}
                </td>
                <td style={{
                  padding: '7px 12px', textAlign: 'right',
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  color: '#e2e8f0', fontWeight: 600,
                }}>
                  {rel.actual ?? '—'}
                </td>
                <td style={{
                  padding: '7px 12px', textAlign: 'right',
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  color: surpriseColor(rel.surprisePct),
                  fontWeight: 600,
                }}>
                  {rel.surprisePct != null ? `${Number(rel.surprisePct) > 0 ? '+' : ''}${Number(rel.surprisePct).toFixed(1)}%` : '—'}
                </td>
                <td style={{ padding: '7px 12px', textAlign: 'right' }}>
                  {rel.surprisePct != null && (
                    rel.surprisePct > 1
                      ? <ArrowUpRight size={14} style={{ color: '#22c55e' }} />
                      : rel.surprisePct < -1
                        ? <ArrowDownRight size={14} style={{ color: '#ef4444' }} />
                        : <Minus size={14} style={{ color: '#64748b' }} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════ */
/* ── SECTION 4: WEEKLY EVENT MAP ───────────────────────────────────── */
/* ══════════════════════════════════════════════════════════════════════ */
function WeeklyMapSection({ days }: { days: WeeklyDay[] }) {
  return (
    <div style={CARD_STYLE}>
      <div style={{ ...SECTION_PAD, borderBottom: '1px solid #1e1e2e' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={14} style={{ color: '#f59e0b' }} />
          <span style={{ fontWeight: 700, fontSize: 13, color: '#e2e8f0' }}>Weekly Event Map</span>
        </div>
      </div>
      <div style={{
        padding: 16,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12,
      }}>
        {days.map((day, i) => {
          const typeColor = DAY_TYPE_COLORS[day.type] ?? '#64748b'
          return (
            <div key={i} style={{
              background: '#18182a',
              border: '1px solid #1e1e2e',
              borderRadius: 8,
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '10px 12px', borderBottom: '1px solid rgba(30,30,46,.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#e2e8f0' }}>{day.day}</div>
                  {day.type && (
                    <div style={{
                      fontSize: 10, fontWeight: 600, color: typeColor,
                      marginTop: 2,
                    }}>
                      {day.type.charAt(0).toUpperCase() + day.type.slice(1)}
                    </div>
                  )}
                </div>
                {day.weight != null && (
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: '#f59e0b',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {day.weight}x
                  </div>
                )}
              </div>
              <div style={{ padding: '8px 12px', minHeight: 40 }}>
                {(!day.events || day.events.length === 0) ? (
                  <div style={{ fontSize: 11, color: '#4a4a5a', fontStyle: 'italic' }}>No events</div>
                ) : (
                  day.events.map((ev, j) => (
                    <div key={j} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '4px 0', fontSize: 11,
                      borderBottom: j < day.events.length - 1 ? '1px solid rgba(30,30,46,.3)' : 'none',
                    }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 10, color: '#64748b',
                        whiteSpace: 'nowrap', minWidth: 36,
                      }}>
                        {ev.time}
                      </span>
                      <CountryFlag code={ev.country} />
                      {tierBadge(ev.tier)}
                      <span style={{ color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.name}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════ */
/* ── SECTION 5: SYMBOL BIAS ────────────────────────────────────────── */
/* ══════════════════════════════════════════════════════════════════════ */
function BiasSection({ symbols }: { symbols: SymbolBias[] }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  return (
    <div style={CARD_STYLE}>
      <div style={{ ...SECTION_PAD, borderBottom: '1px solid #1e1e2e' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart3 size={14} style={{ color: '#f59e0b' }} />
          <span style={{ fontWeight: 700, fontSize: 13, color: '#e2e8f0' }}>Symbol Fundamental Bias</span>
        </div>
      </div>
      <div style={{
        padding: 16,
        display: 'flex',
        gap: 12,
        overflowX: 'auto',
      }}>
        {symbols.map((s, i) => {
          const BiasIcon = BIAS_ICONS[s.bias] ?? Minus
          const bc = BIAS_COLORS[s.bias] ?? BIAS_COLORS.neutral
          const isExpanded = expandedIdx === i
          const scoreWidth = Math.max(0, Math.min(100, (s.score / 10) * 100))

          return (
            <div
              key={s.symbol}
              style={{
                minWidth: 180, maxWidth: 220, flex: '1 1 180px',
                background: '#18182a', border: '1px solid #1e1e2e',
                borderRadius: 8, cursor: 'pointer',
                transition: 'border-color 0.2s',
              }}
              onClick={() => setExpandedIdx(isExpanded ? null : i)}
            >
              <div style={{ padding: '10px 12px' }}>
                {/* Symbol + Bias */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>
                    {s.symbol}
                  </span>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '3px 8px', borderRadius: 4,
                    background: bc.bg, border: `1px solid ${bc.border}`,
                  }}>
                    <BiasIcon size={12} style={{ color: bc.text }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: bc.text, textTransform: 'uppercase' }}>
                      {s.bias}
                    </span>
                  </div>
                </div>

                {/* Score bar */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: '#64748b' }}>Score</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: bc.text, fontFamily: 'var(--font-mono)' }}>
                      {s.score}/10
                    </span>
                  </div>
                  <div style={{
                    height: 4, borderRadius: 2,
                    background: 'rgba(30,30,46,.8)',
                  }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      width: `${scoreWidth}%`,
                      background: bc.text,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                </div>

                {/* Reasoning */}
                <div style={{
                  fontSize: 11, color: '#94a3b8', lineHeight: 1.5,
                  maxHeight: isExpanded ? 200 : 32,
                  overflow: 'hidden',
                  transition: 'max-height 0.3s',
                }}>
                  {s.reasoning}
                </div>

                {/* Timestamp */}
                <div style={{ fontSize: 9, color: '#4a4a5a', marginTop: 6 }}>
                  {s.lastUpdate ? new Date(s.lastUpdate).toLocaleString() : ''}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════ */
/* ── SECTION 6: AI NARRATIVE ───────────────────────────────────────── */
/* ══════════════════════════════════════════════════════════════════════ */
function NarrativeSection({
  symbol,
  setSymbol,
  narrative,
  isNarrativeLoading,
  refetchNarrative,
}: {
  symbol: string
  setSymbol: (s: string) => void
  narrative: { narrative: string; generated: string } | undefined
  isNarrativeLoading: boolean
  refetchNarrative: () => void
}) {
  return (
    <div style={CARD_STYLE}>
      <div style={{ ...SECTION_PAD, borderBottom: '1px solid #1e1e2e' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={14} style={{ color: '#f59e0b' }} />
            <span style={{ fontWeight: 700, fontSize: 13, color: '#e2e8f0' }}>AI Fundamental Narrative</span>
          </div>
          <button
            onClick={() => refetchNarrative()}
            style={{
              background: 'none', border: '1px solid #1e1e2e',
              borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
              color: '#64748b', fontSize: 11,
            }}
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </div>
      <div style={{ padding: 16 }}>
        {/* Symbol selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {NARRATIVE_SYMBOLS.map(s => (
            <button
              key={s}
              onClick={() => setSymbol(s)}
              style={{
                padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${s === symbol ? '#f59e0b' : '#1e1e2e'}`,
                background: s === symbol ? 'rgba(245,158,11,.1)' : '#18182a',
                color: s === symbol ? '#f59e0b' : '#94a3b8',
                fontSize: 11, fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                transition: 'all 0.2s',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Narrative content */}
        {isNarrativeLoading ? (
          <div style={{
            padding: 40, textAlign: 'center',
            color: '#64748b', fontSize: 13,
          }}>
            Generating narrative...
          </div>
        ) : narrative?.narrative ? (
          <div style={{
            background: '#18182a',
            border: '1px solid #1e1e2e',
            borderRadius: 8,
            padding: 16,
            fontSize: 12,
            color: '#94a3b8',
            fontFamily: 'var(--font-mono)',
            lineHeight: 1.8,
            whiteSpace: 'pre-wrap',
          }}>
            {narrative.narrative}
          </div>
        ) : (
          <div style={{
            padding: 32, textAlign: 'center',
            color: '#4a4a5a', fontSize: 12,
          }}>
            No narrative available
          </div>
        )}

        {narrative?.generated && (
          <div style={{ fontSize: 10, color: '#4a4a5a', marginTop: 8, textAlign: 'right' }}>
            Generated: {new Date(narrative.generated).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════ */
/* ── MAIN COMPONENT ────────────────────────────────────────────────── */
/* ══════════════════════════════════════════════════════════════════════ */
export default function Fundamental() {
  const [narrativeSymbol, setNarrativeSymbol] = useState('XAUUSD')

  const { data: regime, isLoading: regimeLoading } = useQuery<RegimeData>({
    queryKey: ['fundamental-regime'],
    queryFn: () => api('/api/fundamental/regime'),
    refetchInterval: 60_000,
    retry: 1,
  })

  const { data: chainsData, isLoading: chainsLoading } = useQuery<{ chains: ChainData[] }>({
    queryKey: ['fundamental-chains'],
    queryFn: () => api('/api/fundamental/chains'),
    refetchInterval: 60_000,
    retry: 1,
  })

  const { data: impactsData, isLoading: impactsLoading } = useQuery<{ releases: ImpactRelease[] }>({
    queryKey: ['fundamental-impacts'],
    queryFn: () => api('/api/fundamental/impacts?limit=20'),
    refetchInterval: 60_000,
    retry: 1,
  })

  const { data: weeklyMapData, isLoading: weeklyLoading } = useQuery<{ days: WeeklyDay[] }>({
    queryKey: ['fundamental-weekly-map'],
    queryFn: () => api('/api/fundamental/weekly-map'),
    refetchInterval: 300_000,
    retry: 1,
  })

  const { data: biasData, isLoading: biasLoading } = useQuery<{ symbols: SymbolBias[] }>({
    queryKey: ['fundamental-bias'],
    queryFn: () => api('/api/fundamental/bias'),
    refetchInterval: 60_000,
    retry: 1,
  })

  const { data: narrative, isLoading: narrativeLoading, refetch: refetchNarrative } = useQuery<{ narrative: string; generated: string }>({
    queryKey: ['fundamental-narrative', narrativeSymbol],
    queryFn: () => api(`/api/fundamental/narrative?symbol=${narrativeSymbol}`),
    refetchInterval: 120_000,
    retry: 1,
  })

  const isLoading = regimeLoading && chainsLoading && impactsLoading && weeklyLoading && biasLoading

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ═══ HEADER ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
            Fundamental Analysis
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>
            <BarChart3 size={20} style={{ color: '#f59e0b', marginRight: 6, verticalAlign: 'middle' }} />
            Fundamental Dashboard
          </h1>
          <p style={{ margin: 0, fontSize: 12, color: '#64748b', marginTop: 2 }}>
            Market regime, correlation chains, economic impacts, and AI narratives
          </p>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'pulse-dot 2s infinite' }} />
          Live · 60s refresh
        </span>
      </div>

      {/* ═══ MARKET STATUS ═══ */}
      <MarketStatusBar />

      {/* ═══ LOADING ═══ */}
      {isLoading && (
        <div style={{
          background: '#12121a', border: '1px solid #1e1e2e',
          borderRadius: 10, padding: 40, textAlign: 'center',
          color: '#64748b', fontSize: 13,
        }}>
          Loading fundamental data...
        </div>
      )}

      {/* ═══ SECTION 1: Regime ═══ */}
      {regime && <RegimeSection regime={regime} />}

      {/* ═══ SECTION 2: Chains ═══ */}
      {chainsData?.chains && chainsData.chains.length > 0 && (
        <ChainsSection chains={chainsData.chains} />
      )}

      {/* ═══ SECTION 3: Impacts ═══ */}
      {impactsData?.releases && impactsData.releases.length > 0 && (
        <ImpactsSection releases={impactsData.releases} />
      )}

      {/* ═══ SECTION 4: Weekly Map ═══ */}
      {weeklyMapData?.days && weeklyMapData.days.length > 0 && (
        <WeeklyMapSection days={weeklyMapData.days} />
      )}

      {/* ═══ SECTION 5: Bias ═══ */}
      {biasData?.symbols && biasData.symbols.length > 0 && (
        <BiasSection symbols={biasData.symbols} />
      )}

      {/* ═══ SECTION 6: Narrative ═══ */}
      <NarrativeSection
        symbol={narrativeSymbol}
        setSymbol={setNarrativeSymbol}
        narrative={narrative}
        isNarrativeLoading={narrativeLoading}
        refetchNarrative={refetchNarrative}
      />
    </div>
  )
}
