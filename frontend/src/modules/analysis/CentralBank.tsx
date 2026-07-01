import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Landmark, TrendingUp, Calendar, Globe } from 'lucide-react'

interface MacroData {
  dgs10: number | null
  dgs2: number | null
  dtb3: number | null
  dtb6: number | null
  yieldCurve: number | null
  regime: string | null
}

interface CalendarEvent {
  title: string
  date: string
  time: string
  impact: number
  currency: string
  forecast: string
  previous: string
  actual: string
}

const CB_LIST = [
  { name: 'FOMC (Fed)', flag: '\u{1F1FA}\u{1F1F8}', rate: 4.50, pairs: 'EUR/USD, DXY, XAU/USD', currency: 'USD', keywords: ['FOMC', 'Fed', 'Federal Reserve'] },
  { name: 'BOJ', flag: '\u{1F1EF}\u{1F1F5}', rate: 0.50, pairs: 'USD/JPY', currency: 'JPY', keywords: ['BOJ', 'Bank of Japan'] },
  { name: 'BOE', flag: '\u{1F1EC}\u{1F1E7}', rate: 4.50, pairs: 'GBP/USD', currency: 'GBP', keywords: ['BOE', 'Bank of England', 'Official Bank Rate'] },
  { name: 'RBA', flag: '\u{1F1E6}\u{1F1FA}', rate: 3.85, pairs: 'AUD/USD', currency: 'AUD', keywords: ['RBA', 'Reserve Bank of Australia'] },
  { name: 'ECB', flag: '\u{1F1EA}\u{1F1FA}', rate: 2.65, pairs: 'EUR/USD, EUR/GBP', currency: 'EUR', keywords: ['ECB', 'European Central Bank'] },
  { name: 'SNB', flag: '\u{1F1E8}\u{1F1ED}', rate: 0.25, pairs: 'USD/CHF', currency: 'CHF', keywords: ['SNB', 'Swiss National Bank'] },
  { name: 'BI (Indonesia)', flag: '\u{1F1EE}\u{1F1E9}', rate: 5.75, pairs: 'USD/IDR', currency: 'IDR', keywords: ['BI', 'Bank Indonesia', 'BI Rate'] },
]

function findNextMeeting(events: CalendarEvent[], keywords: string[]): string | null {
  const today = new Date().toISOString().split('T')[0]
  const match = events.find(e =>
    keywords.some(k => e.title.toLowerCase().includes(k.toLowerCase())) && e.date >= today
  )
  return match ? match.date : null
}

function inferDecision(events: CalendarEvent[], keywords: string[]): string {
  const past = events.filter(e =>
    keywords.some(k => e.title.toLowerCase().includes(k.toLowerCase())) && e.actual
  )
  if (past.length === 0) return 'N/A'
  const last = past[past.length - 1]
  if (!last.forecast || !last.actual) return 'HOLD'
  const f = parseFloat(last.forecast)
  const a = parseFloat(last.actual)
  if (isNaN(f) || isNaN(a)) return 'HOLD'
  if (a > f) return 'HIKE'
  if (a < f) return 'CUT'
  return 'HOLD'
}

function decisionColor(d: string) {
  if (d === 'HIKE') return 'var(--kt-dn)'
  if (d === 'CUT') return 'var(--kt-up)'
  return 'var(--kt-muted)'
}

