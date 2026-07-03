import { useState, useEffect, useCallback } from 'react'

/* ── Kill Zone definitions (WIB = UTC+7) ── */
interface KillZone {
  label: string
  abbr: string
  openWIB: number   // hour in WIB
  closeWIB: number  // hour in WIB
  color: string
}

const KILL_ZONES: KillZone[] = [
  { label: 'Asia',    abbr: 'AS', openWIB: 7,  closeWIB: 11, color: '#ffbf00' },
  { label: 'London',  abbr: 'LD', openWIB: 13, closeWIB: 17, color: '#4d94ff' },
  { label: 'NY AM',   abbr: 'N1', openWIB: 19, closeWIB: 23, color: '#46c97f' },
  { label: 'NY PM',   abbr: 'N2', openWIB: 0,  closeWIB: 3,  color: '#ff4d4f' },
]

/* ── Helpers ── */

/** Convert WIB hour → UTC hour (mod 24) */
function wibToUTC(h: number): number {
  return (h - 7 + 24) % 24
}

/** Get current UTC time as Date */
function utcNow(): Date {
  return new Date()
}

/** Build a Date for "today" (or a reference date) at a given UTC hour */
function utcDateAt(ref: Date, utcHour: number, utcMin = 0): Date {
  const d = new Date(ref)
  d.setUTCHours(utcHour, utcMin, 0, 0)
  return d
}

interface ZoneState {
  zone: KillZone
  status: 'active' | 'next' | 'closed'
  countdownMs: number   // ms until open (if closed) or close (if active)
  countdownLabel: string // "opens in" / "closes in"
  barPercent: number     // 0-100 within the zone window
}

function computeZoneStates(now: Date): ZoneState[] {
  const results: ZoneState[] = []

  for (const zone of KILL_ZONES) {
    const openUTC = wibToUTC(zone.openWIB)
    const closeUTC = wibToUTC(zone.closeWIB)

    const openTime = utcDateAt(now, openUTC)
    const closeTime = utcDateAt(now, closeUTC)

    // Handle NY PM (crosses midnight) — close may be next day in UTC
    if (closeUTC <= openUTC) {
      closeTime.setUTCDate(closeTime.getUTCDate() + 1)
    }

    const ms = now.getTime()
    const windowMs = closeTime.getTime() - openTime.getTime()

    let status: 'active' | 'next' | 'closed'
    let countdownMs: number
    let countdownLabel: string
    let barPercent: number

    if (ms >= openTime.getTime() && ms < closeTime.getTime()) {
      // ── ACTIVE ──
      status = 'active'
      countdownMs = closeTime.getTime() - ms
      countdownLabel = 'closes in'
      barPercent = ((ms - openTime.getTime()) / windowMs) * 100
    } else if (ms < openTime.getTime()) {
      // ── NEXT (opens later today) ──
      status = 'next'
      countdownMs = openTime.getTime() - ms
      countdownLabel = 'opens in'
      barPercent = 0
    } else {
      // ── CLOSED (will open tomorrow) ──
      // Next open is the following day's open time
      const nextOpen = new Date(openTime)
      nextOpen.setUTCDate(nextOpen.getUTCDate() + 1)

      status = 'closed'
      countdownMs = nextOpen.getTime() - ms
      countdownLabel = 'opens in'
      barPercent = 0
    }

    results.push({ zone, status, countdownMs, countdownLabel, barPercent })
  }

  return results
}

/** Find which zone is the "next" upcoming one (first non-active that opens soonest) */
function findNextActive(states: ZoneState[]): string | null {
  const next = states.find((s) => s.status === 'next')
  if (next) return next.zone.label
  const firstClosed = states.find((s) => s.status === 'closed')
  return firstClosed ? firstClosed.zone.label : null
}

/** Format ms → MM:SS */
function fmtCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Format UTC hour → HH:MM WIB string */
function fmtTimeWIB(wibHour: number): string {
  const h = String(wibHour).padStart(2, '0')
  return `${h}:00`
}

/* ── Component ── */

