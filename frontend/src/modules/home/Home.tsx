import { useQuery } from '@tanstack/react-query'
import { useState, useEffect, useRef } from 'react'
import {
  Activity, TrendingUp, TrendingDown, Minus,
  Clock, Wifi, WifiOff, Zap, Target, BarChart3, Shield,
} from 'lucide-react'
import { api } from '../../lib/api'

/* ── Kill Zone Helpers ── */

function isKillZoneActive(): boolean {
  const now = new Date()
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes()
  return (mins >= 420 && mins <= 600) || (mins >= 720 && mins <= 900) || (mins >= 900 && mins <= 1020)
}

function activeKillZoneLabel(): string {
  const utcH = new Date().getUTCHours()
  if (utcH >= 0 && utcH < 3) return 'Tokyo Open'
  if (utcH >= 7 && utcH < 10) return 'London Open'
  if (utcH >= 12 && utcH < 15) return 'NY Open'
  if (utcH >= 15 && utcH < 17) return 'London Close'
  return 'No Active Kill Zone'
}

function nextKillZoneCountdown(): string {
  const now = new Date()
  const utcH = now.getUTCHours()
  const utcM = now.getUTCMinutes()
  const mins = utcH * 60 + utcM
  const zones = [
    { start: 0, label: 'Tokyo' },
    { start: 420, label: 'London Open' },
    { start: 720, label: 'NY Open' },
    { start: 900, label: 'London Close' },
  ]
  for (const z of zones) {
    if (mins < z.start) {
      const diff = z.start - mins
      return `${Math.floor(diff / 60)}h ${diff % 60}m → ${z.label}`
    }
  }
  return 'Next: Tokyo 00:00 UTC'
}

/* ── Market Status Helpers ── */

function isForexOpen(): boolean {
  const now = new Date()
  const utcH = now.getUTCHours()
  const utcDay = now.getUTCDay() // 0=Sun, 6=Sat
  const month = now.getUTCMonth()
  const isDST = month >= 2 && month <= 10

  if (utcDay === 6) return false
  if (utcDay === 0) return utcH >= (isDST ? 21 : 22)
  if (utcDay === 5) return utcH < (isDST ? 21 : 22)
  return true
}

function isGoldOpen(): boolean { return isForexOpen() }
function isCryptoOpen(): boolean { return true }

function nextForexOpen(): string {
  const now = new Date()
  const utcDay = now.getUTCDay()
  const utcH = now.getUTCHours()
  const utcM = now.getUTCMinutes()
  const month = now.getUTCMonth()
  const isDST = month >= 2 && month <= 10
  const openUTC = isDST ? 21 : 22

  if (isForexOpen()) {
    if (utcDay === 5) {
      const minsLeft = (22 - utcH) * 60 - utcM
      return minsLeft > 0 ? `Closes in ${Math.floor(minsLeft/60)}h ${minsLeft%60}m` : 'Closing now'
    }
    return 'Open until Fri'
  }

  let daysUntilSunday = (7 - utcDay) % 7
  if (daysUntilSunday === 0 && utcH >= openUTC) daysUntilSunday = 7
  const minsUntil = daysUntilSunday * 24 * 60 + (openUTC - utcH) * 60 - utcM
  if (minsUntil <= 0) return 'Opens now'
  const d = Math.floor(minsUntil / 1440)
  const h = Math.floor((minsUntil % 1440) / 60)
  const m = minsUntil % 60
  const wibH = (openUTC + 7) % 24
  if (d > 0) return `Opens in ${d}d ${h}m (${wibH}:00 WIB)`
  return `Opens in ${h}h ${m}m (${wibH}:00 WIB)`
}

/* ── Formatting ── */

function biasColor(bias: string): string {
  if (bias === 'bullish' || bias === 'BULLISH') return 'var(--kt-up)'
  if (bias === 'bearish' || bias === 'BEARISH') return 'var(--kt-dn)'
  return 'var(--kt-muted)'
}