export default function CentralBank() {
  const { data: macro, isLoading: loadingMacro } = useQuery<MacroData>({
    queryKey: ['macro'],
    queryFn: () => api<MacroData>('/api/macro'),
    staleTime: 300_000,
  })

  const { data: calendar, isLoading: loadingCal } = useQuery<CalendarEvent[]>({
    queryKey: ['calendar'],
    queryFn: () => api<CalendarEvent[]>('/api/calendar'),
    staleTime: 300_000,
  })

  const isLoading = loadingMacro || loadingCal
  const events = calendar ?? []

  const yieldCurve = macro?.yieldCurve ?? null
  const regime = macro?.regime ?? null
  const curveColor = yieldCurve !== null && yieldCurve < 0 ? 'var(--kt-dn)' : 'var(--kt-up)'

  const maxRate = Math.max(...CB_LIST.map(cb => cb.rate))
  const sortedCB = [...CB_LIST].sort((a, b) => b.rate - a.rate)

  const impactMap = CB_LIST.map(cb => ({
    name: cb.name,
    flag: cb.flag,
    pairs: cb.pairs.split(', '),
  }))

  return (
    <div>
      <div className="kt-route-head">
        <div>
          <div className="kt-kicker">Monetary Policy</div>
          <h1>Central Bank Watch</h1>
          <p>Monitor keputusan bank sentral global dan implikasinya ke pasar</p>
        </div>
        <div className="kt-route-actions">
          <span className="kt-status-dot" />
          <span>Auto-refresh 5min</span>
        </div>
      </div>

      {isLoading ? (
        <>
          <div className="kt-panel" style={{ marginBottom: 16 }}>
            <div className="kt-panel-body">
              <div className="skeleton w-40 h-8 mb-3" />
              <div className="skeleton w-64 h-4" />
            </div>
          </div>
          <div className="kt-grid-3" style={{ marginBottom: 16 }}>
            {[...Array(7)].map((_, i) => (
              <div key={i} className="kt-card kt-card-pad">
                <div className="skeleton w-16 h-3 mb-3" />
                <div className="skeleton w-20 h-7 mb-2" />
                <div className="skeleton w-24 h-4" />
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Section 1: Upcoming Meetings */}
          <div className="kt-section" style={{ marginBottom: 16 }}>
            <div className="kt-section-head">
              <div>
                <h2>Upcoming Meetings</h2>
                <p>Jadwal dan status kebijakan masing-masing bank sentral</p>
              </div>
              <Landmark size={16} style={{ color: 'var(--kt-gold)' }} />
            </div>
            <div className="kt-grid-3">
              {CB_LIST.map(cb => {
                const nextDate = findNextMeeting(events, cb.keywords)
                const decision = inferDecision(events, cb.keywords)
                return (
                  <div key={cb.name} className="kt-card kt-card-pad">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 20 }}>{cb.flag}</span>
                      <span style={{ fontWeight: 600, color: 'var(--kt-text)', fontSize: 'var(--md)' }}>{cb.name}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span className="kt-stat-label" style={{ margin: 0 }}>Rate</span>
                      <span className="mono kt-stat-value">{cb.rate.toFixed(2)}%</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span className="kt-stat-label" style={{ margin: 0 }}>Last Decision</span>
                      <span className="mono" style={{ color: decisionColor(decision), fontWeight: 600 }}>{decision}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span className="kt-stat-label" style={{ margin: 0 }}>Next Meeting</span>
                      <span className="mono" style={{ color: 'var(--kt-text2)' }}>{nextDate ?? 'TBD'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="kt-stat-label" style={{ margin: 0 }}>Pairs</span>
                      <span className="mono" style={{ color: 'var(--kt-text2)', fontSize: 11, textAlign: 'right' }}>{cb.pairs}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Section 2: Yield Curve */}
          <div className="kt-section" style={{ marginBottom: 16 }}>
            <div className="kt-section-head">
              <div>
                <h2>US Yield Curve</h2>
                <p>Treasury yields dan spread 10Y-2Y</p>
              </div>
              <TrendingUp size={16} style={{ color: 'var(--kt-muted)' }} />
            </div>
            <div className="kt-stat-grid kt-stat-grid-4">
              <div className="kt-stat">
                <div className="kt-stat-label">3M</div>
                <div className="kt-stat-value mono">{macro?.dtb3 != null ? `${macro.dtb3}%` : 'N/A'}</div>
              </div>
              <div className="kt-stat">
                <div className="kt-stat-label">2Y</div>
                <div className="kt-stat-value mono">{macro?.dgs2 != null ? `${macro.dgs2}%` : 'N/A'}</div>
              </div>
              <div className="kt-stat">
                <div className="kt-stat-label">10Y</div>
                <div className="kt-stat-value mono">{macro?.dgs10 != null ? `${macro.dgs10}%` : 'N/A'}</div>
              </div>
              <div className="kt-stat">
                <div className="kt-stat-label">Spread (10Y-2Y)</div>
                <div className="kt-stat-value mono" style={{ color: curveColor }}>
                  {yieldCurve !== null ? `${yieldCurve > 0 ? '+' : ''}${yieldCurve} bps` : 'N/A'}
                </div>
                {regime && (
                  <div style={{ marginTop: 4 }}>
                    <span className="kt-tag" style={{
                      background: curveColor === 'var(--kt-up)' ? 'rgba(70,201,127,.12)' : 'rgba(255,80,80,.12)',
                      color: curveColor,
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 6,
                      fontWeight: 600,
                    }}>
                      {regime.charAt(0).toUpperCase() + regime.slice(1)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 3: Rate Comparison */}
          <div className="kt-section" style={{ marginBottom: 16 }}>
            <div className="kt-section-head">
              <div>
                <h2>Rate Comparison</h2>
                <p>Perbandingan suku bunga bank sentral global</p>
              </div>
              <Globe size={16} style={{ color: 'var(--kt-muted)' }} />
            </div>
            <div className="kt-card kt-card-pad">
              {sortedCB.map(cb => (
                <div key={cb.name} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <span style={{ fontSize: 16 }}>{cb.flag}</span>
                  <span className="mono" style={{ color: 'var(--kt-text)', width: 110, fontSize: 13, flexShrink: 0 }}>{cb.name}</span>
                  <div style={{ flex: 1, background: 'var(--kt-bg2)', borderRadius: 6, height: 18, overflow: 'hidden' }}>
                    <div style={{
                      width: `${(cb.rate / maxRate) * 100}%`,
                      height: '100%',
                      background: 'var(--kt-gold)',
                      borderRadius: 6,
                      transition: 'width .4s ease',
                    }} />
                  </div>
                  <span className="mono" style={{ color: 'var(--kt-gold)', fontWeight: 600, width: 50, textAlign: 'right', fontSize: 13 }}>{cb.rate.toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Impact Map */}
          <div className="kt-section">
            <div className="kt-section-head">
              <div>
                <h2>Impact Map</h2>
                <p>Pasangan mata uang yang dipengaruhi oleh masing-masing bank sentral</p>
              </div>
              <Calendar size={16} style={{ color: 'var(--kt-muted)' }} />
            </div>
            <div className="kt-card">
              <table className="kt-table">
                <thead>
                  <tr>
                    <th>Central Bank</th>
                    <th>Affected Pairs</th>
                  </tr>
                </thead>
                <tbody>
                  {impactMap.map(cb => (
                    <tr key={cb.name}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 16 }}>{cb.flag}</span>
                          <span className="mono" style={{ color: 'var(--kt-text)', fontWeight: 600 }}>{cb.name}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {cb.pairs.map(p => (
                            <span key={p} className="kt-tag" style={{
                              background: 'rgba(255,191,0,.08)',
                              color: 'var(--kt-gold)',
                              fontSize: 12,
                              padding: '2px 8px',
                              borderRadius: 6,
                              fontWeight: 500,
                            }}>{p}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
