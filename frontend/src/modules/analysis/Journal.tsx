import { useState } from 'react'
import { Calendar, Plus, Star, Tag, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react'

type EntryType = 'Trade' | 'Analysis' | 'Note' | 'Review'

interface JournalEntry {
  id: number
  date: string
  symbol: string
  type: EntryType
  content: string
  tags: string[]
  rating: number
}

const MOCK_ENTRIES: JournalEntry[] = [
  { id: 1, date: '2026-06-28', symbol: 'BBCA', type: 'Trade', content: 'Entered long at 9650 on golden cross confirmation. RSI at 52, healthy pullback from resistance. SL at 9400, TP at 10200. Risk:reward 1:2.2.', tags: ['breakout', 'banking', 'golden-cross'], rating: 4 },
  { id: 2, date: '2026-06-27', symbol: 'ADRO', type: 'Analysis', content: 'Coal sector showing strength. ADRO breaking above 200-day MA with volume confirmation. Foreign net buy increasing. Watch for pullback entry near 2720.', tags: ['mining', 'sector-rotation', 'sma200'], rating: 5 },
  { id: 3, date: '2026-06-26', symbol: 'TLKM', type: 'Note', content: 'Telkom 5G rollout news coming in Q3. Institutional accumulation pattern visible on weekly chart. Not entering yet — waiting for catalyst.', tags: ['telco', '5g', 'watchlist'], rating: 3 },
  { id: 4, date: '2026-06-25', symbol: 'IHSG', type: 'Review', content: 'Weekly review: 3 trades taken, 2 winners, 1 loser. Total R: +2.8R. Biggest mistake: exited BBRI too early, left 1.2R on the table. Need to trust the system.', tags: ['weekly-review', 'discipline', 'journaling'], rating: 4 },
  { id: 5, date: '2026-06-24', symbol: 'EXCL', type: 'Trade', content: 'Short EXCL at 2050 after bearish engulfing on daily. D/E ratio concerning at 2.1. Mobile data pricing war pressuring margins. TP 1800, SL 2200.', tags: ['short', 'telco', 'bearish-engulfing'], rating: 3 },
]

const TYPE_COLORS: Record<EntryType, string> = {
  Trade: 'bg-primary-bg text-primary',
  Analysis: 'bg-info/15 text-info',
  Note: 'bg-warning/15 text-warning',
  Review: 'bg-surface text-fg-secondary',
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={12} className={i <= rating ? 'text-warning fill-warning' : 'text-fg-placeholder'} />
      ))}
    </div>
  )
}

