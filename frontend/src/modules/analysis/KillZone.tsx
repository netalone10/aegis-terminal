import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { api } from '../../lib/api'

/* ── Kill Zone sessions (WIB = UTC+7) ── */
const SESSIONS = [
  { id: 'asian', name: 'Asian Session', start: 7, end: 11, pairs: ['USD/JPY', 'AUD/USD', 'NZD/USD'], character: 'Range', color: '#38bdf8', icon: '🌏' },
  { id: 'london', name: 'London Session', start: 13, end: 17, pairs: ['EUR/USD', 'GBP/USD', 'EUR/GBP'], character: 'Manipulation', color: '#a78bfa', icon: '🇬🇧' },
  { id: 'overlap', name: 'London-NY Overlap', start: 20, end: 23, pairs: ['All Major Pairs'], character: 'Trending', color: '#4ade80', icon: '🔥', best: true },
  { id: 'ny', name: 'NY Close', start: 0, end: 3, pairs: ['EUR/USD', 'GBP/USD', 'USD/CAD'], character: 'Distribution', color: '#fb923c', icon: '🇺🇸' },
]

/* ── Session analytics mock data ── */
interface SessionStat { name: string; time: string; winRate: number; avgRR: string; bestPair: string; character: string; totalTrades: number; profitFactor: number }
const SESSION_STATS: SessionStat[] = [
  { name: 'Asian', time: '07:00–11:00 WIB', winRate: 45, avgRR: '1:1.2', bestPair: 'USD/JPY', character: 'Range / Accumulation', totalTrades: 84, profitFactor: 1.1 },
  { name: 'London', time: '13:00–17:00 WIB', winRate: 62, avgRR: '1:1.8', bestPair: 'EUR/USD', character: 'Manipulation / Breakout', totalTrades: 112, profitFactor: 1.9 },
  { name: 'NY Overlap', time: '20:00–23:00 WIB', winRate: 68, avgRR: '1:2.1', bestPair: 'GBP/USD', character: 'Trending / Distribution', totalTrades: 96, profitFactor: 2.4 },
  { name: 'NY Close', time: '00:00–03:00 WIB', winRate: 52, avgRR: '1:1.5', bestPair: 'XAU/USD', character: 'Reversal / Profit-taking', totalTrades: 68, profitFactor: 1.4 },
]
const HEATMAP_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const HEATMAP: number[][] = [
  [0.9, 1.7, 2.0, 1.2], [1.1, 1.5, 2.3, 1.4], [1.3, 2.1, 2.8, 1.6], [0.8, 1.8, 2.2, 1.1], [0.6, 1.2, 1.5, 0.7],
]
const RECOMMENDATIONS = [
  { tag: 'BEST', color: 'var(--kt-up)', text: 'Your best session: London-NY Overlap (68% win rate)' },
  { tag: 'AVOID', color: 'var(--kt-dn)', text: 'Avoid: Asian session for EUR/USD (38% win rate)' },
  { tag: 'TIP', color: 'var(--kt-gold)', text: 'Best day: Wednesday (all sessions perform well)' },
]

