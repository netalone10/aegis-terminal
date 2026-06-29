import { useState, useEffect } from 'react'
// lucide imports removed (unused)

/* ── Kill Zone sessions (WIB = UTC+7) ── */
const SESSIONS = [
  {
    id: 'asian',
    name: 'Sesi Asia',
    start: 7,   // 07:00 WIB
    end: 11,    // 11:00 WIB
    pairs: ['USD/JPY', 'AUD/USD', 'NZD/USD'],
    character: 'Range',
    color: '#38bdf8', // sky
    icon: '🌏',
  },
  {
    id: 'london',
    name: 'Sesi London',
    start: 13,  // 13:00 WIB
    end: 17,    // 17:00 WIB
    pairs: ['EUR/USD', 'GBP/USD', 'EUR/GBP'],
    character: 'Manipulasi',
    color: '#a78bfa', // violet
    icon: '🇬🇧',
  },
  {
    id: 'overlap',
    name: 'Overlap London-NY',
    start: 20,  // 20:00 WIB
    end: 23,    // 23:00 WIB
    pairs: ['Semua Pair Mayor'],
    character: 'Trending',
    color: '#4ade80', // green
    icon: '🔥',
    best: true,
  },
  {
    id: 'ny',
    name: 'Penutupan NY',
    start: 0,   // 00:00 WIB
    end: 3,     // 03:00 WIB
    pairs: ['EUR/USD', 'GBP/USD', 'USD/CAD'],
    character: 'Distribution',
    color: '#fb923c', // orange
    icon: '🇺🇸',
  },
]

/* ── Helpers ── */
function getWIB(): Date {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000
  return new Date(utc + 7 * 3_600_000)
}

function wibMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function fmtHM(totalMin: number): string {
  const h = Math.floor(totalMin / 60) % 24
  const m = totalMin % 60
  return `${pad(h)}:${pad(m)}`
}

