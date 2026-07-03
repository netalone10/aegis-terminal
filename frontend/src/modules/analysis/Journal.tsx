import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar, Plus, Star, Tag, Trash2, Clock, RefreshCw, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react'
import { api } from '../../lib/api'

/* ── Types ── */
type EntryType = 'Trade' | 'Analysis' | 'Note' | 'Review'
interface JournalEntry { id: number; date: string; symbol: string; type: EntryType; content: string; tags: string[]; rating: number }
interface Position { id: number; symbol: string; direction: 'Long' | 'Short'; entryPrice: number; currentPrice: number; quantity: number; status: 'Open' | 'Closed'; pnl: number; pnlPercent: number; openedAt: string; closedAt: string | null }
interface ReportData { session: string; narrative?: string; timestamp?: string; meta?: { price?: number; atr?: number; rsi?: number; trend?: string; ema20?: number; ema50?: number; sentiment?: string }; [key: string]: any }

const TYPE_COLORS: Record<EntryType, string> = { Trade: 'gold', Analysis: 'badge-info', Note: '', Review: '' }
const REPORT_SESSIONS = [
  { key: 'asia', label: 'Asia', time: '07:00–11:00 WIB', color: '#60a5fa' },
  { key: 'london', label: 'London', time: '13:00–16:00 WIB', color: '#f59e0b' },
  { key: 'ny', label: 'New York', time: '19:30–03:00 WIB', color: '#a78bfa' },
] as const
type SessionKey = typeof REPORT_SESSIONS[number]['key']

