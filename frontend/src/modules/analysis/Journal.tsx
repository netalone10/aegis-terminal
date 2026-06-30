import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Calendar, Plus, Star, Tag, Trash2 } from 'lucide-react'

type EntryType = 'Trade' | 'Analysis' | 'Note' | 'Review'
interface JournalEntry { id: number; date: string; symbol: string; type: EntryType; content: string; tags: string[]; rating: number }

const TYPE_COLORS: Record<EntryType, string> = {
  Trade: 'gold', Analysis: 'badge-info', Note: '', Review: '',
}

function Stars({ rating }: { rating: number }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={12} style={{ color: i <= rating ? 'var(--kt-gold)' : 'var(--kt-dim)', fill: i <= rating ? 'var(--kt-gold)' : 'none' }} />
      ))}
    </div>
  )
}

export default function Journal() {
  const qc = useQueryClient()
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ symbol: '', type: 'Trade' as EntryType, content: '', tags: '', rating: 3 })

  const { data: entries = [], isLoading } = useQuery<JournalEntry[]>({
    queryKey: ['journal-entries'],
    queryFn: () => api('/api/journal/entries'),
    staleTime: 60_000,
  })

  const createMut = useMutation({
    mutationFn: (data: any) => api('/api/journal/entries', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['journal-entries'] }); setForm({ symbol: '', type: 'Trade', content: '', tags: '', rating: 3 }); setShowForm(false) },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api(`/api/journal/entries/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['journal-entries'] }); setSelectedEntry(null) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.symbol || !form.content) return
    createMut.mutate({
      date: new Date().toISOString().slice(0, 10),
      symbol: form.symbol,
      type: form.type,
      content: form.content,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      rating: form.rating,
    })
  }

  return (
    <div>
      <div className="kt-route-head">
        <div>
          <div className="kt-kicker">Trading Journal</div>
          <h1>Journal</h1>
          <p>Log execution, invalidation, result, and lesson from each trade</p>
        </div>
        <button className="kt-btn kt-btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={13} style={{ marginRight: 6 }} /> New Entry
        </button>
      </div>

      {showForm && (
        <div className="kt-card kt-card-pad" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 var(--sm)', fontSize: 'var(--sm)', color: 'var(--kt-gold)' }}>+ NEW ENTRY</h3>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input className="kt-input" placeholder="Symbol (BTCUSD)" value={form.symbol} onChange={e => setForm({ ...form, symbol: e.target.value })} required />
              <select className="kt-input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as EntryType })}>
                <option value="Trade">Trade</option>
                <option value="Analysis">Analysis</option>
                <option value="Note">Note</option>
                <option value="Review">Review</option>
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
          <div className="kt-card">
            <div className="kt-card-pad">
              {[...Array(4)].map((_, i) => (
                <div key={i} style={{ padding: '14px 0', borderBottom: '1px solid var(--kt-border-soft)' }}>
                  <div className="skeleton w-20 h-4 mb-2" />
                  <div className="skeleton w-full h-3 mb-2" />
                  <div className="skeleton w-16 h-2" />
                </div>
              ))}
            </div>
          </div>
          <div className="kt-panel">
            <div className="kt-panel-body">
              <div className="skeleton w-full h-40" />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16, alignItems: 'start' }}>
          {/* Entry List */}
          <div className="kt-card">
            <div className="kt-card-pad" style={{ padding: 0 }}>
              {entries.length === 0 && (
                <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                  <p style={{ color: 'var(--kt-muted)', fontSize: 'var(--sm)' }}>No journal entries yet</p>
                </div>
              )}
              {entries.map(entry => (
                <div
                  key={entry.id}
                  onClick={() => setSelectedEntry(entry)}
                  style={{
                    padding: '14px 16px',
                    borderBottom: '1px solid var(--kt-border-soft)',
                    cursor: 'pointer',
                    background: selectedEntry?.id === entry.id ? 'var(--kt-bg3)' : 'transparent',
                    transition: 'background var(--kt-fast)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="mono" style={{ color: 'var(--kt-text)', fontWeight: 600, fontSize: 'var(--md)' }}>{entry.symbol}</span>
                      <span className={`kt-tag ${TYPE_COLORS[entry.type]}`} style={{ fontSize: '9px', padding: '2px 6px' }}>{entry.type}</span>
                    </div>
                    <Stars rating={entry.rating} />
                  </div>
                  <p style={{ color: 'var(--kt-text2)', fontSize: 'var(--sm)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.content}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <Calendar size={10} style={{ color: 'var(--kt-dim)' }} />
                    <span style={{ color: 'var(--kt-dim)', fontSize: 'var(--xs)' }}>{entry.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Entry Detail */}
          {selectedEntry && (
            <div className="kt-panel">
              <div className="kt-panel-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="mono" style={{ color: 'var(--kt-text)', fontWeight: 700, fontSize: 'var(--lg)' }}>{selectedEntry.symbol}</span>
                  <span className={`kt-tag ${TYPE_COLORS[selectedEntry.type]}`}>{selectedEntry.type}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Stars rating={selectedEntry.rating} />
                  <span style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)' }}>{selectedEntry.date}</span>
                  <button
                    onClick={() => deleteMut.mutate(selectedEntry.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--kt-dn)', cursor: 'pointer', padding: '4px' }}
                    title="Delete entry"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="kt-panel-body">
                <p style={{ color: 'var(--kt-text2)', fontSize: 'var(--md)', lineHeight: 1.8, marginBottom: 16 }}>
                  {selectedEntry.content}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selectedEntry.tags.map(tag => (
                    <span key={tag} className="kt-tag">
                      <Tag size={9} style={{ marginRight: 3 }} />{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
