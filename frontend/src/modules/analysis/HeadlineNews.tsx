import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Newspaper, RefreshCw, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../../lib/api'

/* ═══ TYPES ═══ */

type NewsItem = {
  title: string
  link: string
  description: string
  pubDate: string | null
  source: string
  category: string
}

/* ═══ HELPERS ═══ */

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const CAT_TABS = [
  { key: 'all', label: 'ALL', color: 'var(--kt-text)' },
  { key: 'macro', label: 'MACRO', color: '#60a5fa' },
  { key: 'stocks', label: 'STOCKS', color: '#a78bfa' },
  { key: 'crypto', label: 'CRYPTO', color: '#f59e0b' },
] as const

const CAT_COLORS: Record<string, string> = {
  macro: '#60a5fa',
  stocks: '#a78bfa',
  crypto: '#f59e0b',
}

/* ═══ MAIN ═══ */

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Newspaper size={16} style={{ color: 'var(--kt-gold)' }} />
          <span style={{ fontSize: 14, fontWeight: 700 }}>Headline News</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--kt-muted)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50', background: isFetching ? '#f59e0b' : '#22c55e', boxShadow: `0 0 6px ${isFetching ? '#f59e0b' : '#22c55e'}` }} />
            <span>{isFetching ? 'UPDATING' : `${news.length} items`}</span>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8,
            background: 'var(--kt-bg2)', border: '1px solid var(--kt-border)', color: 'var(--kt-text2)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <RefreshCw size={12} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* ── Category Tabs ── */}
      <div style={{ display: 'flex', gap: 2, background: 'var(--kt-bg2)', borderRadius: 8, padding: 3, border: '1px solid var(--kt-border)' }}>
        {CAT_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setCategory(tab.key)}
            style={{
              flex: 1, padding: '7px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              fontFamily: 'var(--font-mono)', letterSpacing: 0.5, border: 'none', cursor: 'pointer',
              transition: 'all 0.15s',
              background: category === tab.key ? 'var(--kt-gold)' : 'transparent',
              color: category === tab.key ? '#000' : 'var(--kt-text2)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── News Feed ── */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{ background: 'var(--kt-bg2)', borderRadius: 12, padding: 16, border: '1px solid var(--kt-border)' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 40, height: 12, borderRadius: 4, background: 'var(--kt-bg3)' }} />
                <div style={{ width: 60, height: 12, borderRadius: 4, background: 'var(--kt-bg3)' }} />
                <div style={{ width: 30, height: 12, borderRadius: 4, background: 'var(--kt-bg3)' }} />
              </div>
              <div style={{ width: '80%', height: 14, borderRadius: 4, background: 'var(--kt-bg3)', marginBottom: 6 }} />
              <div style={{ width: '50%', height: 10, borderRadius: 4, background: 'var(--kt-bg3)' }} />
            </div>
          ))}
        </div>
      ) : news.length === 0 ? (
        <div style={{
          background: 'var(--kt-bg2)', borderRadius: 12, border: '1px solid var(--kt-border)',
          textAlign: 'center', padding: '40px 16px',
        }}>
          <Newspaper size={36} style={{ color: 'var(--kt-muted)', opacity: 0.3, marginBottom: 12 }} />
          <p style={{ fontSize: 13, color: 'var(--kt-muted)' }}>No news available</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {news.map((item, i) => {
            const isExpanded = expanded === i
            const catColor = CAT_COLORS[item.category] ?? 'var(--kt-muted)'
            return (
              <div
                key={i}
                onClick={() => setExpanded(isExpanded ? null : i)}
                style={{
                  background: 'var(--kt-bg2)', borderRadius: 12, border: '1px solid var(--kt-border)',
                  padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.15s',
                  borderColor: isExpanded ? `${catColor}40` : 'var(--kt-border)',
                }}
              >
                {/* Meta row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
                    padding: '2px 8px', borderRadius: 4,
                    background: `${catColor}18`, color: catColor,
                  }}>
                    {item.category}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--kt-muted)', fontFamily: 'var(--font-mono)' }}>
                    {item.source}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--kt-dim)' }}>·</span>
                  <span style={{ fontSize: 10, color: 'var(--kt-dim)' }}>
                    {timeAgo(item.pubDate)}
                  </span>
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {item.link && (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ color: 'var(--kt-muted)', display: 'flex' }}
                      >
                        <ExternalLink size={12} />
                      </a>
                    )}
                    {isExpanded ? <ChevronUp size={12} style={{ color: 'var(--kt-muted)' }} /> : <ChevronDown size={12} style={{ color: 'var(--kt-muted)' }} />}
                  </div>
                </div>

                {/* Title */}
                <h3 style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, margin: 0 }}>
                  {item.title}
                </h3>

                {/* Description (expanded) */}
                {isExpanded && item.description && (
                  <p style={{ fontSize: 12, color: 'var(--kt-muted)', marginTop: 8, lineHeight: 1.6 }}>
                    {item.description}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ fontSize: 10, color: 'var(--kt-dim)', textAlign: 'center', paddingTop: 4 }}>
        Aggregated from Yahoo Finance, CNBC, Investing.com, CoinDesk, CoinTelegraph
      </div>
    </div>
  )
}