function biasIcon(bias: string) {
  if (bias === 'bullish' || bias === 'BULLISH') return <TrendingUp size={14} style={{ color: 'var(--kt-up)' }} />
  if (bias === 'bearish' || bias === 'BEARISH') return <TrendingDown size={14} style={{ color: 'var(--kt-dn)' }} />
  return <Minus size={14} style={{ color: 'var(--kt-muted)' }} />
}



/* ═══════════════════════════════════════════════════════════════════
   DASHBOARD COMPONENT
   ═══════════════════════════════════════════════════════════════════ */

export default function Home() {
  const [killActive, setKillActive] = useState(isKillZoneActive())
  const prevBidRef = useRef<number | null>(null)
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    const id = setInterval(() => setKillActive(isKillZoneActive()), 30_000)
    return () => clearInterval(id)
  }, [])

  /* ── Queries ── */
  const { data: price } = useQuery<any>({
    queryKey: ['mt5-price', 'XAUUSD.vxc'],
    queryFn: () => api('/api/mt5/price?symbol=XAUUSD.vxc'),
    refetchInterval: 5_000,
    retry: 2,
  })

  const { data: trades = [] } = useQuery<any[]>({
    queryKey: ['trades'],
    queryFn: () => api('/api/trades'),
    refetchInterval: 15_000,
    retry: false,
  })

  const { data: unifiedSignal } = useQuery<any>({
    queryKey: ['unified-signal', 'XAUUSD'],
    queryFn: () => api('/api/unified-signal/XAUUSD'),
    staleTime: 120_000,
    refetchInterval: 120_000,
    retry: false,
  })

  const { data: dailyCtx } = useQuery<any>({
    queryKey: ['daily-context', 'XAUUSD'],
    queryFn: () => api('/api/context/daily/XAUUSD'),
    staleTime: 300_000,
    retry: false,
  })

  /* ── Price Flash Effect ── */
  useEffect(() => {
    if (!price?.bid) return
    const prev = prevBidRef.current
    if (prev !== null) {
      if (price.bid > prev) setPriceFlash('up')
      else if (price.bid < prev) setPriceFlash('down')
      const t = setTimeout(() => setPriceFlash(null), 400)
      prevBidRef.current = price.bid
      return () => clearTimeout(t)
    }
    prevBidRef.current = price.bid
  }, [price?.bid])

  /* ── Derived Data ── */
  const activeTrades = trades.filter((t: any) => t.status === 'active')
  const closedTrades = trades.filter((t: any) => t.status === 'closed')
  const totalPnl = closedTrades.reduce((s: number, t: any) => s + (t.current_pnl ?? 0), 0)
  const conn = price ? true : false

  const direction = unifiedSignal?.direction ?? 'neutral'
  const confidence = unifiedSignal?.confidence ?? 0
  const threshold = unifiedSignal?.threshold ?? 65
  const generated = unifiedSignal?.generated ?? false
  const reasons = unifiedSignal?.reasons ?? []

  const weekHigh = dailyCtx?.weeklyProfile?.weekHigh
  const weekLow = dailyCtx?.weeklyProfile?.weekLow
  const currentBid = price?.bid

  // Distance from high/low as percentage
  let distFromHigh: string = '—'
  let distFromLow: string = '—'
  if (weekHigh && weekLow && currentBid && weekHigh > weekLow) {
    const range = weekHigh - weekLow
    distFromHigh = (((weekHigh - currentBid) / range) * 100).toFixed(1)
    distFromLow = (((currentBid - weekLow) / range) * 100).toFixed(1)
  }

  // Premium/Discount zone
  const premiumZone = weekHigh && weekLow && currentBid
    ? currentBid > (weekHigh + weekLow) / 2
    : null

  // Events
  const todayEvents = dailyCtx?.todayEvents ?? []

  // Day weight mapping
  const dayWeights: Record<string, string> = {
    manipulation: '2.0x', continuation: '1.5x', reversal: '1.5x',
    expansion: '1.5x', distribution: '1.0x',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ═══════════════════════════════════════════════════
          ROW 1: Live Price + Session + Quick P&L
          ═══════════════════════════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>

        {/* ── Card 1: Live Price ── */}
        <div className="kt-card kt-card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>Live Price</span>
            {conn ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', fontSize: 9, color: 'var(--kt-up)' }}>
                <Wifi size={10} /> Live
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', fontSize: 9, color: 'var(--kt-dn)' }}>
                <WifiOff size={10} /> Offline
              </span>
            )}
          </div>
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: priceFlash === 'up' ? 'rgba(34,197,94,.12)'
              : priceFlash === 'down' ? 'rgba(239,68,68,.12)'
              : 'rgba(245,158,11,.06)',
            border: `1px solid ${priceFlash === 'up' ? 'rgba(34,197,94,.25)' : priceFlash === 'down' ? 'rgba(239,68,68,.25)' : 'rgba(245,158,11,.15)'}`,
            transition: 'background .3s, border-color .3s',
          }}>
            <div style={{
              fontSize: 'var(--md)', fontWeight: 800, fontFamily: 'var(--font-mono)',
              color: priceFlash === 'up' ? 'var(--kt-up)' : priceFlash === 'down' ? 'var(--kt-dn)' : 'var(--kt-text)',
              transition: 'color .3s',
            }}>
              {currentBid?.toFixed(2) ?? '—'}
            </div>
            {price && (
              <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
                <span>Ask: {price.ask?.toFixed(2)}</span>
                <span>Spread: {price.spread} pts</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Card 2: Session Status ── */}
        <div className="kt-card kt-card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} style={{ color: killActive ? 'var(--kt-gold)' : 'var(--kt-muted)' }} />
            <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>Session</span>
          </div>
          {/* ── Market Status ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0' }}>
            {[
              { label: 'Forex', open: isForexOpen() },
              { label: 'Gold', open: isGoldOpen() },
              { label: 'Crypto', open: isCryptoOpen() },
            ].map((m) => (
              <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.open ? 'var(--kt-up)' : 'var(--kt-dn)', display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: 'var(--xs)', fontWeight: 600, color: 'var(--kt-text)', width: 40 }}>{m.label}</span>
                <span style={{
                  fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  color: m.open ? 'var(--kt-up)' : 'var(--kt-dn)',
                  padding: '1px 6px', borderRadius: 3,
                  background: m.open ? 'rgba(34,197,94,.10)' : 'rgba(239,68,68,.10)',
                  border: `1px solid ${m.open ? 'rgba(34,197,94,.20)' : 'rgba(239,68,68,.20)'}`,
                }}>
                  {m.open ? 'OPEN' : 'CLOSED'}
                </span>
              </div>
            ))}
          </div>
          {!isForexOpen() && (
            <span style={{ fontSize: 9, color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>
              {nextForexOpen()}
            </span>
          )}
          <div style={{ height: 1, background: 'var(--kt-border)', margin: '4px 0' }} />
          <div style={{
            padding: '6px 10px', borderRadius: 6,
            background: killActive ? 'rgba(245,158,11,.10)' : 'rgba(148,163,184,.06)',
            border: `1px solid ${killActive ? 'rgba(245,158,11,.25)' : 'rgba(148,163,184,.10)'}`,
          }}>
            <span style={{ fontSize: 'var(--sm)', fontWeight: 700, color: killActive ? 'var(--kt-gold)' : 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>
              {activeKillZoneLabel()}
            </span>
          </div>
          <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
            {nextKillZoneCountdown()}
          </span>
          {dailyCtx?.dayType && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 'var(--xs)', fontWeight: 700,
                fontFamily: 'var(--font-mono)', textTransform: 'capitalize',
                background: 'rgba(245,158,11,.10)', color: 'var(--kt-gold)',
              }}>
                {dailyCtx.dayType}
              </span>
              <span style={{ fontSize: 9, color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>
                Weight: {dayWeights[dailyCtx.dayType] ?? '1.0x'}
              </span>
            </div>
          )}
        </div>

        {/* ── Card 3: Quick P&L ── */}
        <div className="kt-card kt-card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart3 size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>Quick P&L</span>
          </div>
          {activeTrades.length === 0 && closedTrades.length === 0 ? (
            <div style={{ padding: '8px 0', textAlign: 'center' }}>
              <span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)' }}>No active trades</span>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
              <div>
                <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>Active</span>
                <span style={{ display: 'block', fontSize: 'var(--md)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{activeTrades.length}</span>
              </div>
              <div>
                <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>Closed P&L</span>
                <span style={{ display: 'block', fontSize: 'var(--md)', fontWeight: 700, fontFamily: 'var(--font-mono)', color: totalPnl >= 0 ? 'var(--kt-up)' : 'var(--kt-dn)' }}>
                  {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          ROW 2: Signal Banner (full width)
          ═══════════════════════════════════════════════════ */}
      {unifiedSignal && (
        <div className="kt-card kt-card-pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Zap size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>Signal</span>
            <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>XAUUSD</span>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            padding: '10px 14px', borderRadius: 8,
            background: 'rgba(245,158,11,.06)',
            border: '1px solid rgba(245,158,11,.15)',
          }}>
            {/* Direction */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {biasIcon(direction)}
              <span style={{
                fontSize: 'var(--sm)', fontWeight: 700, textTransform: 'uppercase',
                fontFamily: 'var(--font-mono)', color: biasColor(direction),
              }}>
                {direction}
              </span>
            </div>

            {/* Confidence */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                fontSize: 'var(--sm)', fontWeight: 700, fontFamily: 'var(--font-mono)',
                color: confidence >= 70 ? 'var(--kt-up)' : confidence >= 40 ? '#f59e0b' : 'var(--kt-dn)',
              }}>
                {confidence}%
              </span>
              <span style={{ fontSize: 9, color: 'var(--kt-muted)' }}>confidence</span>
            </div>

            {/* Threshold marker */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 9, color: 'var(--kt-muted)' }}>threshold</span>
              <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--kt-muted)' }}>
                {threshold}
              </span>
            </div>

            {/* Generated badge */}
            <span style={{
              padding: '2px 8px', borderRadius: 4,
              fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
              background: generated ? 'rgba(34,197,94,.15)' : 'rgba(148,163,184,.08)',
              color: generated ? 'var(--kt-up)' : 'var(--kt-muted)',
              marginLeft: 'auto',
            }}>
              {generated ? '✅ GENERATED' : '⏳ NOT GENERATED'}
            </span>
          </div>

          {/* Reasons (if not generated) */}
          {!generated && reasons.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {reasons.map((r: string, i: number) => (
                <span key={i} style={{
                  padding: '3px 8px', borderRadius: 4,
                  fontSize: 9, color: 'var(--kt-muted)',
                  background: 'rgba(148,163,184,.08)',
                  border: '1px solid rgba(148,163,184,.12)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          ROW 3: Multi-Layer Analysis (6 Layer Cards)
          ═══════════════════════════════════════════════════ */}
      {unifiedSignal && (
        <div className="kt-card kt-card-pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Shield size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>Multi-Layer Analysis</span>
            <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>XAUUSD</span>
          </div>

          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'thin' }}>
            {/* Weekly Profile */}
            <div style={{ padding: 10, borderRadius: 6, background: 'rgba(255,255,255,.02)', border: '1px solid var(--kt-border)', flexShrink: 0, minWidth: 140 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--kt-muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Weekly Profile</span>
                <span style={{ fontSize: 10 }}>✅</span>
              </div>
              <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'var(--kt-bg)', overflow: 'hidden', marginBottom: 6 }}>
                <div style={{
                  width: `${Math.min((unifiedSignal.breakdown?.weeklyProfile?.score ?? 0), 100)}%`,
                  height: '100%', borderRadius: 2,
                  background: (unifiedSignal.breakdown?.weeklyProfile?.score ?? 0) > 70 ? 'var(--kt-up)' : (unifiedSignal.breakdown?.weeklyProfile?.score ?? 0) >= 40 ? '#f59e0b' : 'var(--kt-dn)',
                  transition: 'width .4s',
                }} />
              </div>
              <div style={{ fontSize: 'var(--sm)', fontWeight: 700, color: 'var(--kt-text)', textTransform: 'capitalize' }}>
                {unifiedSignal.breakdown?.weeklyProfile?.bias ?? '—'}
              </div>
              <div style={{ fontSize: 9, color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                {unifiedSignal.breakdown?.weeklyProfile?.model?.replace('_', ' ') ?? '—'}
              </div>
              <div style={{ fontSize: 9, color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>
                score: {unifiedSignal.breakdown?.weeklyProfile?.score ?? '—'}
              </div>
            </div>

            {/* H4 Signal */}
            <div style={{ padding: 10, borderRadius: 6, background: 'rgba(255,255,255,.02)', border: '1px solid var(--kt-border)', flexShrink: 0, minWidth: 140 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--kt-muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>H4 Signal</span>
                <span style={{ fontSize: 10 }}>✅</span>
              </div>
              <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'var(--kt-bg)', overflow: 'hidden', marginBottom: 6 }}>
                <div style={{
                  width: `${Math.min((unifiedSignal.breakdown?.h4Signal?.score ?? 0), 100)}%`,
                  height: '100%', borderRadius: 2,
                  background: (unifiedSignal.breakdown?.h4Signal?.score ?? 0) > 70 ? 'var(--kt-up)' : (unifiedSignal.breakdown?.h4Signal?.score ?? 0) >= 40 ? '#f59e0b' : 'var(--kt-dn)',
                  transition: 'width .4s',
                }} />
              </div>
              <div style={{ fontSize: 'var(--sm)', fontWeight: 700, color: 'var(--kt-text)', textTransform: 'capitalize' }}>
                {unifiedSignal.breakdown?.h4Signal?.bias ?? '—'}
              </div>
              <div style={{ fontSize: 9, color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                Model {unifiedSignal.breakdown?.h4Signal?.modelNumber ?? '—'}
              </div>
              <div style={{ fontSize: 9, color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>
                {unifiedSignal.breakdown?.h4Signal?.killzone ?? '—'}
              </div>
            </div>

            {/* H1 Confirm */}
            <div style={{ padding: 10, borderRadius: 6, background: 'rgba(255,255,255,.02)', border: '1px solid var(--kt-border)', flexShrink: 0, minWidth: 140 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--kt-muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>H1 Confirm</span>
                <span style={{ fontSize: 10 }}>✅</span>
              </div>
              <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'var(--kt-bg)', overflow: 'hidden', marginBottom: 6 }}>
                <div style={{
                  width: `${Math.min((unifiedSignal.breakdown?.h1Confirm?.score ?? 0), 100)}%`,
                  height: '100%', borderRadius: 2,
                  background: (unifiedSignal.breakdown?.h1Confirm?.score ?? 0) > 70 ? 'var(--kt-up)' : (unifiedSignal.breakdown?.h1Confirm?.score ?? 0) >= 40 ? '#f59e0b' : 'var(--kt-dn)',
                  transition: 'width .4s',
                }} />
              </div>
              <div style={{ fontSize: 'var(--sm)', fontWeight: 700, color: 'var(--kt-text)' }}>
                {unifiedSignal.breakdown?.h1Confirm?.confirmed ? 'Confirmed ✅' : 'Not Confirmed'}
              </div>
              <div style={{ fontSize: 9, color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                {unifiedSignal.breakdown?.h1Confirm?.type ?? '—'} · {unifiedSignal.breakdown?.h1Confirm?.ohStatus ?? '—'}
              </div>
              <div style={{ fontSize: 9, color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>
                OL: {unifiedSignal.breakdown?.h1Confirm?.olStatus ?? '—'}
              </div>
            </div>

            {/* M15 Entry */}
            <div style={{ padding: 10, borderRadius: 6, background: 'rgba(255,255,255,.02)', border: '1px solid var(--kt-border)', flexShrink: 0, minWidth: 140 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--kt-muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>M15 Entry</span>
                <span style={{ fontSize: 10 }}>✅</span>
              </div>
              <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'var(--kt-bg)', overflow: 'hidden', marginBottom: 6 }}>
                <div style={{
                  width: `${Math.min((unifiedSignal.breakdown?.m15Entry?.score ?? 0), 100)}%`,
                  height: '100%', borderRadius: 2,
                  background: (unifiedSignal.breakdown?.m15Entry?.score ?? 0) > 70 ? 'var(--kt-up)' : (unifiedSignal.breakdown?.m15Entry?.score ?? 0) >= 40 ? '#f59e0b' : 'var(--kt-dn)',
                  transition: 'width .4s',
                }} />
              </div>
              <div style={{ fontSize: 'var(--sm)', fontWeight: 700, color: 'var(--kt-text)' }}>
                {unifiedSignal.breakdown?.m15Entry?.po3Phase ?? '—'}
              </div>
              <div style={{ fontSize: 9, color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                MSS: {unifiedSignal.breakdown?.m15Entry?.mss ? 'Yes' : 'No'}
              </div>
              <div style={{ fontSize: 9, color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>
                FVG: {unifiedSignal.breakdown?.m15Entry?.fvgStage ?? '—'}
              </div>
            </div>

            {/* Fundamental */}
            <div style={{ padding: 10, borderRadius: 6, background: 'rgba(255,255,255,.02)', border: '1px solid var(--kt-border)', flexShrink: 0, minWidth: 140 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--kt-muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Fundamental</span>
                <span style={{ fontSize: 10 }}>✅</span>
              </div>
              <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'var(--kt-bg)', overflow: 'hidden', marginBottom: 6 }}>
                <div style={{
                  width: `${Math.min((unifiedSignal.breakdown?.fundamental?.score ?? 0) * 5, 100)}%`,
                  height: '100%', borderRadius: 2,
                  background: (unifiedSignal.breakdown?.fundamental?.score ?? 0) > 14 ? 'var(--kt-up)' : (unifiedSignal.breakdown?.fundamental?.score ?? 0) >= 8 ? '#f59e0b' : 'var(--kt-dn)',
                  transition: 'width .4s',
                }} />
              </div>
              <div style={{ fontSize: 'var(--sm)', fontWeight: 700, color: 'var(--kt-text)', textTransform: 'capitalize' }}>
                {unifiedSignal.breakdown?.fundamental?.bias ?? '—'}
              </div>
              <div style={{ fontSize: 9, color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                {unifiedSignal.breakdown?.fundamental?.weekType ?? '—'}
              </div>
              <div style={{ fontSize: 9, color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>
                score: {unifiedSignal.breakdown?.fundamental?.score ?? '—'}
              </div>
            </div>

            {/* SMT */}
            <div style={{ padding: 10, borderRadius: 6, background: 'rgba(255,255,255,.02)', border: '1px solid var(--kt-border)', flexShrink: 0, minWidth: 140 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--kt-muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>SMT</span>
                <span style={{ fontSize: 10 }}>—</span>
              </div>
              <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'var(--kt-bg)', overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ width: '0%', height: '100%', borderRadius: 2, background: 'var(--kt-dn)', transition: 'width .4s' }} />
              </div>
              <div style={{ fontSize: 'var(--sm)', fontWeight: 700, color: 'var(--kt-muted)' }}>
                No Data
              </div>
              <div style={{ fontSize: 9, color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>—</div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          ROW 4: Key Levels + Events
          ═══════════════════════════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>

        {/* ── Key Levels ── */}
        <div className="kt-card kt-card-pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Target size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>Key Levels</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Week High */}
            <div style={{
              padding: '8px 12px', borderRadius: 6,
              border: '1px solid var(--kt-border)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', textTransform: 'uppercase' }}>Week High</span>
                <span style={{ fontSize: 'var(--sm)', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--kt-up)' }}>
                  {weekHigh?.toFixed(2) ?? '—'}
                </span>
              </div>
              {weekHigh && currentBid && (
                <div style={{ fontSize: 9, color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  Distance: {distFromHigh}% from range top
                </div>
              )}
            </div>

            {/* Week Low */}
            <div style={{
              padding: '8px 12px', borderRadius: 6,
              border: '1px solid var(--kt-border)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', textTransform: 'uppercase' }}>Week Low</span>
                <span style={{ fontSize: 'var(--sm)', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--kt-dn)' }}>
                  {weekLow?.toFixed(2) ?? '—'}
                </span>
              </div>
              {weekLow && currentBid && (
                <div style={{ fontSize: 9, color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  Distance: {distFromLow}% from range bottom
                </div>
              )}
            </div>

            {/* Current Price */}
            <div style={{
              padding: '8px 12px', borderRadius: 6,
              background: 'rgba(245,158,11,.06)',
              border: '1px solid rgba(245,158,11,.15)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', textTransform: 'uppercase' }}>Current Price</span>
                <span style={{ fontSize: 'var(--sm)', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--kt-text)' }}>
                  {currentBid?.toFixed(2) ?? '—'}
                </span>
              </div>
            </div>

            {/* Premium/Discount Zone */}
            {premiumZone !== null && (
              <div style={{
                padding: '6px 12px', borderRadius: 6,
                background: premiumZone ? 'rgba(239,68,68,.08)' : 'rgba(34,197,94,.08)',
                border: `1px solid ${premiumZone ? 'rgba(239,68,68,.20)' : 'rgba(34,197,94,.20)'}`,
                textAlign: 'center',
              }}>
                <span style={{
                  fontSize: 'var(--xs)', fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: premiumZone ? 'var(--kt-dn)' : 'var(--kt-up)',
                  textTransform: 'uppercase',
                }}>
                  {premiumZone ? 'Premium Zone — SELL territory' : 'Discount Zone — BUY territory'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Events Today ── */}
        <div className="kt-card kt-card-pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Clock size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>Events</span>
            <span style={{
              marginLeft: 'auto', padding: '2px 8px', borderRadius: 4,
              fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
              background: 'rgba(245,158,11,.12)', color: 'var(--kt-gold)',
            }}>
              {todayEvents.length}
            </span>
          </div>
          {todayEvents.length === 0 ? (
            <div style={{ padding: '12px 0', textAlign: 'center' }}>
              <span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)' }}>No events today</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {todayEvents.slice(0, 8).map((ev: any, i: number) => {
                const tierLabel = ev.tier === 'S' ? 'S+ CRITICAL' : ev.tier === 'A' ? 'A MEDIUM' : 'B LOW'
                const tierColor = ev.tier === 'S' ? '#ef4444' : ev.tier === 'A' ? '#f59e0b' : '#94a3b8'
                const tierBg = ev.tier === 'S' ? 'rgba(239,68,68,.12)' : ev.tier === 'A' ? 'rgba(245,158,11,.10)' : 'rgba(148,163,184,.06)'
                return (
                  <div key={i} style={{
                    padding: '6px 10px', borderRadius: 6,
                    border: '1px solid var(--kt-border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{
                        padding: '1px 6px', borderRadius: 3,
                        fontSize: 8, fontWeight: 700, fontFamily: 'var(--font-mono)',
                        background: tierBg, color: tierColor,
                      }}>
                        {tierLabel}
                      </span>
                      <span style={{ fontSize: 'var(--xs)', fontWeight: 600, color: 'var(--kt-text)', flex: 1 }}>
                        {ev.name}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, fontSize: 9, color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>
                      <span>{ev.time ?? '—'}</span>
                      <span>{ev.country ?? '—'}</span>
                      {ev.chain && <span>🔗 {ev.chain}</span>}
                    </div>
                    {ev.isToday && (
                      <div style={{ marginTop: 2, fontSize: 8, color: 'var(--kt-gold)', fontWeight: 700 }}>TODAY</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
