import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Building2, TrendingUp, TrendingDown, Minus, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../../lib/api'

/* ═══ TYPES ═══ */

type ResearchItem = {
  title: string
  source: string
  category: string
  summary: string
  link: string
  date: string
  bias?: 'bullish' | 'bearish' | 'neutral'
}

/* ═══ CONSTANTS ═══ */

const FILTER_TABS = [
  { key: 'all', label: 'ALL', color: 'var(--kt-text)' },
  { key: 'central-bank', label: 'CENTRAL BANKS', color: '#60a5fa' },
  { key: 'institutional', label: 'INSTITUTIONAL', color: '#f59e0b' },
  { key: 'macro', label: 'MACRO', color: '#22c55e' },
] as const

const SECTION_CFG: Record<string, { icon: any; color: string; label: string }> = {
  'central-bank': { icon: Building2, color: '#60a5fa', label: 'Central Banks' },
  'institutional': { icon: Building2, color: '#f59e0b', label: 'Institutional' },
  'macro': { icon: TrendingUp, color: '#22c55e', label: 'Macro Research' },
}

/* ═══ HELPERS ═══ */

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function BiasIcon({ bias }: { bias?: string }) {
  if (bias === 'bullish') return <TrendingUp size={12} style={{ color: '#22c55e' }} />
  if (bias === 'bearish') return <TrendingDown size={12} style={{ color: '#ef4444' }} />
  return <Minus size={12} style={{ color: 'var(--kt-muted)' }} />
}

/* ═══ DATA FETCHER ═══ */

async function fetchResearch(): Promise<ResearchItem[]> {
  try {
    const [macroNews, stocksNews] = await Promise.all([
      api<any[]>(`/api/news/latest?category=macro&limit=15`),
      api<any[]>(`/api/news/latest?category=stocks&limit=10`),
    ])

    const items: ResearchItem[] = []

    for (const item of (macroNews || [])) {
      const lowerTitle = (item.title || '').toLowerCase()
      let bias: 'bullish' | 'bearish' | 'neutral' = 'neutral'
      if (lowerTitle.includes('rally') || lowerTitle.includes('surge') || lowerTitle.includes('bull')) bias = 'bullish'
      if (lowerTitle.includes('crash') || lowerTitle.includes('drop') || lowerTitle.includes('bear') || lowerTitle.includes('recession')) bias = 'bearish'

      items.push({
        title: item.title,
        source: item.source || 'Unknown',
        category: lowerTitle.includes('fed') || lowerTitle.includes('central bank') || lowerTitle.includes('rate')
          ? 'central-bank'
          : lowerTitle.includes('imf') || lowerTitle.includes('bis') || lowerTitle.includes('world bank')
            ? 'institutional'
            : 'macro',
        summary: item.description || '',
        link: item.link || '#',
        date: item.pubDate || new Date().toISOString(),
        bias,
      })
    }

    for (const item of (stocksNews || [])) {
      items.push({
        title: item.title,
        source: item.source || 'Unknown',
        category: 'institutional',
        summary: item.description || '',
        link: item.link || '#',
        date: item.pubDate || new Date().toISOString(),
      })
    }

    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  } catch {
    return []
  }
}

/* ═══ RESEARCH CARD ═══ */

function ResearchCard({ item, color }: { item: ResearchItem; color: string }) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'block', background: 'var(--kt-bg2)', borderRadius: 12,
        border: '1px solid var(--kt-border)', padding: '14px 16px',
        textDecoration: 'none', color: 'inherit', transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = `${color}40`)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--kt-border)')}
    >
      {/* Meta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
          padding: '2px 8px', borderRadius: 4,
          background: `${color}18`, color,
        }}>
          {item.category.replace('-', ' ')}
        </span>
        <span style={{ fontSize: 10, color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>
          {item.source}
        </span>
        <span style={{ fontSize: 10, color: 'var(--kt-dim)' }}>·</span>
        <span style={{ fontSize: 10, color: 'var(--kt-dim)' }}>
          {timeAgo(item.date)}
        </span>
        {item.bias && <BiasIcon bias={item.bias} />}
        <ExternalLink size={11} style={{ marginLeft: 'auto', color: 'var(--kt-muted)' }} />
      </div>

      {/* Title */}
      <h3 style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, margin: 0 }}>
        {item.title}
      </h3>

      {/* Summary */}
      {item.summary && (
        <p style={{ fontSize: 11, color: 'var(--kt-muted)', marginTop: 6, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {item.summary}
        </p>
      )}
    </a>
  )
}

/* ═══ SECTION ═══ */

