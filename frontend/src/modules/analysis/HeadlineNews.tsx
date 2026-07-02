import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Newspaper, RefreshCw, ExternalLink, Filter } from 'lucide-react'
import { api } from '../../lib/api'

type NewsItem = {
  title: string
  link: string
  description: string
  pubDate: string | null
  source: string
  category: string
}

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'macro', label: 'Macro' },
  { key: 'stocks', label: 'Stocks' },
  { key: 'crypto', label: 'Crypto' },
] as const

const CATEGORY_COLORS: Record<string, string> = {
  macro: 'badge-info',
  stocks: '',
  crypto: 'gold',
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function HeadlineNews() {
  const [category, setCategory] = useState<string>('all')
  const [expanded, setExpanded] = useState<number | null>(null)

  const { data: news = [], isLoading, refetch, isFetching } = useQuery<NewsItem[]>({
    queryKey: ['news', category],
    queryFn: () => api(`/api/news/latest?category=${category}&limit=30`),
    staleTime: 120_000,
    refetchInterval: 180_000,
    retry: false,
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Newspaper size={18} className="text-primary" />
          <h1 className="text-lg font-semibold">Headline News</h1>
        </div>
        <button
          onClick={() => refetch()}
          className="btn-ghost text-xs flex items-center gap-1"
          disabled={isFetching}
        >
          <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Category Filter */}
      <div className="flex items-center gap-2">
        <Filter size={14} className="text-muted" />
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => setCategory(cat.key)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              category === cat.key
                ? 'bg-primary-bg text-primary-hover'
                : 'text-muted hover:text-ink hover:bg-surface-hover'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* News List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="kt-card animate-pulse">
              <div className="h-4 bg-surface-hover rounded w-3/4 mb-2" />
              <div className="h-3 bg-surface-hover rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : news.length === 0 ? (
        <div className="kt-card text-center py-8 text-muted">
          <Newspaper size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No news available</p>
        </div>
      ) : (
        <div className="space-y-2">
          {news.map((item, i) => (
            <div
              key={i}
              className="kt-card cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`badge text-[10px] ${CATEGORY_COLORS[item.category] || ''}`}>
                      {item.category}
                    </span>
                    <span className="text-[10px] text-muted">{item.source}</span>
                    {item.pubDate && (
                      <span className="text-[10px] text-muted">{timeAgo(item.pubDate)}</span>
                    )}
                  </div>
                  <h3 className="text-sm font-medium leading-snug">{item.title}</h3>
                  {expanded === i && item.description && (
                    <p className="text-xs text-muted mt-2 leading-relaxed">{item.description}</p>
                  )}
                </div>
                {item.link && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-muted hover:text-primary flex-shrink-0"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="text-[10px] text-muted text-center pt-2">
        Aggregated from Yahoo Finance, CNBC, Investing.com, CoinDesk, CoinTelegraph
      </div>
    </div>
  )
}