/* ── Session report types ── */
interface SnapshotField { value: number | string | null; source: string; asOf: string; status: 'live' | 'delayed' | 'unavailable' }
interface SessionSnapshot { session: 'asia' | 'london' | 'ny'; generatedAt: string; dxy: SnapshotField; xauusd: SnapshotField & { changePct?: number }; eurusd: SnapshotField; gbpusd: SnapshotField; usdjpy: SnapshotField; yield10y: SnapshotField; yield2y: SnapshotField; spread2y10y: SnapshotField; calendarEvents: Array<{ title: string; currency: string; impact: string; date: string }>; headlines: Array<{ title: string; source: string; pubDate: string }> }
interface AnalysisResult { regime: 'risk_on' | 'risk_off' | 'neutral' | 'volatile'; regimeReason: string; usdStrength: 'strong' | 'weak' | 'neutral'; usdStrengthReason: string; bias: Record<string, { direction: 'bullish' | 'bearish' | 'neutral'; confidence: number; reason: string }>; riskLabel: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME'; riskFactors: string[]; keyLevels: { xauusd: { support: number | null; resistance: number | null } } }
interface SessionReportData { session: string; generatedAt: string; dataAsOf: string; status: 'LIVE' | 'DELAYED' | 'PARTIAL'; confidence: number; snapshot: SessionSnapshot; analysis: AnalysisResult; narrative: { summary: string; perAssetNotes: Record<string, string>; calendarCallouts: string[]; tags: string[] }; sources: string[] }

const REPORT_SESSIONS = [
  { key: 'asia', label: 'Asia', time: '07:00–15:00 WIB', color: '#60a5fa' },
  { key: 'london', label: 'London', time: '13:00–21:00 WIB', color: '#f59e0b' },
  { key: 'ny', label: 'New York', time: '19:00–04:00 WIB', color: '#a78bfa' },
] as const

/* ── Helpers ── */
function getWIB(): Date {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000
  return new Date(utc + 7 * 3_600_000)
}
function wibMinutes(d: Date): number { return d.getHours() * 60 + d.getMinutes() }
function pad(n: number): string { return String(n).padStart(2, '0') }
function fmtHM(totalMin: number): string { const h = Math.floor(totalMin / 60) % 24; const m = totalMin % 60; return `${pad(h)}:${pad(m)}` }
function fmtCountdown(mins: number): string { if (mins <= 0) return '00:00'; const h = Math.floor(mins / 60); const m = mins % 60; return h > 0 ? `${pad(h)}h ${pad(m)}m` : `${pad(m)}m` }
function inSession(wibMin: number, start: number, end: number): boolean { const s = start * 60; const e = end * 60; if (s < e) return wibMin >= s && wibMin < e; return wibMin >= s || wibMin < e }
function minutesUntil(wibMin: number, start: number): number { const s = start * 60; let diff = s - wibMin; if (diff <= 0) diff += 1440; return diff % 1440 }
function sessionDuration(start: number, end: number): number { if (end > start) return (end - start) * 60; return (24 - start + end) * 60 }
function elapsed(wibMin: number, start: number): number { const s = start * 60; if (wibMin >= s) return wibMin - s; return wibMin + 1440 - s }
function heatColor(pf: number): string { if (pf >= 2.0) return 'rgba(34,197,94,.45)'; if (pf >= 1.5) return 'rgba(34,197,94,.25)'; if (pf >= 1.0) return 'rgba(250,204,21,.15)'; return 'rgba(239,68,68,.3)' }
function formatTime(iso: string): string { try { return new Date(iso).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short', timeZone: 'UTC' }) + ' UTC' } catch { return iso } }

const STATUS_COLORS: Record<string, string> = { LIVE: 'var(--kt-up)', DELAYED: 'var(--kt-gold)', PARTIAL: 'var(--kt-dn)' }
const RISK_COLORS: Record<string, string> = { LOW: '#22c55e', MODERATE: '#f59e0b', HIGH: '#ef4444', EXTREME: '#a855f7' }
const REGIME_LABELS: Record<string, string> = { risk_on: 'Risk-On', risk_off: 'Risk-Off', neutral: 'Neutral', volatile: 'Volatile' }

/* ── Tiny sub-components ── */
function Stat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return <div><p style={{ fontSize: '.65rem', color: 'var(--kt-muted)', margin: 0, fontFamily: 'var(--font-mono)' }}>{label}</p><p style={{ fontSize: '.9rem', margin: 0, color: positive === true ? 'var(--kt-up)' : positive === false ? 'var(--kt-dn)' : 'var(--kt-text)', fontWeight: 600 }}>{value}</p></div>
}
function Badge({ val, best }: { val: string; best: boolean }) {
  return best ? <span style={{ background: 'var(--kt-up)', color: '#000', fontWeight: 700, padding: '1px 6px', borderRadius: 3, fontSize: '.75rem' }}>{val}</span> : <span>{val}</span>
}
function StatusBadge({ status }: { status: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, fontSize: 'var(--xs)', fontWeight: 700, background: `${STATUS_COLORS[status] ?? 'var(--kt-muted)'}20`, color: STATUS_COLORS[status] ?? 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[status] ?? 'var(--kt-muted)' }} />{status}</span>
}
function ConfidenceBar({ value }: { value: number }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ flex: 1, height: 6, background: 'var(--kt-bg2)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${value}%`, height: '100%', background: value >= 70 ? 'var(--kt-up)' : value >= 40 ? 'var(--kt-gold)' : 'var(--kt-dn)', borderRadius: 3 }} /></div><span style={{ fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)', color: 'var(--kt-muted)', minWidth: 32 }}>{value}%</span></div>
}
const th: React.CSSProperties = { padding: '6px 8px', fontSize: '.7rem', fontFamily: 'var(--font-mono)' }
const td: React.CSSProperties = { padding: '8px 8px' }

