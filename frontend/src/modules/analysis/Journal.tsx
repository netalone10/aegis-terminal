import { useState } from 'react'
import { Calendar, Plus, Star, Tag } from 'lucide-react'

type EntryType = 'Trade' | 'Analysis' | 'Note' | 'Review'
interface JournalEntry { id: number; date: string; symbol: string; type: EntryType; content: string; tags: string[]; rating: number }

const MOCK_ENTRIES: JournalEntry[] = [
  { id: 1, date: '2026-06-28', symbol: 'BBCA', type: 'Trade', content: 'Entered long at 9650 on golden cross confirmation. RSI at 52, healthy pullback from resistance. SL at 9400, TP at 10200. Risk:reward 1:2.2.', tags: ['breakout', 'banking', 'golden-cross'], rating: 4 },
  { id: 2, date: '2026-06-27', symbol: 'ADRO', type: 'Analysis', content: 'Coal sector showing strength. ADRO breaking above 200-day MA with volume confirmation. Foreign net buy increasing. Watch for pullback entry near 2720.', tags: ['mining', 'sector-rotation', 'sma200'], rating: 5 },
  { id: 3, date: '2026-06-26', symbol: 'TLKM', type: 'Note', content: 'Telkom 5G rollout news coming in Q3. Institutional accumulation pattern visible on weekly chart. Not entering yet — waiting for catalyst.', tags: ['telco', '5g', 'watchlist'], rating: 3 },
  { id: 4, date: '2026-06-25', symbol: 'IHSG', type: 'Review', content: 'Weekly review: 3 trades taken, 2 winners, 1 loser. Total R: +2.8R. Biggest mistake: exited BBRI too early, left 1.2R on the table. Need to trust the system.', tags: ['weekly-review', 'discipline', 'journaling'], rating: 4 },
  { id: 5, date: '2026-06-24', symbol: 'EXCL', type: 'Trade', content: 'Short EXCL at 2050 after bearish engulfing on daily. D/E ratio concerning at 2.1. Mobile data pricing war pressuring margins. TP 1800, SL 2200.', tags: ['short', 'telco', 'bearish-engulfing'], rating: 3 },
]

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
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(MOCK_ENTRIES[0])

  return (
    <div>
      <div className="kt-route-head">
        <div>
          <div className="kt-kicker">Trading Journal</div>
          <h1>Journal</h1>
          <p>Log execution, invalidation, result, and lesson from each trade</p>
        </div>
        <button className="kt-btn kt-btn-primary">
          <Plus size={13} style={{ marginRight: 6 }} /> New Entry
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16, alignItems: 'start' }}>
        {/* Entry List */}
        <div className="kt-card">
          <div className="kt-card-pad" style={{ padding: 0 }}>
            {MOCK_ENTRIES.map(entry => (
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
    </div>
  )
}
