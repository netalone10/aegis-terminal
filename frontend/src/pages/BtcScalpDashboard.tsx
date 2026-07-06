import { useState, useEffect } from 'react'
import { api } from '../lib/api'

/* ── Helpers ── */
function fmt(p: any, decimals = 2): string {
  if (!p) return '—'
  const n = typeof p === 'string' ? parseFloat(p) : p
  return isNaN(n) ? '—' : n.toFixed(decimals)
}

function fmtPnl(pnl: any): string {
  if (pnl === null || pnl === undefined) return '—'
  const n = typeof pnl === 'string' ? parseFloat(pnl) : pnl
  return isNaN(n) ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

function pnlColor(pnl: any): string {
  if (pnl === null || pnl === undefined) return 'var(--kt-muted)'
  const n = typeof pnl === 'string' ? parseFloat(pnl) : pnl
  return n >= 0 ? 'var(--kt-up)' : 'var(--kt-dn)'
}

function stateBadge(state: string): { bg: string; fg: string; label: string } {
  switch (state) {
    case 'new': return { bg: 'rgba(59,130,246,.15)', fg: '#3b82f6', label: 'NEW' }
    case 'entry_pending': return { bg: 'rgba(245,158,11,.15)', fg: '#f59e0b', label: 'AWAITING ENTRY' }
    case 'entry_hit': return { bg: 'rgba(16,185,129,.15)', fg: '#10b981', label: 'ENTRY HIT' }
    case 'closed': return { bg: 'rgba(107,114,128,.15)', fg: '#6b7280', label: 'CLOSED' }
    default: return { bg: 'rgba(107,114,128,.15)', fg: '#6b7280', label: state }
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ${min % 60}m ago`
  return `${Math.floor(hr / 24)}d ago`
}

/* ── Price Bar ── */
function PriceBar({ entry, sl, tp, current, bias }: {
  entry: number; sl: number; tp: number; current: number; bias: string
}) {
  if (!entry || !sl || !tp || !current) return null
  const min = Math.min(sl, tp, current) * 0.999
  const max = Math.max(sl, tp, current) * 1.001
  const range = max - min || 1
  const pct = (v: number) => ((v - min) / range) * 100

  return (
    <div style={{ position: 'relative', height: 48, margin: '8px 0' }}>
      {/* Range bar */}
      <div style={{
        position: 'absolute', top: 20, left: 0, right: 0, height: 8,
        background: 'var(--kt-border)', borderRadius: 4,
      }} />
      {/* SL marker */}
      <div style={{
        position: 'absolute', left: `${pct(sl)}%`, top: 4,
        width: 2, height: 40, background: 'var(--kt-dn)', borderRadius: 1,
        transform: 'translateX(-1px)',
      }} />
      <div style={{
        position: 'absolute', left: `${pct(sl)}%`, bottom: 0,
        fontSize: 9, color: 'var(--kt-dn)', transform: 'translateX(-50%)', whiteSpace: 'nowrap',
      }}>SL {fmt(sl)}</div>
      {/* Entry marker */}
      <div style={{
        position: 'absolute', left: `${pct(entry)}%`, top: 12,
        width: 12, height: 12, borderRadius: '50%',
        background: bias === 'bullish' ? 'var(--kt-up)' : 'var(--kt-dn)',
        border: '2px solid var(--kt-bg)', transform: 'translateX(-6px)',
        boxShadow: '0 0 6px rgba(0,0,0,.3)',
      }} />
      <div style={{
        position: 'absolute', left: `${pct(entry)}%`, bottom: 0,
        fontSize: 9, color: 'var(--kt-gold)', fontWeight: 600,
        transform: 'translateX(-50%)', whiteSpace: 'nowrap',
      }}>ENTRY {fmt(entry)}</div>
      {/* Current price */}
      <div style={{
        position: 'absolute', left: `${pct(current)}%`, top: 14,
        width: 8, height: 8, borderRadius: '50%',
        background: '#fff', transform: 'translateX(-4px)',
        boxShadow: '0 0 8px rgba(255,255,255,.5)', zIndex: 2,
      }} />
      <div style={{
        position: 'absolute', left: `${pct(current)}%`, top: 0,
        fontSize: 9, color: '#fff', fontWeight: 700,
        transform: 'translateX(-50%)', whiteSpace: 'nowrap',
      }}>{fmt(current)}</div>
      {/* TP marker */}
      <div style={{
        position: 'absolute', left: `${pct(tp)}%`, top: 4,
        width: 2, height: 40, background: 'var(--kt-up)', borderRadius: 1,
        transform: 'translateX(-1px)',
      }} />
      <div style={{
        position: 'absolute', left: `${pct(tp)}%`, bottom: 0,
        fontSize: 9, color: 'var(--kt-up)', transform: 'translateX(-50%)', whiteSpace: 'nowrap',
      }}>TP {fmt(tp)}</div>
    </div>
  )
}

/* ── Signal Card ── */
function SignalCard({ signal }: { signal: any }) {
  const bias = signal.bias
  const entry = parseFloat(signal.entry_price)
  const sl = parseFloat(signal.stop_loss)
  const tp = parseFloat(signal.take_profit)
  const price = parseFloat(signal.price)
  const state = signal.alert_state || 'new'
  const badge = stateBadge(state)

  const unrealized = signal.pnl_pct ? parseFloat(signal.pnl_pct) : null

  return (
    <div className="kt-card" style={{ marginBottom: 12 }}>
      <div className="kt-card-pad" style={{ padding: '12px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 18, fontWeight: 700, color: bias === 'bullish' ? 'var(--kt-up)' : 'var(--kt-dn)',
            }}>
              {bias === 'bullish' ? '🟢' : '🔴'} BTCUSDT
            </span>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
              background: badge.bg, color: badge.fg, letterSpacing: 0.5,
            }}>{badge.label}</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--kt-text)' }}>{fmt(price)}</div>
            <div style={{ fontSize: 10, color: 'var(--kt-muted)' }}>{timeAgo(signal.created_at)}</div>
          </div>
        </div>

        {/* Price bar */}
        <PriceBar entry={entry} sl={sl} tp={tp} current={price} bias={bias} />

        {/* Levels */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--kt-muted)', marginBottom: 2 }}>ENTRY</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--kt-gold)' }}>${fmt(entry)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--kt-muted)', marginBottom: 2 }}>SL</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--kt-dn)' }}>${fmt(sl)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--kt-muted)', marginBottom: 2 }}>TP</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--kt-up)' }}>${fmt(tp)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--kt-muted)', marginBottom: 2 }}>R:R</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--kt-text)' }}>{fmt(signal.risk_reward)}</div>
          </div>
        </div>

        {/* Confidence + PnL */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--kt-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--kt-muted)' }}>Confidence</span>
            <span style={{
              fontSize: 12, fontWeight: 700,
              color: signal.confidence >= 80 ? 'var(--kt-up)' : signal.confidence >= 60 ? 'var(--kt-gold)' : 'var(--kt-muted)',
            }}>{signal.confidence}%</span>
            <div style={{
              width: 60, height: 4, background: 'var(--kt-border)', borderRadius: 2, overflow: 'hidden',
            }}>
              <div style={{
                width: `${signal.confidence}%`, height: '100%',
                background: signal.confidence >= 80 ? 'var(--kt-up)' : signal.confidence >= 60 ? 'var(--kt-gold)' : 'var(--kt-muted)',
              }} />
            </div>
          </div>
          {unrealized !== null && (
            <span style={{ fontSize: 13, fontWeight: 700, color: pnlColor(unrealized) }}>
              {fmtPnl(unrealized)}
            </span>
          )}
          {signal.hit_tp && (
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--kt-up)' }}>✓ TP HIT</span>
          )}
          {signal.hit_sl && (
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--kt-dn)' }}>✗ SL HIT</span>
          )}
        </div>

        {/* Layers */}
        {signal.confluence?.layers && (
          <div style={{ display: 'flex', gap: 12, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--kt-border)' }}>
            {['smc', 'technical', 'volume'].map(key => {
              const l = signal.confluence.layers[key]
              if (!l) return null
              const label = key === 'smc' ? 'SMC' : key === 'technical' ? 'Tech' : 'Vol'
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 9, color: 'var(--kt-muted)' }}>{label}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    color: l.bias === 'bullish' ? 'var(--kt-up)' : l.bias === 'bearish' ? 'var(--kt-dn)' : 'var(--kt-muted)',
                  }}>{l.bias === 'bullish' ? '▲' : l.bias === 'bearish' ? '▼' : '—'} {l.confidence}%</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   BTC SCALP DASHBOARD
   ═══════════════════════════════════════════════════════════════════ */

export function BtcScalpDashboard() {
  const [activeSignals, setActiveSignals] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [livePrice, setLivePrice] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [tab, setTab] = useState<'live' | 'history'>('live')

  const fetchData = async () => {
    try {
      const [activeRes, histRes, liveRes] = await Promise.all([
        api('/api/crypto/signals?limit=50'),
        api('/api/crypto/signals/history?limit=20'),
        api('/api/crypto/live/BTCUSDT').catch(() => null),
      ])

      // Filter BTCUSDT only — api() returns raw json when no data wrapper
      const activeList = activeRes.signals || activeRes.data?.signals || []
      const histList = histRes.history || histRes.signals || histRes.data?.history || []
      const btcActive = activeList.filter((s: any) =>
        s.symbol === 'BTCUSDT' && s.timeframe === 'scalp'
      )
      const btcHist = histList.filter((s: any) =>
        s.symbol === 'BTCUSDT' && s.timeframe === 'scalp'
      )

      setActiveSignals(btcActive)
      setHistory(btcHist)
      setLivePrice(liveRes?.candle || null)
      setLastUpdate(new Date())
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 5000) // Poll every 5s
    return () => clearInterval(interval)
  }, [])

  // Stats
  const totalActive = activeSignals.length
  const awaitingEntry = activeSignals.filter(s => s.alert_state === 'entry_pending').length
  const entryHit = activeSignals.filter(s => s.alert_state === 'entry_hit').length
  const totalTp = history.filter(s => s.hit_tp).length
  const totalSl = history.filter(s => s.hit_sl).length
  const winRate = (totalTp + totalSl) > 0 ? Math.round(totalTp / (totalTp + totalSl) * 100) : 0

  return (
    <div style={{ padding: '0 16px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            ⚡ BTC Scalp Dashboard
          </h1>
          <div style={{ fontSize: 11, color: 'var(--kt-muted)', marginTop: 2 }}>
            Auto-refresh 5s · {lastUpdate.toLocaleTimeString()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setTab('live')}
            style={{
              padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
              background: tab === 'live' ? 'rgba(245,158,11,.15)' : 'transparent',
              color: tab === 'live' ? 'var(--kt-gold)' : 'var(--kt-muted)',
            }}
          >Live ({totalActive})</button>
          <button
            onClick={() => setTab('history')}
            style={{
              padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
              background: tab === 'history' ? 'rgba(245,158,11,.15)' : 'transparent',
              color: tab === 'history' ? 'var(--kt-gold)' : 'var(--kt-muted)',
            }}
          >History ({history.length})</button>
        </div>
      </div>

      {/* Live Price Banner */}
      {livePrice && (
        <div className="kt-card" style={{ marginBottom: 12, overflow: 'hidden' }}>
          <div className="kt-card-pad" style={{ padding: '10px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', background: '#10b981',
                  animation: 'pulse 2s infinite', display: 'inline-block',
                }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--kt-text)' }}>BTCUSDT</span>
                <span style={{ fontSize: 10, color: 'var(--kt-muted)', padding: '2px 6px', borderRadius: 4, background: 'rgba(16,185,129,.1)' }}>LIVE</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--kt-text)', fontVariantNumeric: 'tabular-nums' }}>
                  ${fmt(parseFloat(livePrice.close))}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
              <div>
                <span style={{ fontSize: 9, color: 'var(--kt-muted)' }}>H </span>
                <span style={{ fontSize: 11, color: 'var(--kt-text)' }}>${fmt(parseFloat(livePrice.high))}</span>
              </div>
              <div>
                <span style={{ fontSize: 9, color: 'var(--kt-muted)' }}>L </span>
                <span style={{ fontSize: 11, color: 'var(--kt-text)' }}>${fmt(parseFloat(livePrice.low))}</span>
              </div>
              <div>
                <span style={{ fontSize: 9, color: 'var(--kt-muted)' }}>O </span>
                <span style={{ fontSize: 11, color: 'var(--kt-text)' }}>${fmt(parseFloat(livePrice.open))}</span>
              </div>
              <div>
                <span style={{ fontSize: 9, color: 'var(--kt-muted)' }}>Vol </span>
                <span style={{ fontSize: 11, color: 'var(--kt-text)' }}>{fmt(parseFloat(livePrice.volume), 2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Active', value: totalActive, color: 'var(--kt-gold)' },
          { label: 'Awaiting Entry', value: awaitingEntry, color: '#f59e0b' },
          { label: 'Entry Hit', value: entryHit, color: '#10b981' },
          { label: 'Win Rate', value: `${winRate}%`, color: winRate >= 60 ? 'var(--kt-up)' : 'var(--kt-muted)' },
          { label: 'TP / SL', value: `${totalTp} / ${totalSl}`, color: 'var(--kt-text)' },
        ].map((s, i) => (
          <div key={i} className="kt-card kt-card-pad" style={{ textAlign: 'center', padding: '8px 4px' }}>
            <div style={{ fontSize: 9, color: 'var(--kt-muted)', marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="kt-card kt-card-pad" style={{ textAlign: 'center', color: 'var(--kt-muted)' }}>
          Loading...
        </div>
      ) : tab === 'live' ? (
        activeSignals.length === 0 ? (
          <div className="kt-card kt-card-pad" style={{ textAlign: 'center', color: 'var(--kt-muted)' }}>
            No active BTC scalp signals
          </div>
        ) : (
          activeSignals.map(s => <SignalCard key={s.id} signal={s} />)
        )
      ) : (
        history.length === 0 ? (
          <div className="kt-card kt-card-pad" style={{ textAlign: 'center', color: 'var(--kt-muted)' }}>
            No BTC scalp history yet
          </div>
        ) : (
          <div className="kt-card" style={{ overflow: 'hidden' }}>
            <table className="kt-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Bias</th>
                  <th>Entry</th>
                  <th>SL</th>
                  <th>TP</th>
                  <th>Exit</th>
                  <th>PnL</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {history.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontSize: 11, color: 'var(--kt-muted)' }}>{timeAgo(s.created_at)}</td>
                    <td style={{ color: s.bias === 'bullish' ? 'var(--kt-up)' : 'var(--kt-dn)', fontWeight: 600 }}>
                      {s.bias === 'bullish' ? '🟢' : '🔴'}
                    </td>
                    <td>${fmt(s.entry_price)}</td>
                    <td style={{ color: 'var(--kt-dn)' }}>${fmt(s.stop_loss)}</td>
                    <td style={{ color: 'var(--kt-up)' }}>${fmt(s.take_profit)}</td>
                    <td>{s.exit_price ? `$${fmt(s.exit_price)}` : '—'}</td>
                    <td style={{ fontWeight: 600, color: pnlColor(s.pnl_pct) }}>{fmtPnl(s.pnl_pct)}</td>
                    <td>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                        background: s.hit_tp ? 'rgba(16,185,129,.15)' : s.hit_sl ? 'rgba(239,68,68,.15)' : 'rgba(107,114,128,.15)',
                        color: s.hit_tp ? 'var(--kt-up)' : s.hit_sl ? 'var(--kt-dn)' : 'var(--kt-muted)',
                      }}>
                        {s.hit_tp ? 'TP' : s.hit_sl ? 'SL' : 'EXP'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
