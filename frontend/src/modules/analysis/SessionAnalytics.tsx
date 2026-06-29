import { useMemo } from 'react'

/* ── mock data ──────────────────────────────────────────────────── */

interface Session {
  name: string
  time: string
  winRate: number
  avgRR: string
  bestPair: string
  character: string
  totalTrades: number
  profitFactor: number
}

const sessions: Session[] = [
  { name: 'Asian', time: '07:00–11:00 WIB', winRate: 45, avgRR: '1:1.2', bestPair: 'USD/JPY', character: 'Range / Accumulation', totalTrades: 84, profitFactor: 1.1 },
  { name: 'London', time: '13:00–17:00 WIB', winRate: 62, avgRR: '1:1.8', bestPair: 'EUR/USD', character: 'Manipulation / Breakout', totalTrades: 112, profitFactor: 1.9 },
  { name: 'NY Overlap', time: '20:00–23:00 WIB', winRate: 68, avgRR: '1:2.1', bestPair: 'GBP/USD', character: 'Trending / Distribution', totalTrades: 96, profitFactor: 2.4 },
  { name: 'NY Close', time: '00:00–03:00 WIB', winRate: 52, avgRR: '1:1.5', bestPair: 'XAU/USD', character: 'Reversal / Profit-taking', totalTrades: 68, profitFactor: 1.4 },
]

// heatmap[day][session] → profit factor (higher = greener)
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const heatmap: number[][] = [
  [0.9, 1.7, 2.0, 1.2],   // Mon
  [1.1, 1.5, 2.3, 1.4],   // Tue
  [1.3, 2.1, 2.8, 1.6],   // Wed  ← best day
  [0.8, 1.8, 2.2, 1.1],   // Thu
  [0.6, 1.2, 1.5, 0.7],   // Fri  ← weak
]

const recommendations = [
  { tag: 'BEST', color: 'var(--kt-up)', text: 'Your best session: London-NY Overlap (68% win rate)' },
  { tag: 'AVOID', color: 'var(--kt-dn)', text: 'Avoid: Asian session for EUR/USD (38% win rate)' },
  { tag: 'TIP', color: 'var(--kt-gold)', text: 'Best day: Wednesday (all sessions perform well)' },
]

/* ── helpers ────────────────────────────────────────────────────── */

function heatColor(pf: number): string {
  if (pf >= 2.0) return 'rgba(34,197,94,.45)'
  if (pf >= 1.5) return 'rgba(34,197,94,.25)'
  if (pf >= 1.0) return 'rgba(250,204,21,.15)'
  return 'rgba(239,68,68,.3)'
}

function currentSession(): Session {
  const h = new Date().getUTCHours() + 7 // WIB
  const wib = h >= 24 ? h - 24 : h
  if (wib >= 7 && wib < 11) return sessions[0]
  if (wib >= 13 && wib < 17) return sessions[1]
  if (wib >= 20 && wib < 23) return sessions[2]
  if (wib >= 0 && wib < 3) return sessions[3]
  return sessions[1] // fallback
}

const bestOf = (key: keyof Session) =>
  sessions.reduce((a, b) => ((a[key] as number) > (b[key] as number) ? a : b))

/* ── component ──────────────────────────────────────────────────── */