/* ── Helpers ── */
function relativeTime(iso?: string): string { if (!iso) return 'Unknown'; const diff = Date.now() - new Date(iso).getTime(); const mins = Math.floor(diff / 60_000); if (mins < 1) return 'Just now'; if (mins < 60) return `${mins}m ago`; const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h ago`; return `${Math.floor(hrs / 24)}d ago` }

/* ── Sub-components ── */
function Stars({ rating }: { rating: number }) {
  return <div style={{ display: 'flex', gap: 2 }}>{[1, 2, 3, 4, 5].map(i => <Star key={i} size={12} style={{ color: i <= rating ? 'var(--kt-gold)' : 'var(--kt-dim)', fill: i <= rating ? 'var(--kt-gold)' : 'none' }} />)}</div>
}
function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="kt-stat"><div className="kt-stat-label">{label}</div><div className="kt-stat-value" style={color ? { color } : undefined}>{value}</div></div>
}
function NarrativeBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false); const limit = 500; const isLong = text.length > limit; const display = expanded || !isLong ? text : text.slice(0, limit)
  return <div style={{ padding: '12px 16px', background: 'var(--kt-bg2)', borderRadius: 8, fontSize: 'var(--sm)', color: 'var(--kt-text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{display}{isLong && !expanded && '…'}{isLong && <button onClick={() => setExpanded(!expanded)} style={{ display: 'block', marginTop: 8, background: 'none', border: 'none', color: 'var(--kt-gold)', fontSize: 'var(--xs)', fontWeight: 600, cursor: 'pointer' }}>{expanded ? 'Collapse' : 'Read more'}</button>}</div>
}

/* ══════════════════════════════════════════════════════════════════
   MERGED: Journal + Portfolio + ReportArchive
   TOP: Trade Journal | MID: Portfolio | BOT: Report Archive
   ══════════════════════════════════════════════════════════════════ */
export default function Journal() {
  const qc = useQueryClient()
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ symbol: '', type: 'Trade' as EntryType, content: '', tags: '', rating: 3 })
  const [portfolioFilter, setPortfolioFilter] = useState<'All' | 'Open' | 'Closed'>('All')
  const [activeTab, setActiveTab] = useState<SessionKey>('asia')

  /* ── Journal queries ── */
  const { data: entries = [], isLoading } = useQuery<JournalEntry[]>({ queryKey: ['journal-entries'], queryFn: () => api('/api/journal/entries'), staleTime: 60_000 })
  const createMut = useMutation({ mutationFn: (data: any) => api('/api/journal/entries', { method: 'POST', body: JSON.stringify(data) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['journal-entries'] }); setForm({ symbol: '', type: 'Trade', content: '', tags: '', rating: 3 }); setShowForm(false) } })
  const deleteMut = useMutation({ mutationFn: (id: number) => api(`/api/journal/entries/${id}`, { method: 'DELETE' }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['journal-entries'] }); setSelectedEntry(null) } })

  /* ── Portfolio queries ── */
  const { data: positions = [], isLoading: posLoading, error: posError } = useQuery<Position[]>({ queryKey: ['portfolio-positions'], queryFn: () => api('/api/portfolio/positions'), staleTime: 30_000, refetchInterval: 30_000 })

  /* ── Report queries ── */
  const { data: reportData, isLoading: reportLoading, error: reportError, refetch, isFetching } = useQuery<ReportData>({ queryKey: ['archive-report', activeTab], queryFn: () => api<ReportData>(`/api/session/report?session=${activeTab}`), staleTime: 300_000 })

  /* ── Portfolio derived ── */
  const filtered = portfolioFilter === 'All' ? positions : positions.filter(p => portfolioFilter === 'Open' ? p.status === 'Open' : p.status === 'Closed')
  const openCount = positions.filter(p => p.status === 'Open').length
  const closedCount = positions.filter(p => p.status === 'Closed').length
  const totalPnl = positions.reduce((s, p) => s + (p.pnl ?? 0), 0)
  const wins = positions.filter(p => p.status === 'Closed' && (p.pnl ?? 0) > 0).length
  const totalClosed = positions.filter(p => p.status === 'Closed').length
  const winRate = totalClosed > 0 ? Math.round((wins / totalClosed) * 100) : 0
  const maxDrawdown = positions.length > 0 ? Math.min(...positions.map(p => p.pnlPercent ?? 0)) : 0

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!form.symbol || !form.content) return; createMut.mutate({ date: new Date().toISOString().slice(0, 10), symbol: form.symbol, type: form.type, content: form.content, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean), rating: form.rating }) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--md, 16px)' }}>
      {/* ═══ SECTION 1: TRADE JOURNAL ═══ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="kt-kicker">Trading Journal</div>
          <h2 style={{ margin: 0, fontSize: 'var(--lg)' }}>Journal</h2>
        </div>
        <button className="kt-btn kt-btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={13} style={{ marginRight: 6 }} /> New Entry
        </button>
      </div>

      {showForm && (
        <div className="kt-card kt-card-pad">
          <h3 style={{ margin: '0 0 var(--sm)', fontSize: 'var(--sm)', color: 'var(--kt-gold)' }}>+ NEW ENTRY</h3>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input className="kt-input" placeholder="Symbol (BTCUSD)" value={form.symbol} onChange={e => setForm({ ...form, symbol: e.target.value })} required />
              <select className="kt-input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as EntryType })}>
                <option value="Trade">Trade</option><option value="Analysis">Analysis</option><option value="Note">Note</option><option value="Review">Review</option>
              </select>
            </div>
            <textarea className="kt-input" placeholder="Content..." value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} required rows={3} style={{ resize: 'vertical' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input className="kt-input" placeholder="Tags (comma separated)" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} />
              <select className="kt-input" value={form.rating} onChange={e => setForm({ ...form, rating: parseInt(e.target.value) })}>
                {[1, 2, 3, 4, 5].map(r => <option key={r} value={r}>{r} Star{r > 1 ? 's' : ''}</option>)}
              </select>
            </div>
            <button type="submit" className="kt-btn" style={{ background: 'var(--kt-gold)', color: 'var(--kt-bg)', fontWeight: 600, padding: '8px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              {createMut.isPending ? 'Saving...' : 'Save Entry'}
            </button>
          </form>
        </div>
      )}

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16 }}>
          <div className="kt-card"><div className="kt-card-pad">{[...Array(4)].map((_, i) => <div key={i} style={{ padding: '14px 0', borderBottom: '1px solid var(--kt-border-soft)' }}><div className="skeleton w-20 h-4 mb-2" /><div className="skeleton w-full h-3 mb-2" /><div className="skeleton w-16 h-2" /></div>)}</div></div>
          <div className="kt-panel"><div className="kt-panel-body"><div className="skeleton w-full h-40" /></div></div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16, alignItems: 'start' }}>
          <div className="kt-card">
            <div className="kt-card-pad" style={{ padding: 0 }}>
              {entries.length === 0 && <div style={{ padding: '24px 16px', textAlign: 'center' }}><p style={{ color: 'var(--kt-muted)', fontSize: 'var(--sm)' }}>No journal entries yet</p></div>}
              {entries.map(entry => (
                <div key={entry.id} onClick={() => setSelectedEntry(entry)} style={{ padding: '14px 16px', borderBottom: '1px solid var(--kt-border-soft)', cursor: 'pointer', background: selectedEntry?.id === entry.id ? 'var(--kt-bg3)' : 'transparent', transition: 'background var(--kt-fast)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="mono" style={{ color: 'var(--kt-text)', fontWeight: 600 }}>{entry.symbol}</span>
                      <span className={`kt-tag ${TYPE_COLORS[entry.type]}`} style={{ fontSize: '9px', padding: '2px 6px' }}>{entry.type}</span>
                    </div>
                    <Stars rating={entry.rating} />
                  </div>
                  <p style={{ color: 'var(--kt-text2)', fontSize: 'var(--sm)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.content}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}><Calendar size={10} style={{ color: 'var(--kt-dim)' }} /><span style={{ color: 'var(--kt-dim)', fontSize: 'var(--xs)' }}>{entry.date}</span></div>
                </div>
              ))}
            </div>
          </div>
          {selectedEntry && (
            <div className="kt-panel">
              <div className="kt-panel-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="mono" style={{ color: 'var(--kt-text)', fontWeight: 700, fontSize: 'var(--lg)' }}>{selectedEntry.symbol}</span>
                  <span className={`kt-tag ${TYPE_COLORS[selectedEntry.type]}`}>{selectedEntry.type}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Stars rating={selectedEntry.rating} /><span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)' }}>{selectedEntry.date}</span>
                  <button onClick={() => deleteMut.mutate(selectedEntry.id)} style={{ background: 'none', border: 'none', color: 'var(--kt-dn)', cursor: 'pointer', padding: '4px' }} title="Delete entry"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="kt-panel-body">
                <p style={{ color: 'var(--kt-text2)', fontSize: 'var(--md)', lineHeight: 1.8, marginBottom: 16 }}>{selectedEntry.content}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selectedEntry.tags.map(tag => <span key={tag} className="kt-tag"><Tag size={9} style={{ marginRight: 3 }} />{tag}</span>)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ SECTION 2: PORTFOLIO ═══ */}
      <div>
        <div className="kt-kicker">Portfolio</div>
        <h2 style={{ margin: '0 0 12px', fontSize: 'var(--lg)' }}>Portfolio Tracker</h2>
        <div className="kt-stat-grid kt-stat-grid-4" style={{ marginBottom: 16 }}>
          <div className="kt-stat"><div className="kt-stat-label">Total P&L</div><div className={`kt-stat-value ${totalPnl >= 0 ? 'up' : 'dn'}`} style={{ marginTop: 4 }}>{totalPnl >= 0 ? '+' : ''}{totalPnl.toLocaleString()}</div></div>
          <div className="kt-stat"><div className="kt-stat-label">Win Rate</div><div className="kt-stat-value gold" style={{ marginTop: 4 }}>{winRate}%</div></div>
          <div className="kt-stat"><div className="kt-stat-label">Open Positions</div><div className="kt-stat-value" style={{ marginTop: 4 }}>{openCount}</div></div>
          <div className="kt-stat"><div className="kt-stat-label">Max Drawdown</div><div className="kt-stat-value dn" style={{ marginTop: 4 }}>{maxDrawdown.toFixed(2)}%</div></div>
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {(['All', 'Open', 'Closed'] as const).map(tab => <button key={tab} className={`kt-tag ${portfolioFilter === tab ? 'gold' : ''}`} onClick={() => setPortfolioFilter(tab)} style={{ cursor: 'pointer' }}>{tab} {tab === 'Open' ? `(${openCount})` : tab === 'Closed' ? `(${closedCount})` : ''}</button>)}
        </div>
        <div className="kt-card">
          {posLoading ? (
            <div className="kt-card-pad">{[...Array(4)].map((_, i) => <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--kt-border-soft)' }}><div className="skeleton h-4 w-full" /></div>)}</div>
          ) : posError ? <div className="kt-card-pad" style={{ textAlign: 'center', padding: '32px 16px' }}><p style={{ color: 'var(--kt-dn)', fontSize: 'var(--sm)' }}>Failed to load positions</p></div> : (
            <table className="kt-table">
              <thead><tr><th>Symbol</th><th>Direction</th><th>Entry</th><th>Current</th><th>P&L</th><th>P&L %</th><th>Qty</th><th>Status</th></tr></thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--kt-muted)', padding: 24 }}>No positions found</td></tr>}
                {filtered.map(p => { const isProfit = (p.pnl ?? 0) >= 0; return <tr key={p.id}><td className="mono" style={{ color: 'var(--kt-text)', fontWeight: 600 }}>{p.symbol}</td><td><span className={p.direction === 'Long' ? 'badge-bull' : 'badge-bear'}>{p.direction}</span></td><td className="mono">{p.entryPrice?.toLocaleString()}</td><td className="mono" style={{ color: 'var(--kt-text)' }}>{p.currentPrice?.toLocaleString()}</td><td className={`mono ${isProfit ? 'up' : 'dn'}`}>{isProfit ? '+' : ''}{(p.pnl ?? 0).toLocaleString()}</td><td className={`mono ${isProfit ? 'up' : 'dn'}`}>{isProfit ? '+' : ''}{(p.pnlPercent ?? 0).toFixed(2)}%</td><td className="mono">{p.quantity}</td><td><span className={p.status === 'Open' ? 'badge-info' : 'badge-neutral'}>{p.status}</span></td></tr> })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ═══ SECTION 3: REPORT ARCHIVE ═══ */}
      <div>
        <div className="kt-kicker">Session Archive</div>
        <h2 style={{ margin: '0 0 12px', fontSize: 'var(--lg)' }}>Report Archive</h2>

        {/* Session tabs */}
        <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--kt-bg2)', borderRadius: 8, marginBottom: 16, width: 'fit-content' }}>
          {REPORT_SESSIONS.map(s => (
            <button key={s.key} onClick={() => setActiveTab(s.key)} style={{ padding: '8px 20px', borderRadius: 6, background: activeTab === s.key ? 'var(--kt-bg1)' : 'transparent', border: activeTab === s.key ? '1px solid var(--kt-border)' : '1px solid transparent', color: activeTab === s.key ? 'var(--kt-gold)' : 'var(--kt-muted)', fontSize: 'var(--sm)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', boxShadow: activeTab === s.key ? '0 1px 3px rgba(0,0,0,.3)' : 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />{s.label}
            </button>
          ))}
        </div>

        {/* Report card */}
        {reportLoading ? (
          <div className="kt-panel kt-card-pad" style={{ minHeight: 300 }}>
            <div className="skeleton w-32 h-4 mb-3" /><div className="skeleton w-full h-5 mb-2" /><div className="skeleton w-full h-5 mb-2" /><div className="skeleton w-3/4 h-5 mb-4" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 16 }}>
              {[1, 2, 3, 4].map(i => <div key={i} className="skeleton w-full h-16" style={{ borderRadius: 8 }} />)}
            </div>
          </div>
        ) : reportError ? (
          <div className="kt-panel kt-card-pad" style={{ minHeight: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <AlertCircle size={24} style={{ color: 'var(--kt-dn)' }} />
            <p style={{ color: 'var(--kt-dn)', fontSize: 'var(--sm)' }}>Failed to load report</p>
            <button onClick={() => refetch()} style={{ padding: '6px 16px', borderRadius: 6, background: 'var(--kt-bg2)', border: '1px solid var(--kt-border)', color: 'var(--kt-text)', fontSize: 'var(--xs)', fontWeight: 600, cursor: 'pointer' }}>Retry</button>
          </div>
        ) : !reportData ? (
          <div className="kt-panel kt-card-pad" style={{ minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: 'var(--kt-muted)', fontSize: 'var(--sm)' }}>No report data</p>
          </div>
        ) : (
          <div className="kt-panel">
            <div className="kt-panel-head" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 'var(--xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--kt-gold)' }}>{reportData.session}</span>
                <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: '10px', background: 'rgba(34,197,94,.15)', color: '#22c55e', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>Auto-generated</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>{relativeTime(reportData.timestamp)}</span>
                <button onClick={() => refetch()} disabled={isFetching} style={{ padding: '4px 10px', borderRadius: 4, background: 'var(--kt-bg2)', border: '1px solid var(--kt-border)', color: 'var(--kt-text)', fontSize: 'var(--xs)', fontWeight: 600, cursor: isFetching ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <RefreshCw size={11} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />Refresh
                </button>
              </div>
            </div>
            <div className="kt-panel-body">
              {reportData.narrative ? <NarrativeBlock text={reportData.narrative} /> : <div style={{ padding: '12px 16px', background: 'var(--kt-bg2)', borderRadius: 8, fontSize: 'var(--sm)', color: 'var(--kt-muted)', textAlign: 'center' }}>Narrative not available</div>}
              <div className="kt-stat-grid kt-stat-grid-4" style={{ marginTop: 16 }}>
                <StatCard label="Price" value={reportData.meta?.price != null ? reportData.meta.price.toFixed(2) : '—'} />
                <StatCard label="ATR" value={reportData.meta?.atr != null ? reportData.meta.atr.toFixed(2) : '—'} />
                <StatCard label="RSI" value={reportData.meta?.rsi != null ? reportData.meta.rsi.toFixed(1) : '—'} />
                <StatCard label="Sentiment" value={(reportData.meta?.sentiment ?? 'neutral').toUpperCase()} color={reportData.meta?.sentiment === 'bullish' ? 'var(--kt-up)' : reportData.meta?.sentiment === 'bearish' ? 'var(--kt-dn)' : 'var(--kt-muted)'} />
              </div>
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, padding: '12px 16px', background: 'var(--kt-bg2)', borderRadius: 8, flexWrap: 'wrap', gap: 12 }}>
          <button onClick={() => refetch()} disabled={isFetching} style={{ padding: '8px 16px', borderRadius: 6, background: 'var(--kt-gold)', border: 'none', color: '#000', fontSize: 'var(--xs)', fontWeight: 700, cursor: isFetching ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={12} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />Generate Fresh Report
          </button>
          <a href="/session-report" style={{ padding: '8px 16px', borderRadius: 6, background: 'transparent', border: '1px solid var(--kt-border)', color: 'var(--kt-text)', fontSize: 'var(--xs)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
            <ExternalLink size={12} />View in Terminal
          </a>
          <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} />Last updated: {relativeTime(reportData?.timestamp)}</span>
        </div>

        {/* Session status */}
        <div style={{ marginTop: 16 }}>
          <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>Session Status</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {REPORT_SESSIONS.map(s => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--kt-bg2)', borderRadius: 6 }}>
                <CheckCircle size={14} style={{ color: '#22c55e', flexShrink: 0 }} />
                <span style={{ fontSize: 'var(--sm)', fontWeight: 600, color: s.color }}>{s.label}</span>
                <span style={{ fontSize: 'var(--xs)', color: 'var(--kt-muted)' }}>Report available</span>
                <span style={{ marginLeft: 'auto', fontSize: 'var(--xs)', color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>{s.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