function ResearchSection({ title, items, color, icon: Icon }: { title: string; items: ResearchItem[]; color: string; icon: any }) {
  const [expanded, setExpanded] = useState(true)
  const displayed = expanded ? items : items.slice(0, 3)

  return (
    <div style={{ background: 'var(--kt-bg2)', borderRadius: 12, border: '1px solid var(--kt-border)', overflow: 'hidden' }}>
      {/* Section Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', cursor: 'pointer', borderBottom: expanded ? '1px solid var(--kt-border)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon size={14} style={{ color }} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>{title}</span>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
            background: `${color}18`, color,
          }}>
            {items.length}
          </span>
        </div>
        {expanded ? <ChevronUp size={14} style={{ color: 'var(--kt-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--kt-muted)' }} />}
      </div>

      {/* Items */}
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {displayed.map((item, i) => (
            <div key={i} style={{ padding: '12px 16px', borderBottom: i < displayed.length - 1 ? '1px solid var(--kt-border)' : 'none' }}>
              <ResearchCard item={item} color={color} />
            </div>
          ))}
        </div>
      )}

      {/* Show more */}
      {!expanded && items.length > 3 && (
        <div style={{ padding: '8px 16px', textAlign: 'center' }}>
          <button
            onClick={() => setExpanded(true)}
            style={{ background: 'none', border: 'none', color: 'var(--kt-gold)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >
            Show all {items.length}
          </button>
        </div>
      )}
    </div>
  )
}

/* ═══ MAIN ═══ */

export default function Research() {
  const [filter, setFilter] = useState<string>('all')

  const { data: research = [], isLoading } = useQuery<ResearchItem[]>({
    queryKey: ['research'],
    queryFn: fetchResearch,
    staleTime: 300_000,
    retry: false,
  })

  const filtered = filter === 'all' ? research : research.filter(r => r.category === filter)

  const centralBank = filtered.filter(r => r.category === 'central-bank')
  const institutional = filtered.filter(r => r.category === 'institutional')
  const macroRes = filtered.filter(r => r.category === 'macro')

  const sections = [
    { key: 'central-bank', items: centralBank },
    { key: 'institutional', items: institutional },
    { key: 'macro', items: macroRes },
  ].filter(s => s.items.length > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <BookOpen size={16} style={{ color: 'var(--kt-gold)' }} />
        <span style={{ fontSize: 14, fontWeight: 700 }}>Research</span>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--kt-muted)' }}>
          {research.length} reports
        </span>
      </div>

      {/* ── Filter Tabs ── */}
      <div style={{ display: 'flex', gap: 2, background: 'var(--kt-bg2)', borderRadius: 8, padding: 3, border: '1px solid var(--kt-border)' }}>
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              flex: 1, padding: '7px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
              fontFamily: 'var(--font-mono)', letterSpacing: 0.5, border: 'none', cursor: 'pointer',
              transition: 'all 0.15s',
              background: filter === tab.key ? 'var(--kt-gold)' : 'transparent',
              color: filter === tab.key ? '#000' : 'var(--kt-text2)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ background: 'var(--kt-bg2)', borderRadius: 12, padding: 16, border: '1px solid var(--kt-border)' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 60, height: 12, borderRadius: 4, background: 'var(--kt-bg3)' }} />
                <div style={{ width: 40, height: 12, borderRadius: 4, background: 'var(--kt-bg3)' }} />
              </div>
              <div style={{ width: '85%', height: 14, borderRadius: 4, background: 'var(--kt-bg3)', marginBottom: 6 }} />
              <div style={{ width: '60%', height: 10, borderRadius: 4, background: 'var(--kt-bg3)' }} />
            </div>
          ))}
        </div>
      ) : sections.length === 0 ? (
        <div style={{
          background: 'var(--kt-bg2)', borderRadius: 12, border: '1px solid var(--kt-border)',
          textAlign: 'center', padding: '40px 16px',
        }}>
          <BookOpen size={36} style={{ color: 'var(--kt-muted)', opacity: 0.3, marginBottom: 12 }} />
          <p style={{ fontSize: 13, color: 'var(--kt-muted)' }}>No research available</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sections.map(s => {
            const cfg = SECTION_CFG[s.key] ?? { icon: BookOpen, color: 'var(--kt-muted)', label: s.key }
            return (
              <ResearchSection
                key={s.key}
                title={cfg.label}
                items={s.items}
                color={cfg.color}
                icon={cfg.icon}
              />
            )
          })}
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ fontSize: 10, color: 'var(--kt-dim)', textAlign: 'center', paddingTop: 4 }}>
        Sources: Federal Reserve, ECB, IMF, BIS, Investing.com
      </div>
    </div>
  )
}