function fmtCountdown(mins: number): string {
  if (mins <= 0) return '00:00'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${pad(h)}h ${pad(m)}m` : `${pad(m)}m`
}

/** Returns true if wibHour is in [start, end) handling wrap past midnight */
function inSession(wibMin: number, start: number, end: number): boolean {
  const s = start * 60
  const e = end * 60
  if (s < e) return wibMin >= s && wibMin < e
  // wraps midnight: e.g. 00:00-03:00
  return wibMin >= s || wibMin < e
}

/** Minutes until session starts (from wibMin). 0 if already active. */
function minutesUntil(wibMin: number, start: number): number {
  const s = start * 60
  let diff = s - wibMin
  if (diff <= 0) diff += 1440
  return diff % 1440
}

/** Session duration in minutes */
function sessionDuration(start: number, end: number): number {
  if (end > start) return (end - start) * 60
  return (24 - start + end) * 60
}

/** Minutes elapsed in current session */
function elapsed(wibMin: number, start: number): number {
  const s = start * 60
  if (wibMin >= s) return wibMin - s
  return wibMin + 1440 - s
}

/* ── Component ── */
export default function KillZone() {
  const [now, setNow] = useState(getWIB())

  useEffect(() => {
    const id = setInterval(() => setNow(getWIB()), 1000)
    return () => clearInterval(id)
  }, [])

  const wibMin = wibMinutes(now)
  const h = now.getHours()
  const m = now.getMinutes()
  const s = now.getSeconds()

  /* Find active session */
  const active = SESSIONS.find((ses) => inSession(wibMin, ses.start, ses.end))

  /* Find next upcoming session (closest) */
  let nextSession: typeof SESSIONS[0] | null = null
  let nextDelta = 1440
  for (const ses of SESSIONS) {
    if (active && ses.id === active.id) continue
    const d = minutesUntil(wibMin, ses.start)
    if (d < nextDelta) {
      nextDelta = d
      nextSession = ses
    }
  }

  /* Status computed inline below */

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--md, 16px)' }}>

      {/* ── Hero: Big WIB Clock + Status ── */}
      <div className="kt-panel" style={{ textAlign: 'center', padding: '2rem' }}>
        <p className="kt-kicker" style={{ marginBottom: 4 }}>CURRENT WIB TIME (UTC+7)</p>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '4rem',
          fontWeight: 700,
          color: 'var(--kt-text)',
          letterSpacing: '0.05em',
          lineHeight: 1.1,
        }}>
          {pad(h)}:{pad(m)}<span style={{ color: 'var(--kt-muted)', fontSize: '2rem' }}>:{pad(s)}</span>
        </div>

        {/* Status badge */}
        {active ? (
          <div style={{
            marginTop: '1rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 20px',
            borderRadius: 999,
            background: 'rgba(74,222,128,0.12)',
            border: '1px solid rgba(74,222,128,0.35)',
            boxShadow: '0 0 24px rgba(74,222,128,0.15)',
          }}>
            <span className="kt-status-dot" style={{ background: 'var(--kt-up)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            <span style={{ color: 'var(--kt-up)', fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 'var(--sm, 13px)' }}>
              KILL ZONE ACTIVE — {active.name.toUpperCase()}
            </span>
            <span style={{ color: 'var(--kt-text2)', fontFamily: 'var(--font-mono)', fontSize: 'var(--sm, 13px)', marginLeft: 4 }}>
              ⏱ {fmtCountdown(Math.ceil((sessionDuration(active.start, active.end) - elapsed(wibMin, active.start))))}
            </span>
          </div>
        ) : (
          <div style={{
            marginTop: '1rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 20px',
            borderRadius: 999,
            background: 'rgba(251,191,36,0.1)',
            border: '1px solid rgba(251,191,36,0.3)',
          }}>
            <span className="kt-status-dot" style={{ background: '#fbbf24' }} />
            <span style={{ color: '#fbbf24', fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 'var(--sm, 13px)' }}>
              DEAD ZONE — Next: {nextSession?.name}
            </span>
            <span style={{ color: 'var(--kt-text2)', fontFamily: 'var(--font-mono)', fontSize: 'var(--sm, 13px)', marginLeft: 4 }}>
              in {fmtCountdown(nextDelta)}
            </span>
          </div>
        )}
      </div>

      {/* ── Countdown to next session ── */}
      {!active && nextSession && (
        <div className="kt-panel" style={{ textAlign: 'center', padding: '1.5rem' }}>
          <p className="kt-kicker" style={{ marginBottom: 8 }}>NEXT KILL ZONE</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <span style={{ fontSize: '2rem' }}>{nextSession.icon}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 700, color: nextSession.color }}>
              {nextSession.name}
            </span>
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '3rem',
            fontWeight: 700,
            color: 'var(--kt-gold)',
            marginTop: 8,
          }}>
            {fmtCountdown(nextDelta)}
          </div>
          <p style={{ color: 'var(--kt-text2)', fontSize: 'var(--xs, 11px)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
            {pad(nextSession.start)}:00 — {pad(nextSession.end)}:00 WIB
          </p>
        </div>
      )}

      {/* ── 24h Timeline ── */}
      <div className="kt-panel" style={{ padding: '1.2rem' }}>
        <p className="kt-kicker" style={{ marginBottom: 10 }}>24-HOUR TIMELINE</p>
        <div style={{ position: 'relative', height: 40, borderRadius: 6, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
          {/* Session blocks */}
          {SESSIONS.map((ses) => {
            const left = (ses.start / 24) * 100
            const width = sessionDuration(ses.start, ses.end) / 1440 * 100
            const isActive = active?.id === ses.id
            return (
              <div key={ses.id} style={{
                position: 'absolute',
                left: `${left}%`,
                width: `${width}%`,
                top: 0,
                height: '100%',
                background: isActive ? ses.color : `${ses.color}44`,
                borderRight: '1px solid rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 'var(--xs, 11px)',
                fontFamily: 'var(--font-mono)',
                fontWeight: isActive ? 700 : 400,
                color: isActive ? '#000' : 'var(--kt-text2)',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                transition: 'background 0.3s',
              }}>
                {width > 8 && ses.id.toUpperCase()}
              </div>
            )
          })}
          {/* Current time marker */}
          <div style={{
            position: 'absolute',
            left: `${(wibMin / 1440) * 100}%`,
            top: -2,
            width: 2,
            height: 44,
            background: 'var(--kt-gold)',
            boxShadow: '0 0 8px var(--kt-gold)',
            zIndex: 5,
          }} />
        </div>
        {/* Hour labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 'var(--xs, 11px)', fontFamily: 'var(--font-mono)', color: 'var(--kt-muted)' }}>
          {[0, 3, 6, 9, 12, 15, 18, 21].map((hr) => (
            <span key={hr}>{pad(hr)}</span>
          ))}
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
            <div key={ses.id} className="kt-panel" style={{
              padding: '1.2rem',
              border: isActive ? `1px solid ${ses.color}55` : undefined,
              boxShadow: isActive ? `0 0 20px ${ses.color}15` : undefined,
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '1.3rem' }}>{ses.icon}</span>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 'var(--sm, 13px)', color: 'var(--kt-text)', fontFamily: 'var(--font-mono)' }}>
                      {ses.name}
                    </p>
                    <p style={{ fontSize: 'var(--xs, 11px)', color: 'var(--kt-text2)', fontFamily: 'var(--font-mono)' }}>
                      {pad(ses.start)}:00 — {pad(ses.end)}:00 WIB
                    </p>
                  </div>
                </div>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 10px',
                  borderRadius: 999,
                  fontSize: 'var(--xs, 11px)',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  background: sesStatus === 'ACTIVE' ? 'rgba(74,222,128,0.15)' : sesStatus === 'UPCOMING' ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.05)',
                  color: sesStatus === 'ACTIVE' ? 'var(--kt-up)' : sesStatus === 'UPCOMING' ? '#fbbf24' : 'var(--kt-muted)',
                  border: `1px solid ${sesStatus === 'ACTIVE' ? 'rgba(74,222,128,0.3)' : sesStatus === 'UPCOMING' ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.06)'}`,
                }}>
                  {sesStatus === 'ACTIVE' && <span className="kt-status-dot" style={{ background: 'var(--kt-up)', width: 6, height: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />}
                  {sesStatus}
                </span>
              </div>

              {/* Character + Best badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{
                  fontSize: 'var(--xs, 11px)',
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: 'rgba(255,255,255,0.06)',
                  color: 'var(--kt-text2)',
                }}>
                  {ses.character}
                </span>
                {(ses as any).best && (
                  <span style={{
                    fontSize: 'var(--xs, 11px)',
                    fontFamily: 'var(--font-mono)',
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: 'rgba(74,222,128,0.12)',
                    color: 'var(--kt-up)',
                    border: '1px solid rgba(74,222,128,0.25)',
                    fontWeight: 700,
                  }}>
                    ★ BEST
                  </span>
                )}
              </div>

              {/* Progress bar (active only) */}
              {isActive && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--xs, 11px)', fontFamily: 'var(--font-mono)', color: 'var(--kt-text2)', marginBottom: 4 }}>
                    <span>{fmtHM(el)} elapsed</span>
                    <span>{fmtCountdown(Math.ceil(remaining / 1))} left</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{
                      width: `${pct}%`,
                      height: '100%',
                      borderRadius: 3,
                      background: ses.color,
                      boxShadow: `0 0 8px ${ses.color}66`,
                      transition: 'width 1s linear',
                    }} />
                  </div>
                </div>
              )}

              {/* Pairs */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ses.pairs.map((p) => (
                  <span key={p} style={{
                    fontSize: 'var(--xs, 11px)',
                    fontFamily: 'var(--font-mono)',
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: 'rgba(255,255,255,0.06)',
                    color: 'var(--kt-text)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Pulse animation keyframes ── */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
