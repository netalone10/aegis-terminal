import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Building2, TrendingUp, TrendingDown, Minus, ExternalLink, Filter } from 'lucide-react'
import { api } from '../../lib/api'

type ResearchItem = {
  title: string
  source: string
  category: string
  summary: string
  link: string
  date: string
  bias?: 'bullish' | 'bearish' | 'neutral'
}

// Research sources that aggregate institutional views
const RESEARCH_SOURCES = [
  { key: 'all', label: 'All Sources' },
  { key: 'central-bank', label: 'Central Banks' },
  { key: 'institutional', label: 'Institutional' },
  { key: 'macro', label: 'Macro Research' },
] as const

// Static institutional research feeds (curated)
const RESEARCH_FEEDS = [
  { url: 'https://www.federalreserve.gov/feeds/press_all.xml', label: 'Federal Reserve', category: 'central-bank' },
  { url: 'https://www.ecb.europa.eu/rss/press.html', label: 'ECB', category: 'central-bank' },
  { url: 'https://www.imf.org/en/News/rss', label: 'IMF', category: 'institutional' },
  { url: 'https://www.bis.org/doclist/pressrelease.rss', label: 'BIS', category: 'institutional' },
  { url: 'https://www.investing.com/rss/news.rss', label: 'Investing.com', category: 'macro' },
]

function BiasIcon({ bias }: { bias?: string }) {
  if (bias === 'bullish') return <TrendingUp size={14} className="text-emerald-400" />
  if (bias === 'bearish') return <TrendingDown size={14} className="text-red-400" />
  return <Minus size={14} className="text-muted" />
}

// Fetch institutional research from CF Worker
async function fetchResearch(): Promise<ResearchItem[]> {
  try {
    // Use the news endpoint with macro/institutional categories
    const [macroNews, stocksNews] = await Promise.all([
      api<any[]>(`/api/news/latest?category=macro&limit=15`),
      api<any[]>(`/api/news/latest?category=stocks&limit=10`),
    ])

    const items: ResearchItem[] = []

    // Map macro news to research items
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

    // Map stock news to research
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

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function Research() {
  const [filter, setFilter] = useState<string>('all')

  const { data: research = [], isLoading } = useQuery<ResearchItem[]>({
    queryKey: ['research'],
    queryFn: fetchResearch,
    staleTime: 300_000,
    retry: false,
  })

  const filtered = filter === 'all' ? research : research.filter(r => r.category === filter)

  // Group by category
  const centralBank = filtered.filter(r => r.category === 'central-bank')
  const institutional = filtered.filter(r => r.category === 'institutional')
  const macroRes = filtered.filter(r => r.category === 'macro')

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BookOpen size={18} className="text-primary" />
        <h1 className="text-lg font-semibold">Research</h1>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter size={14} className="text-muted" />
        {RESEARCH_SOURCES.map(src => (
          <button
            key={src.key}
            onClick={() => setFilter(src.key)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              filter === src.key
                ? 'bg-primary-bg text-primary-hover'
                : 'text-muted hover:text-ink hover:bg-surface-hover'
            }`}
          >
            {src.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="kt-card animate-pulse">
              <div className="h-4 bg-surface-hover rounded w-3/4 mb-2" />
              <div className="h-3 bg-surface-hover rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Central Bank Section */}
          {(filter === 'all' || filter === 'central-bank') && centralBank.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Building2 size={14} className="text-primary" />
                <h2 className="text-sm font-semibold">Central Banks</h2>
                <span className="badge text-[10px]">{centralBank.length}</span>
              </div>
              <div className="space-y-2">
                {centralBank.slice(0, 8).map((item, i) => (
                  <a
                    key={i}
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="kt-card block hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] text-muted">{item.source}</span>
                          <span className="text-[10px] text-muted">{timeAgo(item.date)}</span>
                          <BiasIcon bias={item.bias} />
                        </div>
                        <h3 className="text-sm font-medium leading-snug">{item.title}</h3>
                        {item.summary && (
                          <p className="text-xs text-muted mt-1 line-clamp-2">{item.summary}</p>
                        )}
                      </div>
                      <ExternalLink size={12} className="text-muted flex-shrink-0 mt-1" />
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Institutional Section */}
          {(filter === 'all' || filter === 'institutional') && institutional.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Building2 size={14} className="text-amber-400" />
                <h2 className="text-sm font-semibold">Institutional</h2>
                <span className="badge text-[10px]">{institutional.length}</span>
              </div>
              <div className="space-y-2">
                {institutional.slice(0, 8).map((item, i) => (
                  <a
                    key={i}
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="kt-card block hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] text-muted">{item.source}</span>
                          <span className="text-[10px] text-muted">{timeAgo(item.date)}</span>
                        </div>
                        <h3 className="text-sm font-medium leading-snug">{item.title}</h3>
                        {item.summary && (
                          <p className="text-xs text-muted mt-1 line-clamp-2">{item.summary}</p>
                        )}
                      </div>
                      <ExternalLink size={12} className="text-muted flex-shrink-0 mt-1" />
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Macro Research Section */}
          {(filter === 'all' || filter === 'macro') && macroRes.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={14} className="text-emerald-400" />
                <h2 className="text-sm font-semibold">Macro Research</h2>
                <span className="badge text-[10px]">{macroRes.length}</span>
              </div>
              <div className="space-y-2">
                {macroRes.slice(0, 10).map((item, i) => (
                  <a
                    key={i}
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="kt-card block hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] text-muted">{item.source}</span>
                          <span className="text-[10px] text-muted">{timeAgo(item.date)}</span>
                          <BiasIcon bias={item.bias} />
                        </div>
                        <h3 className="text-sm font-medium leading-snug">{item.title}</h3>
                        {item.summary && (
                          <p className="text-xs text-muted mt-1 line-clamp-2">{item.summary}</p>
                        )}
                      </div>
                      <ExternalLink size={12} className="text-muted flex-shrink-0 mt-1" />
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="kt-card text-center py-8 text-muted">
              <BookOpen size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No research available</p>
            </div>
          )}
        </>
      )}

      {/* Sources */}
      <div className="text-[10px] text-muted text-center pt-2">
        Sources: Federal Reserve, ECB, IMF, BIS, Investing.com
      </div>
    </div>
  )
}
