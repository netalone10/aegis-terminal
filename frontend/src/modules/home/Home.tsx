import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import {
  Activity, TrendingUp, TrendingDown, Minus, AlertTriangle,
  Clock, Wifi, WifiOff, Zap, Calendar, Target, BarChart3, Shield,
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

const DAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

/* ═══════════════════════════════════════════════════════════════════
   DASHBOARD COMPONENT
   ═══════════════════════════════════════════════════════════════════ */

export default function Home() {
  const [killActive, setKillActive] = useState(isKillZoneActive())

  useEffect(() => {
    const id = setInterval(() => setKillActive(isKillZoneActive()), 30_000)
    return () => clearInterval(id)
  }, [])

  /* ── Queries ── */
  const { data: smcData } = useQuery<any>({
    queryKey: ['smc-batch'],
    queryFn: () => api('/api/smc/batch'),
    staleTime: 300_000,
    refetchInterval: 120_000,
    retry: false,
  })

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

  const { data: calendarEvents = [] } = useQuery<any[]>({
    queryKey: ['calendar'],
    queryFn: () => api('/api/calendar'),
    staleTime: 300_000,
    retry: false,
  })

  const { data: macro } = useQuery<any>({
    queryKey: ['macro'],
    queryFn: () => api('/api/macro'),
    staleTime: 300_000,
    retry: false,
  })

  /* ── Derived Data ── */
  const pairs = Array.isArray(smcData) ? smcData : (smcData?.data ?? [])
  const xau = pairs.find((p: any) => p.symbol === 'XAU/USD')
  const eur = pairs.find((p: any) => p.symbol === 'EUR/USD')
  const gbp = pairs.find((p: any) => p.symbol === 'GBP/USD')

  const activeTrades = trades.filter((t: any) => t.status === 'active')
  const totalPnl = trades.filter((t: any) => t.status === 'closed').reduce((s: number, t: any) => s + (t.current_pnl ?? 0), 0)

  // Weekly calendar summary
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - now.getDay() + 1)
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)
  const weekEvents = calendarEvents.filter((ev: any) => {
    const d = new Date(ev.time || ev.date || '')
    return d >= monday && d <= friday
  })
  const highImpactCount = weekEvents.filter((ev: any) => {
    const impact = typeof ev.impact === 'number' ? ev.impact : String(ev.impact).toUpperCase() === 'HIGH' ? 3 : String(ev.impact).toUpperCase() === 'MEDIUM' ? 2 : 1
    return impact >= 3
  }).length

  // Daily risk map for the week
  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const dayEvents = weekEvents.filter((ev: any) => {
      const ed = new Date(ev.time || ev.date || '')
      return ed.getFullYear() === d.getFullYear() && ed.getMonth() === d.getMonth() && ed.getDate() === d.getDate()
    })
    const maxImpact = dayEvents.length > 0
      ? Math.max(...dayEvents.map((e: any) => typeof e.impact === 'number' ? e.impact : String(e.impact).toUpperCase() === 'HIGH' ? 3 : String(e.impact).toUpperCase() === 'MEDIUM' ? 2 : 1))
      : 0
    return { date: d, count: dayEvents.length, maxImpact }
  })

  const sentiment = macro?.regime?.toLowerCase() === 'expansion' ? 'Risk-On'
    : macro?.regime?.toLowerCase() === 'deflation' || macro?.regime?.toLowerCase() === 'stagflation' ? 'Risk-Off'
    : 'Mixed'

  const conn = price ? true : false

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ═══════════════════════════════════════════════════
          TOP: Session + Bias + Quick P&L
          ═══════════════════════════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>

        {/* Session Status */}
        <div className="kt-card kt-card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} style={{ color: killActive ? 'var(--kt-gold)' : 'var(--kt-muted)' }} />
            <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>Session</span>
          </div>
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
        </div>

        {/* Daily Bias (XAU) */}
        <div className="kt-card kt-card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Target size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>XAU/USD Bias</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {biasIcon(xau?.bias ?? 'neutral')}
            <span style={{ fontSize: 'var(--md)', fontWeight: 700, color: biasColor(xau?.bias ?? 'neutral'), textTransform: 'uppercase' }}>
              {xau?.bias ?? 'Neutral'}
            </span>
            <span style={{ fontSize: 'var(--sm)', color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>
              {xau?.confidence ?? 0}%
            </span>
          </div>
          <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
            {xau?.premiumDiscount?.toUpperCase?.() ?? 'ZONE'} · {xau?.killZone?.replace('_', ' ')?.toUpperCase?.() ?? '—'}
          </span>
        </div>

        {/* Quick P&L */}
        <div className="kt-card kt-card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart3 size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>Quick P&L</span>
          </div>
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
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          MIDDLE: Key Levels + Live Rates
          ═══════════════════════════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>

        {/* Key Levels Card (XAU/USD from SMC) */}
        <div className="kt-card kt-card-pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Target size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>XAU/USD Key Levels</span>
          </div>
          {xau ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Signals */}
              {(xau.signals ?? []).slice(0, 3).map((s: string, i: number) => (
                <div key={i} style={{ fontSize: 'var(--xs)', color: 'var(--kt-text2)', lineHeight: 1.4 }}>
                  → {s}
                </div>
              ))}
              {/* Structure */}
              {xau.structure && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  <span style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: 3,
                    background: xau.structure.emaBias === 'bullish' ? 'rgba(34,197,94,.10)' : xau.structure.emaBias === 'bearish' ? 'rgba(239,68,68,.10)' : 'rgba(148,163,184,.08)',
                    color: biasColor(xau.structure.emaBias),
                  }}>EMA: {xau.structure.emaBias}</span>
                  <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: 'rgba(255,255,255,.04)', color: 'var(--kt-muted)' }}>
                    Price {xau.structure.priceVsEma} EMA
                  </span>
                </div>
              )}
              {/* Meta */}
              {xau.meta && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>RSI {xau.meta.rsi?.toFixed(0)}</span>
                  <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>ATR {xau.meta.atr?.toFixed(2)}</span>
                </div>
              )}
              {/* Confidence Bar */}
              <div style={{ marginTop: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 9, color: 'var(--kt-muted)', textTransform: 'uppercase' }}>Confidence</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: biasColor(xau.bias), fontFamily: 'var(--font-mono)' }}>{xau.confidence}%</span>
                </div>
                <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'var(--kt-bg)', overflow: 'hidden' }}>
                  <div style={{ width: `${xau.confidence}%`, height: '100%', borderRadius: 2, background: biasColor(xau.bias), transition: 'width .4s' }} />
                </div>
              </div>
            </div>
          ) : (
            <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>Loading SMC data…</span>
          )}
          <NavLink to="/decision" style={{ display: 'block', marginTop: 10, fontSize: 'var(--xs)', color: 'var(--kt-gold)', textDecoration: 'none', fontWeight: 600 }}>
            Full Trade Plan →
          </NavLink>
        </div>

        {/* Live Rates Watchlist (from MT5Live) */}
        <div className="kt-card kt-card-pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Activity size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>Live Rates</span>
            {conn ? (
              <span className="badge-bull" style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                <Wifi size={10} /> Live
              </span>
            ) : (
              <span className="badge-bear" style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                <WifiOff size={10} /> Offline
              </span>
            )}
          </div>

          {/* XAU/USD live */}
          <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.15)', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, fontSize: 'var(--sm)', color: 'var(--kt-gold)', fontFamily: 'var(--font-mono)' }}>XAU/USD</span>
              <span style={{ fontSize: 'var(--xxl)', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--kt-text)' }}>
                {price?.bid?.toFixed(2) ?? '—'}
              </span>
            </div>
            {price && (
              <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
                <span>Ask: {price.ask?.toFixed(2)}</span>
                <span>Spread: {price.spread} pts</span>
              </div>
            )}
          </div>

          {/* Other pairs from SMC */}
          {[eur, gbp].filter(Boolean).map((pair: any) => (
            <div key={pair.symbol} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', borderRadius: 6,
              border: '1px solid var(--kt-border)',
              marginBottom: 6,
            }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 'var(--sm)', fontFamily: 'var(--font-mono)' }}>{pair.symbol}</span>
                <span style={{ marginLeft: 8, fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
                  {pair.premiumDiscount?.toUpperCase?.() ?? '—'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {biasIcon(pair.bias)}
                <span style={{ fontWeight: 700, fontSize: 'var(--sm)', color: biasColor(pair.bias), fontFamily: 'var(--font-mono)' }}>
                  {pair.confidence}%
                </span>
              </div>
            </div>
          ))}

          <NavLink to="/market" style={{ display: 'block', marginTop: 6, fontSize: 'var(--xs)', color: 'var(--kt-gold)', textDecoration: 'none', fontWeight: 600 }}>
            Full Market View →
          </NavLink>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          BOTTOM: Weekly Outlook + Open Positions
          ═══════════════════════════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>

        {/* Weekly Outlook Summary */}
        <div className="kt-card kt-card-pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Calendar size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>Weekly Outlook</span>
            <span style={{
              marginLeft: 'auto', padding: '2px 8px', borderRadius: 4,
              fontSize: 'var(--xs)', fontWeight: 700, fontFamily: 'var(--font-mono)',
              background: sentiment === 'Risk-On' ? 'rgba(34,197,94,.15)' : sentiment === 'Risk-Off' ? 'rgba(239,68,68,.15)' : 'rgba(245,158,11,.12)',
              color: sentiment === 'Risk-On' ? 'var(--kt-up)' : sentiment === 'Risk-Off' ? 'var(--kt-dn)' : 'var(--kt-gold)',
            }}>
              {sentiment}
            </span>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
            <div style={{ textAlign: 'center', padding: 6 }}>
              <div style={{ fontSize: 'var(--md)', fontWeight: 700, color: highImpactCount > 3 ? '#f87171' : 'var(--kt-text)', fontFamily: 'var(--font-mono)' }}>{highImpactCount}</div>
              <div style={{ fontSize: 9, color: 'var(--kt-muted)' }}>High Impact</div>
            </div>
            <div style={{ textAlign: 'center', padding: 6 }}>
              <div style={{ fontSize: 'var(--md)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{weekEvents.length}</div>
              <div style={{ fontSize: 9, color: 'var(--kt-muted)' }}>Total Events</div>
            </div>
            <div style={{ textAlign: 'center', padding: 6 }}>
              <div style={{ fontSize: 'var(--md)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{macro?.regime ?? '—'}</div>
              <div style={{ fontSize: 9, color: 'var(--kt-muted)' }}>Regime</div>
            </div>
          </div>

          {/* Risk Map */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 10 }}>
            {days.map((day, i) => {
              const bg = day.maxImpact >= 3 ? 'rgba(239,68,68,.12)' : day.maxImpact >= 2 ? 'rgba(245,158,11,.10)' : 'rgba(34,197,94,.08)'
              const border = day.maxImpact >= 3 ? 'rgba(239,68,68,.35)' : day.maxImpact >= 2 ? 'rgba(245,158,11,.25)' : 'rgba(34,197,94,.20)'
              const col = day.maxImpact >= 3 ? '#f87171' : day.maxImpact >= 2 ? '#f59e0b' : 'var(--kt-up)'
              return (
                <div key={i} style={{ padding: 8, borderRadius: 6, background: bg, border: `1px solid ${border}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--kt-text)' }}>{DAY_SHORT[day.date.getDay()]}</div>
                  <div style={{ fontSize: 'var(--md)', fontWeight: 800, color: col, fontFamily: 'var(--font-mono)' }}>{day.count}</div>
                </div>
              )
            })}
          </div>

          {macro && (
            <div style={{ padding: '6px 10px', borderRadius: 6, background: 'rgba(245,158,11,.06)', borderLeft: '3px solid var(--kt-gold)', fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
              DXY: {macro.dxy?.toFixed(2) ?? '—'} · 10Y: {macro.dgs10?.toFixed(3) ?? '—'}%
            </div>
          )}

          <NavLink to="/macro" style={{ display: 'block', marginTop: 10, fontSize: 'var(--xs)', color: 'var(--kt-gold)', textDecoration: 'none', fontWeight: 600 }}>
            Full Outlook →
          </NavLink>
        </div>

        {/* Open Positions */}
        <div className="kt-card kt-card-pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Shield size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>Open Positions</span>
            <span style={{
              marginLeft: 'auto', padding: '2px 8px', borderRadius: 4,
              fontSize: 'var(--xs)', fontWeight: 700, fontFamily: 'var(--font-mono)',
              background: 'rgba(245,158,11,.12)', color: 'var(--kt-gold)',
            }}>
              {activeTrades.length}
            </span>
          </div>

          {activeTrades.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center' }}>
              <p style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)', margin: 0 }}>No active trades</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="kt-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Dir</th>
                    <th>Entry</th>
                    <th>SL</th>
                    <th>TP1</th>
                    <th>Lot</th>
                  </tr>
                </thead>
                <tbody>
                  {activeTrades.slice(0, 5).map((t: any) => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{t.symbol}</td>
                      <td><span className={t.direction === 'long' ? 'badge-bull' : 'badge-bear'}>{t.direction.toUpperCase()}</span></td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{t.entry_price}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--kt-dn)' }}>{t.sl ?? '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--kt-up)' }}>{t.tp1 ?? '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{t.lot_size}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <NavLink to="/portfolio" style={{ display: 'block', marginTop: 10, fontSize: 'var(--xs)', color: 'var(--kt-gold)', textDecoration: 'none', fontWeight: 600 }}>
            Full Trade Manager →
          </NavLink>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          MODULE GRID (Quick Nav)
          ═══════════════════════════════════════════════════ */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Zap size={16} style={{ color: 'var(--kt-gold)' }} />
          <span style={{ fontWeight: 600, fontSize: 'var(--sm)' }}>Quick Nav</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
          {[
            { code: 'SMC', to: '/decision', title: 'SMC Engine' },
            { code: 'MKT', to: '/market', title: 'Market' },
            { code: 'MAC', to: '/macro', title: 'Macro' },
            { code: 'CHT', to: '/chart', title: 'Chart Lab' },
            { code: 'SCN', to: '/scanner', title: 'Scanner' },
            { code: 'JRN', to: '/journal', title: 'Journal' },
            { code: 'AI', to: '/ai', title: 'AI Assistant' },
            { code: 'RTE', to: '/rates', title: 'Rates' },
          ].map(m => (
            <NavLink key={m.code} to={m.to} style={{
              padding: '10px 14px', borderRadius: 8,
              border: '1px solid var(--kt-border)',
              textDecoration: 'none', color: 'var(--kt-text)',
              transition: 'border-color .15s',
            }}>
              <div style={{ fontSize: 9, color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{m.code}</div>
              <div style={{ fontSize: 'var(--sm)', fontWeight: 600 }}>{m.title}</div>
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  )
}