export default function SessionAnalytics() {
  const cur = useMemo(currentSession, [])
  const bestWR = bestOf('winRate').name
  const bestPF = bestOf('profitFactor').name

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--md)' }}>
      {/* ── current session indicator ──────────────────────────── */}
      <div className="kt-panel" style={{ padding: 'var(--md)', display: 'flex', alignItems: 'center', gap: 'var(--md)', flexWrap: 'wrap' }}>
        <span className="kt-status-dot" style={{ background: 'var(--kt-up)', width: 10, height: 10 }} />
        <div>
          <p className="kt-kicker" style={{ marginBottom: 2 }}>ACTIVE SESSION</p>
          <h2 style={{ fontSize: '1.15rem', margin: 0 }}>{cur.name} <span style={{ color: 'var(--kt-text2)', fontSize: '.8rem', fontFamily: 'var(--font-mono)' }}>{cur.time}</span></h2>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--md)', flexWrap: 'wrap' }}>
          <Stat label="Win Rate" value={`${cur.winRate}%`} positive={cur.winRate >= 55} />
          <Stat label="Avg R:R" value={cur.avgRR} />
          <Stat label="Best Pair" value={cur.bestPair} />
          <Stat label="Profit Factor" value={String(cur.profitFactor)} positive={cur.profitFactor >= 1.5} />
        </div>
      </div>

      {/* ── session overview cards ─────────────────────────────── */}
      <div className="kt-grid-4">
        {sessions.map(s => (
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

      {/* ── comparison table ───────────────────────────────────── */}
      <div className="kt-panel kt-card-pad" style={{ overflowX: 'auto' }}>
        <p className="kt-kicker" style={{ marginBottom: 'var(--sm)' }}>SESSION COMPARISON</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem', fontFamily: 'var(--font-mono)' }}>
          <thead>
            <tr style={{ color: 'var(--kt-muted)', textAlign: 'left' }}>
              <th style={th}>Session</th>
              <th style={th}>Win Rate</th>
              <th style={th}>Avg R:R</th>
              <th style={th}>Trades</th>
              <th style={th}>Best Pair</th>
              <th style={th}>Profit Factor</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map(s => (
              <tr key={s.name} style={{ borderTop: '1px solid var(--kt-border)' }}>
                <td style={td}>{s.name}</td>
                <td style={td}><Badge val={`${s.winRate}%`} best={s.name === bestWR} /></td>
                <td style={td}>{s.avgRR}</td>
                <td style={td}>{s.totalTrades}</td>
                <td style={td}>{s.bestPair}</td>
                <td style={td}><Badge val={String(s.profitFactor)} best={s.name === bestPF} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── heatmap ────────────────────────────────────────────── */}
      <div className="kt-panel kt-card-pad">
        <p className="kt-kicker" style={{ marginBottom: 'var(--sm)' }}>PERFORMANCE HEATMAP</p>
        <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(4, 1fr)', gap: 4 }}>
          {/* header */}
          <div />
          {sessions.map(s => (
            <div key={s.name} style={{ textAlign: 'center', fontSize: '.7rem', color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>{s.name}</div>
          ))}
          {/* rows */}
          {days.map((day, di) => (
            <>
              <div key={`d${di}`} style={{ fontSize: '.75rem', color: 'var(--kt-text2)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center' }}>{day}</div>
              {heatmap[di].map((pf, si) => (
                <div
                  key={`${di}-${si}`}
                  style={{
                    background: heatColor(pf),
                    borderRadius: 4,
                    padding: 'var(--xs) 0',
                    textAlign: 'center',
                    fontSize: '.75rem',
                    fontFamily: 'var(--font-mono)',
                    color: pf >= 1.0 ? 'var(--kt-up)' : 'var(--kt-dn)',
                    border: '1px solid var(--kt-border)',
                  }}
                >
                  {pf.toFixed(1)}×
                </div>
              ))}
            </>
          ))}
        </div>
      </div>

      {/* ── recommendations ────────────────────────────────────── */}
      <div className="kt-panel kt-card-pad">
        <p className="kt-kicker" style={{ marginBottom: 'var(--sm)' }}>RECOMMENDATIONS</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--xs)' }}>
          {recommendations.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sm)', fontSize: '.82rem' }}>
              <span style={{ background: r.color, color: '#000', fontWeight: 700, fontSize: '.65rem', padding: '2px 8px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>{r.tag}</span>
              <span>{r.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── tiny sub-components ────────────────────────────────────────── */

function Stat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div>
      <p style={{ fontSize: '.65rem', color: 'var(--kt-muted)', margin: 0, fontFamily: 'var(--font-mono)' }}>{label}</p>
      <p style={{ fontSize: '.9rem', margin: 0, color: positive === true ? 'var(--kt-up)' : positive === false ? 'var(--kt-dn)' : 'var(--kt-text)', fontWeight: 600 }}>{value}</p>
    </div>
  )
}

function Badge({ val, best }: { val: string; best: boolean }) {
  return best ? (
    <span style={{ background: 'var(--kt-up)', color: '#000', fontWeight: 700, padding: '1px 6px', borderRadius: 3, fontSize: '.75rem' }}>{val}</span>
  ) : <span>{val}</span>
}

const th: React.CSSProperties = { padding: '6px 8px', fontSize: '.7rem', fontFamily: 'var(--font-mono)' }
const td: React.CSSProperties = { padding: '8px 8px' }
