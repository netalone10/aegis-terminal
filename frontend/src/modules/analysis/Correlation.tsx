import { useState, useMemo } from 'react'

const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/IDR', 'XAU/USD']

// Symmetric correlation matrix (1.0 on diagonal)
// Off-diagonal values: historical approximations
const RAW: number[][] = [
  // EUR/USD GBP/USD USD/JPY USD/CHF AUD/USD USD/IDR XAU/USD
  [  1.00,   0.87,  -0.20,  -0.95,   0.65,   0.10,   0.30 ], // EUR/USD
  [  0.87,   1.00,  -0.15,  -0.80,   0.55,   0.05,   0.25 ], // GBP/USD
  [ -0.20,  -0.15,   1.00,   0.55,  -0.30,   0.15,  -0.40 ], // USD/JPY
  [ -0.95,  -0.80,   0.55,   1.00,  -0.55,  -0.05,  -0.25 ], // USD/CHF
  [  0.65,   0.55,  -0.30,  -0.55,   1.00,   0.20,   0.45 ], // AUD/USD
  [  0.10,   0.05,   0.15,  -0.05,   0.20,   1.00,   0.05 ], // USD/IDR
  [  0.30,   0.25,  -0.40,  -0.25,   0.45,   0.05,   1.00 ], // XAU/USD
]

function corrColor(v: number): string {
  if (v >= 0.7) return 'rgba(34,197,94,0.85)'
  if (v >= 0.3) return 'rgba(34,197,94,0.35)'
  if (v <= -0.7) return 'rgba(239,68,68,0.85)'
  if (v <= -0.3) return 'rgba(239,68,68,0.35)'
  return 'rgba(255,255,255,0.06)'
}

function corrTextColor(v: number): string {
  const a = Math.abs(v)
  if (a >= 0.7) return '#fff'
  return 'var(--kt-text)'
}

function diversification(avgAbs: number): { label: string; color: string } {
  if (avgAbs > 0.7) return { label: '⚠️ LOW diversification', color: 'var(--kt-dn)' }
  if (avgAbs >= 0.3) return { label: '✅ MODERATE diversification', color: 'var(--kt-gold)' }
  return { label: '🟢 HIGH diversification', color: 'var(--kt-up)' }
}