export default function KillZoneTimer() {
  const [states, setStates] = useState<ZoneState[]>(() => computeZoneStates(utcNow()))
  const nextUp = findNextActive(states)

  const tick = useCallback(() => {
    setStates(computeZoneStates(utcNow()))
  }, [])

  useEffect(() => {
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [tick])

  return (
    <div className="kz-root">
      <style>{STYLES}</style>

      {/* Header */}
      <div className="kz-header">
        <span className="kz-title">KILL ZONES</span>
        <span className="kz-wib">WIB (UTC+7)</span>
      </div>

      {/* Zone rows */}
      <div className="kz-zones">
        {states.map(({ zone, status, countdownMs, countdownLabel, barPercent }) => {
          const isActive = status === 'active'
          const isNext = status === 'next' || (status === 'closed' && nextUp === zone.label)
          const dimmed = status === 'closed' && !isNext

          return (
            <div
              key={zone.label}
              className={`kz-row ${isActive ? 'kz-row--active' : ''} ${dimmed ? 'kz-row--dim' : ''}`}
            >
              {/* Zone indicator */}
              <div className="kz-zone-label">
                <span
                  className="kz-dot"
                  style={{
                    background: isActive ? zone.color : dimmed ? 'var(--kt-dim)' : 'var(--kt-muted)',
                    boxShadow: isActive ? `0 0 8px ${zone.color}88` : 'none',
                  }}
                />
                <span className="kz-zone-abbr">{zone.abbr}</span>
                <span className="kz-zone-name">{zone.label}</span>
              </div>

              {/* Time window */}
              <div className="kz-times">
                <span className="kz-time">{fmtTimeWIB(zone.openWIB)}</span>
                <span className="kz-time-sep">—</span>
                <span className="kz-time">{fmtTimeWIB(zone.closeWIB)}</span>
              </div>

              {/* Countdown */}
              <div className="kz-countdown">
                {isActive ? (
                  <span className="kz-cd-label kz-cd-label--active">LIVE</span>
                ) : isNext ? (
                  <span className="kz-cd-label kz-cd-label--next">{countdownLabel}</span>
                ) : (
                  <span className="kz-cd-label kz-cd-label--closed">{countdownLabel}</span>
                )}
                <span className="kz-cd-value" style={{ color: isActive ? zone.color : dimmed ? 'var(--kt-dim)' : 'var(--kt-text)' }}>
                  {fmtCountdown(countdownMs)}
                </span>
              </div>

              {/* Progress bar */}
              <div className="kz-bar-track">
                <div
                  className="kz-bar-fill"
                  style={{
                    width: `${barPercent}%`,
                    background: isActive ? zone.color : 'transparent',
                    transition: 'width 1s linear',
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Scoped Styles ── */

const STYLES = /* css */ `
  .kz-root {
    width: 100%;
    font-family: var(--font-mono);
    color: var(--kt-text);
    background: var(--kt-bg2);
    border: 1px solid var(--kt-border-soft);
    border-radius: 12px;
    overflow: hidden;
  }

  .kz-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid var(--kt-border-soft);
    background: linear-gradient(180deg, var(--kt-bg2), var(--kt-bg));
  }

  .kz-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 2px;
    color: var(--kt-gold);
    text-transform: uppercase;
  }

  .kz-wib {
    font-size: 9px;
    letter-spacing: 1.5px;
    color: var(--kt-dim);
    text-transform: uppercase;
  }

  .kz-zones {
    padding: 0;
  }

  .kz-row {
    display: grid;
    grid-template-columns: 90px 80px 100px 1fr;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    border-bottom: 1px solid var(--kt-border-soft);
    transition: background 0.2s, opacity 0.2s;
  }

  .kz-row:last-child {
    border-bottom: none;
  }

  .kz-row--active {
    background: rgba(255, 191, 0, 0.04);
  }

  .kz-row--dim {
    opacity: 0.35;
  }

  .kz-zone-label {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .kz-dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    flex-shrink: 0;
    transition: background 0.3s, box-shadow 0.3s;
  }

  .kz-zone-abbr {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: var(--kt-text);
  }

  .kz-zone-name {
    font-size: 10px;
    letter-spacing: 1px;
    color: var(--kt-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .kz-times {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    color: var(--kt-text2);
  }

  .kz-time-sep {
    color: var(--kt-dim);
    font-size: 9px;
  }

  .kz-countdown {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    text-align: right;
  }

  .kz-cd-label {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .kz-cd-label--active {
    color: var(--kt-up);
    animation: kz-pulse 2s ease-in-out infinite;
  }

  .kz-cd-label--next {
    color: var(--kt-gold);
  }

  .kz-cd-label--closed {
    color: var(--kt-dim);
  }

  .kz-cd-value {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    min-width: 42px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .kz-bar-track {
    height: 2px;
    background: var(--kt-bg3);
    border-radius: 999px;
    overflow: hidden;
    position: relative;
  }

  .kz-bar-fill {
    height: 100%;
    border-radius: 999px;
  }

  @keyframes kz-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`