/* ══════════════════════════════════════════════════════════════════
   MERGED COMPONENT: KillZone + SessionAnalytics + SessionReport
   TOP: Live countdown | MID: Performance analytics | BOT: Reports
   ══════════════════════════════════════════════════════════════════ */
export default function KillZone() {
  const [now, setNow] = useState(getWIB())
  const queryClient = useQueryClient()

  useEffect(() => { const id = setInterval(() => setNow(getWIB()), 1000); return () => clearInterval(id) }, [])

  const wibMin = wibMinutes(now)
  const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds()

  const active = SESSIONS.find((ses) => inSession(wibMin, ses.start, ses.end))
  let nextSession: typeof SESSIONS[0] | null = null
  let nextDelta = 1440
  for (const ses of SESSIONS) {
    if (active && ses.id === active.id) continue
    const d = minutesUntil(wibMin, ses.start)
    if (d < nextDelta) { nextDelta = d; nextSession = ses }
  }

  const bestWR = SESSION_STATS.reduce((a, b) => a.winRate > b.winRate ? a : b).name
  const bestPF = SESSION_STATS.reduce((a, b) => a.profitFactor > b.profitFactor ? a : b).name

  const { data: reports, isLoading: loadingReports } = useQuery<Record<string, SessionReportData | null>>({
    queryKey: ['session-reports'],
    queryFn: async () => {
      const results = await Promise.allSettled(REPORT_SESSIONS.map(s => api<SessionReportData | null>(`/api/session/report?session=${s.key}`).catch(() => null)))
      const map: Record<string, SessionReportData | null> = {}
      REPORT_SESSIONS.forEach((s, i) => { map[s.key] = results[i].status === 'fulfilled' ? results[i].value : null })
      return map
    },
    refetchInterval: 300_000, staleTime: 180_000,
  })

  const refreshReport = useMutation({
    mutationFn: (session: string) => api<SessionReportData>(`/api/session/report/refresh?session=${session}`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['session-reports'] }),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--md, 16px)' }}>
      {/* ── HERO: Clock + Status ── */}
      <div className="kt-panel" style={{ textAlign: 'center', padding: '2rem' }}>
        <p className="kt-kicker" style={{ marginBottom: 4 }}>CURRENT WIB TIME (UTC+7)</p>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '4rem', fontWeight: 700, color: 'var(--kt-text)', letterSpacing: '0.05em', lineHeight: 1.1 }}>
          {pad(h)}:{pad(m)}<span style={{ color: 'var(--kt-muted)', fontSize: '2rem' }}>:{pad(s)}</span>
        </div>
        {active ? (
          <div style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderRadius: 999, background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.35)', boxShadow: '0 0 24px rgba(74,222,128,0.15)' }}>
            <span className="kt-status-dot" style={{ background: 'var(--kt-up)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            <span style={{ color: 'var(--kt-up)', fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 'var(--sm, 13px)' }}>KILL ZONE ACTIVE — {active.name.toUpperCase()}</span>
            <span style={{ color: 'var(--kt-text2)', fontFamily: 'var(--font-mono)', fontSize: 'var(--sm, 13px)', marginLeft: 4 }}>⏱ {fmtCountdown(Math.ceil(sessionDuration(active.start, active.end) - elapsed(wibMin, active.start)))}</span>
          </div>
        ) : (
          <div style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderRadius: 999, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)' }}>
            <span className="kt-status-dot" style={{ background: '#fbbf24' }} />
            <span style={{ color: '#fbbf24', fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 'var(--sm, 13px)' }}>DEAD ZONE — Next: {nextSession?.name}</span>
            <span style={{ color: 'var(--kt-text2)', fontFamily: 'var(--font-mono)', fontSize: 'var(--sm, 13px)', marginLeft: 4 }}>in {fmtCountdown(nextDelta)}</span>
          </div>
        )}
      </div>

      {/* ── Next kill zone countdown ── */}
      {!active && nextSession && (
        <div className="kt-panel" style={{ textAlign: 'center', padding: '1.5rem' }}>
          <p className="kt-kicker" style={{ marginBottom: 8 }}>NEXT KILL ZONE</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <span style={{ fontSize: '2rem' }}>{nextSession.icon}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 700, color: nextSession.color }}>{nextSession.name}</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '3rem', fontWeight: 700, color: 'var(--kt-gold)', marginTop: 8 }}>{fmtCountdown(nextDelta)}</div>
          <p style={{ color: 'var(--kt-text2)', fontSize: 'var(--xs, 11px)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>{pad(nextSession.start)}:00 — {pad(nextSession.end)}:00 WIB</p>
        </div>
      )}

      {/* ── 24h Timeline ── */}
      <div className="kt-panel" style={{ padding: '1.2rem' }}>
        <p className="kt-kicker" style={{ marginBottom: 10 }}>24-HOUR TIMELINE</p>
        <div style={{ position: 'relative', height: 40, borderRadius: 6, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
          {SESSIONS.map((ses) => {
            const left = (ses.start / 24) * 100
            const width = sessionDuration(ses.start, ses.end) / 1440 * 100
            const isActive = active?.id === ses.id
            return <div key={ses.id} style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, top: 0, height: '100%', background: isActive ? ses.color : `${ses.color}44`, borderRight: '1px solid rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--xs, 11px)', fontFamily: 'var(--font-mono)', fontWeight: isActive ? 700 : 400, color: isActive ? '#000' : 'var(--kt-text2)', overflow: 'hidden', whiteSpace: 'nowrap', transition: 'background 0.3s' }}>{width > 8 && ses.id.toUpperCase()}</div>
          })}
          <div style={{ position: 'absolute', left: `${(wibMin / 1440) * 100}%`, top: -2, width: 2, height: 44, background: 'var(--kt-gold)', boxShadow: '0 0 8px var(--kt-gold)', zIndex: 5 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 'var(--xs, 11px)', fontFamily: 'var(--font-mono)', color: 'var(--kt-muted)' }}>
          {[0, 3, 6, 9, 12, 15, 18, 21].map((hr) => <span key={hr}>{pad(hr)}</span>)}
        </div>
      </div>

      {/* ── Session Cards ── */}
      <div className="kt-grid-2">
        {SESSIONS.map((ses) => {
          const isActive = active?.id === ses.id
          const sesStatus = isActive ? 'ACTIVE' : minutesUntil(wibMin, ses.start) < 360 ? 'UPCOMING' : 'CLOSED'
          const dur = sessionDuration(ses.start, ses.end)
          const el = isActive ? elapsed(wibMin, ses.start) : 0
          const pct = isActive ? Math.min(100, (el / dur) * 100) : 0
          const remaining = isActive ? dur - el : 0
          return (
            <div key={ses.id} className="kt-panel" style={{ padding: '1.2rem', border: isActive ? `1px solid ${ses.color}55` : undefined, boxShadow: isActive ? `0 0 20px ${ses.color}15` : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '1.3rem' }}>{ses.icon}</span>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 'var(--sm, 13px)', color: 'var(--kt-text)', fontFamily: 'var(--font-mono)' }}>{ses.name}</p>
                    <p style={{ fontSize: 'var(--xs, 11px)', color: 'var(--kt-text2)', fontFamily: 'var(--font-mono)' }}>{pad(ses.start)}:00 — {pad(ses.end)}:00 WIB</p>
                  </div>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 999, fontSize: 'var(--xs, 11px)', fontWeight: 700, fontFamily: 'var(--font-mono)', background: sesStatus === 'ACTIVE' ? 'rgba(74,222,128,0.15)' : sesStatus === 'UPCOMING' ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.05)', color: sesStatus === 'ACTIVE' ? 'var(--kt-up)' : sesStatus === 'UPCOMING' ? '#fbbf24' : 'var(--kt-muted)', border: `1px solid ${sesStatus === 'ACTIVE' ? 'rgba(74,222,128,0.3)' : sesStatus === 'UPCOMING' ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.06)'}` }}>
                  {sesStatus === 'ACTIVE' && <span className="kt-status-dot" style={{ background: 'var(--kt-up)', width: 6, height: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />}
                  {sesStatus}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 'var(--xs, 11px)', fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: 'var(--kt-text2)' }}>{ses.character}</span>
                {(ses as any).best && <span style={{ fontSize: 'var(--xs, 11px)', fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 4, background: 'rgba(74,222,128,0.12)', color: 'var(--kt-up)', border: '1px solid rgba(74,222,128,0.25)', fontWeight: 700 }}>★ BEST</span>}
              </div>
              {isActive && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--xs, 11px)', fontFamily: 'var(--font-mono)', color: 'var(--kt-text2)', marginBottom: 4 }}>
                    <span>{fmtHM(el)} elapsed</span><span>{fmtCountdown(Math.ceil(remaining))} left</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: ses.color, boxShadow: `0 0 8px ${ses.color}66`, transition: 'width 1s linear' }} />
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ses.pairs.map((p) => <span key={p} style={{ fontSize: 'var(--xs, 11px)', fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: 'var(--kt-text)', border: '1px solid rgba(255,255,255,0.08)' }}>{p}</span>)}
              </div>
            </div>
          )
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════
          SECTION 2: SESSION PERFORMANCE ANALYTICS
          ══════════════════════════════════════════════════════════ */}

      {/* ── Session overview cards ── */}
      <div className="kt-grid-4">
        {SESSION_STATS.map(s => (
          <div key={s.name} className="kt-card kt-card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--xs)' }}>
            <p className="kt-kicker" style={{ marginBottom: 0 }}>{s.name.toUpperCase()}</p>
            <span style={{ fontSize: '.72rem', color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>{s.time}</span>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Stat label="Win" value={`${s.winRate}%`} positive={s.winRate >= 55} />
              <Stat label="R:R" value={s.avgRR} />
            </div>
            <span style={{ fontSize: '.75rem', color: 'var(--kt-gold)' }}>★ {s.bestPair}</span>
            <span style={{ fontSize: '.7rem', color: 'var(--kt-text2)' }}>{s.character}</span>
          </div>
        ))}
      </div>

      {/* ── Comparison table ── */}
      <div className="kt-panel kt-card-pad" style={{ overflowX: 'auto' }}>
        <p className="kt-kicker" style={{ marginBottom: 'var(--sm)' }}>SESSION COMPARISON</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem', fontFamily: 'var(--font-mono)' }}>
          <thead><tr style={{ color: 'var(--kt-muted)', textAlign: 'left' }}><th style={th}>Session</th><th style={th}>Win Rate</th><th style={th}>Avg R:R</th><th style={th}>Trades</th><th style={th}>Best Pair</th><th style={th}>Profit Factor</th></tr></thead>
          <tbody>
            {SESSION_STATS.map(s => (
              <tr key={s.name} style={{ borderTop: '1px solid var(--kt-border)' }}>
                <td style={td}>{s.name}</td><td style={td}><Badge val={`${s.winRate}%`} best={s.name === bestWR} /></td><td style={td}>{s.avgRR}</td><td style={td}>{s.totalTrades}</td><td style={td}>{s.bestPair}</td><td style={td}><Badge val={String(s.profitFactor)} best={s.name === bestPF} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Heatmap ── */}
      <div className="kt-panel kt-card-pad">
        <p className="kt-kicker" style={{ marginBottom: 'var(--sm)' }}>PERFORMANCE HEATMAP</p>
        <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(4, 1fr)', gap: 4 }}>
          <div />
          {SESSION_STATS.map(s => <div key={s.name} style={{ textAlign: 'center', fontSize: '.7rem', color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>{s.name}</div>)}
          {HEATMAP_DAYS.map((day, di) => (
            <React.Fragment key={day}>
              <div style={{ fontSize: '.75rem', color: 'var(--kt-text2)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center' }}>{day}</div>
              {HEATMAP[di].map((pf, si) => (
                <div key={`${di}-${si}`} style={{ background: heatColor(pf), borderRadius: 4, padding: 'var(--xs) 0', textAlign: 'center', fontSize: '.75rem', fontFamily: 'var(--font-mono)', color: pf >= 1.0 ? 'var(--kt-up)' : 'var(--kt-dn)', border: '1px solid var(--kt-border)' }}>{pf.toFixed(1)}×</div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── Recommendations ── */}
      <div className="kt-panel kt-card-pad">
        <p className="kt-kicker" style={{ marginBottom: 'var(--sm)' }}>RECOMMENDATIONS</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--xs)' }}>
          {RECOMMENDATIONS.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sm)', fontSize: '.82rem' }}>
              <span style={{ background: r.color, color: '#000', fontWeight: 700, fontSize: '.65rem', padding: '2px 8px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>{r.tag}</span>
              <span>{r.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          SECTION 3: RECENT SESSION REPORTS
          ══════════════════════════════════════════════════════════ */}
      <div>
        <p className="kt-kicker" style={{ marginBottom: 8 }}>SESSION REPORTS</p>
        {loadingReports ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {REPORT_SESSIONS.map(s => <div key={s.key} className="kt-panel kt-card-pad" style={{ minHeight: 200 }}><div className="skeleton w-16 h-3 mb-3" /><div className="skeleton w-full h-5 mb-2" /><div className="skeleton w-3/4 h-5" /></div>)}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {REPORT_SESSIONS.map(s => {
              const report = reports?.[s.key]
              return (
                <div key={s.key} className="kt-panel" style={{ borderLeft: `3px solid ${s.color}`, minHeight: 200 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--kt-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 'var(--sm)', color: s.color }}>{s.label}</span>
                      {report && <StatusBadge status={report.status} />}
                    </div>
                    <button onClick={() => refreshReport.mutate(s.key)} disabled={refreshReport.isPending && refreshReport.variables === s.key} style={{ padding: '4px 8px', borderRadius: 4, background: 'var(--kt-bg2)', border: '1px solid var(--kt-border)', color: 'var(--kt-text)', fontSize: 'var(--xs)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <RefreshCw size={11} style={{ animation: refreshReport.isPending ? 'spin 1s linear infinite' : 'none' }} />Refresh
                    </button>
                  </div>
                  <div style={{ padding: '12px 14px' }}>
                    {!report ? (
                      <p style={{ color: 'var(--kt-muted)', fontSize: 'var(--sm)', textAlign: 'center', padding: '16px 0' }}>No report yet</p>
                    ) : (
                      <>
                        <div style={{ marginBottom: 8 }}>
                          <ConfidenceBar value={report.confidence} />
                        </div>
                        {report.narrative.tags.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                            {report.narrative.tags.map((tag, i) => <span key={i} style={{ padding: '2px 6px', borderRadius: 4, fontSize: 'var(--xs)', fontWeight: 600, background: 'var(--kt-bg2)', color: 'var(--kt-gold)', fontFamily: 'var(--font-mono)' }}>{tag}</span>)}
                          </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                          <div className="kt-card-pad" style={{ padding: '6px 8px' }}>
                            <span style={{ fontSize: '10px', color: 'var(--kt-muted)', display: 'block' }}>Regime</span>
                            <span style={{ fontSize: 'var(--xs)', fontWeight: 700 }}>{REGIME_LABELS[report.analysis.regime] ?? report.analysis.regime}</span>
                          </div>
                          <div className="kt-card-pad" style={{ padding: '6px 8px' }}>
                            <span style={{ fontSize: '10px', color: 'var(--kt-muted)', display: 'block' }}>USD</span>
                            <span style={{ fontSize: 'var(--xs)', fontWeight: 700, color: report.analysis.usdStrength === 'strong' ? 'var(--kt-up)' : report.analysis.usdStrength === 'weak' ? 'var(--kt-dn)' : 'var(--kt-text)' }}>{report.analysis.usdStrength.toUpperCase()}</span>
                          </div>
                          <div className="kt-card-pad" style={{ padding: '6px 8px' }}>
                            <span style={{ fontSize: '10px', color: 'var(--kt-muted)', display: 'block' }}>Risk</span>
                            <span style={{ fontSize: 'var(--xs)', fontWeight: 700, color: RISK_COLORS[report.analysis.riskLabel] }}>{report.analysis.riskLabel}</span>
                          </div>
                        </div>
                        <p style={{ fontSize: 'var(--xs)', color: 'var(--kt-text2)', lineHeight: 1.5, margin: 0 }}>{report.narrative.summary.slice(0, 200)}{report.narrative.summary.length > 200 && '…'}</p>
                        <span style={{ fontSize: '10px', color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)', marginTop: 6, display: 'block' }}>{formatTime(report.generatedAt)}</span>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } } @keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

