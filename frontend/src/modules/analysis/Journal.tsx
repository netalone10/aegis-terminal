import { useState } from 'react'
import { Calendar, Plus, Star, Tag, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react'

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
  Trade: 'chip-primary', Analysis: 'chip-info', Note: 'chip-warning', Review: 'chip-muted',
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={12} className={i <= rating ? 'text-warning fill-warning' : 'text-fg-placeholder/40'} />
      ))}
    </div>
  )
}

export default function Journal() {
  const [showForm, setShowForm] = useState(false)
  const [monthOffset, setMonthOffset] = useState(0)
  const [form, setForm] = useState({ date: '', symbol: '', type: 'Trade' as EntryType, content: '', tags: '' })

  const now = new Date(2026, 5 + monthOffset, 1)
  const year = now.getFullYear()
  const month = now.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' })
  const entryDates = new Set(MOCK_ENTRIES.map(e => e.date))

  return (
    <div className="flex h-full">
      {/* Left: Calendar */}
      <aside className="w-72 shrink-0 border-r border-border/40 bg-surface-dark/40 backdrop-blur-sm p-4 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[13px] font-semibold text-fg">{monthName}</span>
          <div className="flex gap-1">
            <button onClick={() => setMonthOffset(m => m - 1)} className="p-1.5 text-fg-muted hover:text-fg transition-colors rounded-lg hover:bg-surface-hover/50">
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => setMonthOffset(m => m + 1)} className="p-1.5 text-fg-muted hover:text-fg transition-colors rounded-lg hover:bg-surface-hover/50">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAYS.map(d => (
            <div key={d} className="text-center text-[9px] text-fg-placeholder uppercase tracking-widest py-1 font-mono">{d}</div>
          ))}
        </div>

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
                className={`relative h-8 rounded-lg text-[12px] font-mono transition-all ${
                  isToday
                    ? 'bg-gradient-to-r from-primary to-primary-hover text-canvas font-bold shadow-[0_0_10px_rgba(62,207,142,0.2)]'
                    : hasEntry
                    ? 'bg-surface/80 text-fg hover:bg-surface-hover border border-border/30'
                    : 'text-fg-muted hover:bg-surface-hover/50'
                }`}
              >
                {day}
                {hasEntry && !isToday && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                )}
              </button>
            )
          })}
        </div>

        <div className="mt-auto pt-4 border-t border-border/30 space-y-2">
          <div className="text-[10px] text-fg-placeholder uppercase tracking-widest font-mono mb-2">Entry Types</div>
          {(['Trade', 'Analysis', 'Note', 'Review'] as EntryType[]).map(t => (
            <div key={t} className="flex items-center gap-2">
              <span className={`chip ${TYPE_COLORS[t]}`}>{t}</span>
              <span className="text-[10px] text-fg-placeholder font-mono">{MOCK_ENTRIES.filter(e => e.type === t).length}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* Right: Entry list */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/40 bg-surface-dark/40 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <BookOpen size={14} className="text-primary" />
            <span className="text-[13px] font-medium text-fg">Journal Entries</span>
            <span className="text-[11px] text-fg-muted font-mono">{MOCK_ENTRIES.length}</span>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-primary to-primary-hover text-canvas text-[12px] font-semibold rounded-lg hover:shadow-[0_0_15px_rgba(62,207,142,0.2)] transition-all"
          >
            <Plus size={12} />
            New Entry
          </button>
        </div>

        {showForm && (
          <div className="px-5 py-4 border-b border-border/30 bg-surface-dark/60 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                className="px-3 py-2 glass text-[13px] text-fg focus:outline-none focus:border-primary/50 font-mono rounded-lg" />
              <input placeholder="Symbol" value={form.symbol} onChange={e => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
                className="px-3 py-2 glass text-[13px] text-fg placeholder:text-fg-placeholder focus:outline-none focus:border-primary/50 font-mono rounded-lg" />
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as EntryType })}
                className="px-3 py-2 glass text-[13px] text-fg focus:outline-none focus:border-primary/50 rounded-lg">
                <option value="Trade">Trade</option><option value="Analysis">Analysis</option><option value="Note">Note</option><option value="Review">Review</option>
              </select>
            </div>
            <textarea placeholder="Write your entry..." value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} rows={3}
              className="w-full px-3 py-2 glass text-[13px] text-fg placeholder:text-fg-placeholder focus:outline-none focus:border-primary/50 resize-none rounded-lg" />
            <input placeholder="Tags (comma separated)" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })}
              className="w-full px-3 py-2 glass text-[13px] text-fg placeholder:text-fg-placeholder focus:outline-none focus:border-primary/50 font-mono rounded-lg" />
            <div className="flex gap-2">
              <button className="px-5 py-2 bg-primary text-canvas text-[12px] font-semibold rounded-lg hover:bg-primary-hover transition-colors">Save</button>
              <button onClick={() => setShowForm(false)} className="px-5 py-2 glass text-[12px] text-fg-muted rounded-lg hover:text-fg-secondary transition-colors">Cancel</button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto p-5 space-y-3">
          {MOCK_ENTRIES.map(entry => (
            <div key={entry.id} className="glass glass-hover gradient-border p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Calendar size={12} className="text-fg-muted" />
                  <span className="text-[11px] text-fg-muted font-mono">{entry.date}</span>
                  <span className="chip chip-muted">{entry.symbol}</span>
                  <span className={`chip ${TYPE_COLORS[entry.type]}`}>{entry.type}</span>
                </div>
                <Stars rating={entry.rating} />
              </div>
              <p className="text-[13px] text-fg-secondary leading-relaxed">{entry.content}</p>
              <div className="flex items-center gap-1.5 mt-3">
                <Tag size={10} className="text-fg-placeholder" />
                {entry.tags.map(t => (
                  <span key={t} className="px-1.5 py-0.5 bg-surface/60 rounded text-[10px] text-fg-muted font-mono">#{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