export default function Journal() {
  const [showForm, setShowForm] = useState(false)
  const [monthOffset, setMonthOffset] = useState(0)
  const [form, setForm] = useState({ date: '', symbol: '', type: 'Trade' as EntryType, content: '', tags: '' })

  // Calendar grid
  const now = new Date(2026, 5 + monthOffset, 1) // June 2026 base
  const year = now.getFullYear()
  const month = now.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' })

  const entryDates = new Set(MOCK_ENTRIES.map(e => e.date))

  return (
    <div className="flex h-full">
      {/* Left: Calendar */}
      <aside className="w-72 shrink-0 border-r border-border bg-default p-4 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-fg">{monthName}</span>
          <div className="flex gap-1">
            <button onClick={() => setMonthOffset(m => m - 1)} className="p-1 text-fg-muted hover:text-fg transition-colors">
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => setMonthOffset(m => m + 1)} className="p-1 text-fg-muted hover:text-fg transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAYS.map(d => (
            <div key={d} className="text-center text-[10px] text-fg-placeholder uppercase tracking-wider py-1">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const hasEntry = entryDates.has(dateStr)
            const isToday = dateStr === '2026-06-28'
            return (
              <button
                key={day}
                className={`relative h-8 rounded text-xs font-mono transition-colors ${
                  isToday
                    ? 'bg-primary text-canvas font-bold'
                    : hasEntry
                    ? 'bg-surface text-fg hover:bg-surface-hover'
                    : 'text-fg-muted hover:bg-surface-hover'
                }`}
              >
                {day}
                {hasEntry && !isToday && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                )}
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <div className="mt-auto pt-4 border-t border-border space-y-1.5">
          <div className="text-[10px] text-fg-placeholder uppercase tracking-wider mb-2">Entry Types</div>
          {(['Trade', 'Analysis', 'Note', 'Review'] as EntryType[]).map(t => (
            <div key={t} className="flex items-center gap-2">
              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono ${TYPE_COLORS[t]}`}>{t}</span>
              <span className="text-[10px] text-fg-placeholder">{MOCK_ENTRIES.filter(e => e.type === t).length} entries</span>
            </div>
          ))}
        </div>
      </aside>

      {/* Right: Entry list */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-default">
          <div className="flex items-center gap-2">
            <BookOpen size={14} className="text-primary" />
            <span className="text-sm font-medium text-fg">Journal Entries</span>
            <span className="text-xs text-fg-muted font-mono">{MOCK_ENTRIES.length}</span>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary text-canvas text-xs font-medium rounded-md hover:bg-primary-hover transition-colors"
          >
            <Plus size={12} />
            New Entry
          </button>
        </div>

        {/* Inline form */}
        {showForm && (
          <div className="px-4 py-4 border-b border-border bg-surface-dark space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <input
                type="date"
                value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
                className="px-3 py-2 bg-surface border border-border rounded-md text-sm text-fg focus:outline-none focus:border-primary font-mono"
              />
              <input
                placeholder="Symbol"
                value={form.symbol}
                onChange={e => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
                className="px-3 py-2 bg-surface border border-border rounded-md text-sm text-fg placeholder:text-fg-placeholder focus:outline-none focus:border-primary font-mono"
              />
              <select
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value as EntryType })}
                className="px-3 py-2 bg-surface border border-border rounded-md text-sm text-fg focus:outline-none focus:border-primary"
              >
                <option value="Trade">Trade</option>
                <option value="Analysis">Analysis</option>
                <option value="Note">Note</option>
                <option value="Review">Review</option>
              </select>
            </div>
            <textarea
              placeholder="Write your entry..."
              value={form.content}
              onChange={e => setForm({ ...form, content: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 bg-surface border border-border rounded-md text-sm text-fg placeholder:text-fg-placeholder focus:outline-none focus:border-primary resize-none"
            />
            <input
              placeholder="Tags (comma separated)"
              value={form.tags}
              onChange={e => setForm({ ...form, tags: e.target.value })}
              className="w-full px-3 py-2 bg-surface border border-border rounded-md text-sm text-fg placeholder:text-fg-placeholder focus:outline-none focus:border-primary font-mono"
            />
            <div className="flex gap-2">
              <button className="px-4 py-1.5 bg-primary text-canvas text-xs font-medium rounded-md hover:bg-primary-hover transition-colors">Save</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-1.5 bg-surface border border-border text-xs text-fg-muted rounded-md hover:border-border-hover transition-colors">Cancel</button>
            </div>
          </div>
        )}

        {/* Entries */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {MOCK_ENTRIES.map(entry => (
            <div key={entry.id} className="bg-default border border-border rounded-lg p-4 hover:border-border-hover transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Calendar size={12} className="text-fg-muted" />
                  <span className="text-xs text-fg-muted font-mono">{entry.date}</span>
                  <span className="px-2 py-0.5 bg-surface border border-border-subtle rounded text-[10px] font-mono font-medium text-fg-secondary">
                    {entry.symbol}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium ${TYPE_COLORS[entry.type]}`}>
                    {entry.type}
                  </span>
                </div>
                <Stars rating={entry.rating} />
              </div>
              <p className="text-sm text-fg-secondary leading-relaxed">{entry.content}</p>
              <div className="flex items-center gap-1.5 mt-3">
                <Tag size={10} className="text-fg-placeholder" />
                {entry.tags.map(t => (
                  <span key={t} className="px-1.5 py-0.5 bg-surface rounded text-[10px] text-fg-muted font-mono">#{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