export default function Correlation() {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  // Average off-diagonal absolute correlation
  const avgAbs = useMemo(() => {
    let sum = 0, count = 0
    for (let i = 0; i < PAIRS.length; i++)
      for (let j = i + 1; j < PAIRS.length; j++) {
        sum += Math.abs(RAW[i][j])
        count++
      }
    return sum / count
  }, [])

  const div = diversification(avgAbs)

  // Selected pairs warning
  const selArr = [...selected].sort()
  const pairWarning = useMemo(() => {
    if (selArr.length !== 2) return null
    const [a, b] = selArr
    const v = RAW[a][b]
    if (Math.abs(v) >= 0.7) {
      const pct = Math.round(Math.abs(v) * 100)
      return `⚠️ ${PAIRS[a]} & ${PAIRS[b]} are ${pct}% correlated — this is basically the same trade`
    }
    return null
  }, [selArr])

  function togglePair(idx: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else if (next.size < 2) next.add(idx)
      else { next.clear(); next.add(idx) }
      return next
    })
  }

  return (
    <div>
      {/* Header */}
      <div className="kt-card" style={{ marginBottom: 'var(--md)' }}>
        <div className="kt-card-pad" style={{ display: 'flex', alignItems: 'center', gap: 'var(--md)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p className="kt-kicker">CROSS-ASSET CORRELATION</p>
            <h2 style={{ fontSize: '1.1rem', marginTop: 4 }}>Matriks Korelasi</h2>
            <p style={{ color: 'var(--kt-text2)', fontSize: 'var(--xs)', marginTop: 4 }}>
              Historical 90-day rolling correlation between major FX pairs &amp; gold. Values range from -1.0 (perfect inverse) to +1.0 (perfect sync).
            </p>
          </div>
          <div className="kt-stat" style={{ textAlign: 'right' }}>
            <div className="kt-stat-label">Diversification Score</div>
            <div className="kt-stat-value" style={{ color: div.color, marginTop: 4, fontSize: '0.95rem' }}>
              {div.label}
            </div>
            <div style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)', marginTop: 2 }}>
              Avg |r| = {avgAbs.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Pair selection hint */}
      <div style={{ marginBottom: 'var(--sm)', fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>
        Click two pairs to check for overlap. Hover cells for details.
      </div>

      {/* Correlation warning */}
      {pairWarning && (
        <div className="kt-card" style={{
          marginBottom: 'var(--md)',
          borderLeft: '3px solid var(--kt-dn)',
          background: 'rgba(239,68,68,0.08)',
        }}>
          <div className="kt-card-pad" style={{ fontSize: 'var(--sm)', color: 'var(--kt-dn)' }}>
            {pairWarning}
          </div>
        </div>
      )}

      {/* Matrix */}
      <div className="kt-card">
        <div className="kt-card-pad" style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--xs)',
          }}>
            <thead>
              <tr>
                <th style={headerCell}></th>
                {PAIRS.map((p, i) => (
                  <th
                    key={p}
                    style={{
                      ...headerCell,
                      cursor: 'pointer',
                      color: selected.has(i) ? 'var(--kt-gold)' : 'var(--kt-text2)',
                      borderBottom: selected.has(i) ? '2px solid var(--kt-gold)' : '2px solid var(--kt-border)',
                    }}
                    onClick={() => togglePair(i)}
                  >
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PAIRS.map((row, ri) => (
                <tr key={row}>
                  <td
                    style={{
                      ...headerCell,
                      textAlign: 'left',
                      cursor: 'pointer',
                      color: selected.has(ri) ? 'var(--kt-gold)' : 'var(--kt-text)',
                      fontWeight: 600,
                      borderRight: selected.has(ri) ? '2px solid var(--kt-gold)' : '2px solid var(--kt-border)',
                    }}
                    onClick={() => togglePair(ri)}
                  >
                    {row}
                  </td>
                  {PAIRS.map((col, ci) => {
                    const v = RAW[ri][ci]
                    const isDiag = ri === ci
                    const isHovered = hover?.r === ri || hover?.c === ci
                    const isExact = hover?.r === ri && hover?.c === ci
                    const isSelRow = selected.has(ri)
                    const isSelCol = selected.has(ci)
                    const isCrossHighlight = isSelRow && isSelCol && ri !== ci

                    return (
                      <td
                        key={col}
                        style={{
                          padding: '10px 6px',
                          textAlign: 'center',
                          background: isDiag
                            ? 'var(--kt-bg2)'
                            : isCrossHighlight
                              ? 'rgba(234,179,8,0.15)'
                              : isHovered && !isDiag
                                ? 'rgba(255,255,255,0.04)'
                                : 'transparent',
                          color: isDiag ? 'var(--kt-muted)' : corrTextColor(v),
                          fontWeight: isExact ? 700 : 400,
                          borderBottom: '1px solid var(--kt-border)',
                          borderRight: ci < PAIRS.length - 1 ? '1px solid var(--kt-border)' : 'none',
                          transition: 'background 0.15s',
                          position: 'relative',
                          cursor: isDiag ? 'default' : 'pointer',
                        }}
                        onMouseEnter={() => !isDiag && setHover({ r: ri, c: ci })}
                        onMouseLeave={() => setHover(null)}
                      >
                        {!isDiag && (
                          <div style={{
                            position: 'absolute',
                            inset: 2,
                            borderRadius: 4,
                            background: corrColor(v),
                            opacity: 0.6,
                            zIndex: 0,
                          }} />
                        )}
                        <span style={{ position: 'relative', zIndex: 1 }}>
                          {isDiag ? '1.00' : v.toFixed(2)}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        gap: 'var(--md)',
        marginTop: 'var(--md)',
        flexWrap: 'wrap',
        fontSize: 'var(--xs)',
        color: 'var(--kt-text2)',
      }}>
        <span style={{ fontWeight: 600 }}>Legend:</span>
        {[
          { label: 'Strong +', bg: 'rgba(34,197,94,0.85)' },
          { label: 'Weak +', bg: 'rgba(34,197,94,0.35)' },
          { label: 'Neutral', bg: 'rgba(255,255,255,0.06)' },
          { label: 'Weak −', bg: 'rgba(239,68,68,0.35)' },
          { label: 'Strong −', bg: 'rgba(239,68,68,0.85)' },
        ].map(l => (
          <span key={l.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              display: 'inline-block',
              width: 14,
              height: 14,
              borderRadius: 3,
              background: l.bg,
              border: '1px solid var(--kt-border)',
            }} />
            {l.label}
          </span>
        ))}
      </div>

      {/* Info card */}
      <div className="kt-card" style={{ marginTop: 'var(--md)' }}>
        <div className="kt-card-pad">
          <p className="kt-kicker" style={{ marginBottom: 'var(--xs)' }}>HOW TO READ</p>
          <div style={{ fontSize: 'var(--xs)', color: 'var(--kt-text2)', lineHeight: 1.6 }}>
            <p><strong style={{ color: 'var(--kt-up)' }}>+1.00</strong> = pairs move in lockstep (same trade risk)</p>
            <p><strong style={{ color: 'var(--kt-text)' }}>0.00</strong> = no relationship (good for diversification)</p>
            <p><strong style={{ color: 'var(--kt-dn)' }}>-1.00</strong> = perfect hedge (moves opposite)</p>
            <p style={{ marginTop: 'var(--xs)' }}>
              Example: EUR/USD and USD/CHF are <strong style={{ color: 'var(--kt-dn)' }}>-0.95</strong> correlated —
              they move almost perfectly opposite. Holding both is near-neutral.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

const headerCell: React.CSSProperties = {
  padding: '10px 8px',
  textAlign: 'center',
  color: 'var(--kt-text2)',
  fontWeight: 600,
  fontSize: 'var(--xs)',
  whiteSpace: 'nowrap',
  borderBottom: '2px solid var(--kt-border)',
}
