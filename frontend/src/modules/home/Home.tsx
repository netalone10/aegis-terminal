import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'

const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

const modules = [
  { code: 'SMC', title: 'SMC / ICT Engine', desc: 'Bias, liquidity pool, order block, FVG, premium discount, killzone.', to: '/decision' },
  { code: 'MKT', title: 'Live Market Workspace', desc: 'Quote forex, gold, crypto, indeks, dan market snapshot lintas aset.', to: '/market' },
  { code: 'MAC', title: 'Macro Regime', desc: 'Rates, inflation, growth, policy, dan risk regime untuk top-down context.', to: '/macro' },
  { code: 'CHT', title: 'Chart Lab', desc: 'Charting workspace untuk validasi struktur, level, dan execution zone.', to: '/chart' },
  { code: 'SCN', title: 'Scanner', desc: 'Filter setup, watchlist, dan kandidat trade sesuai rule engine.', to: '/scanner' },
  { code: 'JRN', title: 'Journal', desc: 'Catat eksekusi, invalidation, result, dan lesson dari tiap trade.', to: '/journal' },
  { code: 'AI', title: 'AI Assistant', desc: 'Ringkas context pasar, tanya setup, dan buat decision checklist.', to: '/ai' },
  { code: 'RTE', title: 'Rates & Bonds', desc: 'US yields, curve, Fed context, dan pressure ke gold / USD.', to: '/rates' },
]

function BiasBadge({ bias }: { bias?: string }) {
  if (bias === 'bullish') return <span className="badge-bull">Bullish</span>
  if (bias === 'bearish') return <span className="badge-bear">Bearish</span>
  return <span className="badge-neutral">Neutral</span>
}

export default function Home() {
  const { data: smcData } = useQuery<any>({
    queryKey: ['smc-batch'],
    queryFn: () => api('/api/smc/batch'),
    staleTime: 300_000,
    refetchInterval: 120_000,
    retry: false,
  })

  const { data: newsData } = useQuery<any[]>({
    queryKey: ['home-news'],
    queryFn: () => api('/api/news/latest'),
    staleTime: 300_000,
    retry: false,
  })

  const pairs = Array.isArray(smcData) ? smcData : (smcData?.data ?? [])
  const xau = pairs.find((p: any) => p.symbol === 'XAU/USD')
  const eur = pairs.find((p: any) => p.symbol === 'EUR/USD')
  const gbp = pairs.find((p: any) => p.symbol === 'GBP/USD')
  const mainPairs = [xau, eur, gbp].filter(Boolean)

  const newsItems = (newsData ?? []).slice(0, 4).map((n: any) => ({
    title: n.title ?? 'Untitled',
    source: n.source ?? 'Market',
    time: n.pubDate ? new Date(n.pubDate).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' }) : '—',
    link: n.link,
  }))

  return (
    <div>
      <section className="kt-hero">
        <div className="kt-hero-copy">
          <div className="kt-eyebrow"><b>V3.0</b> Telah Hadir</div>
          <h1 className="kt-hero-title">
            Satu terminal untuk membaca <span>macro, flow, SMC, dan eksekusi.</span>
          </h1>
          <p className="kt-hero-sub">
            Aegis Terminal menggabungkan live market data, SMC/ICT analysis, macro regime, dan workflow trading dalam satu workspace ringan untuk forex dan XAU/USD.
          </p>
          <div className="kt-hero-actions">
            <NavLink className="kt-btn kt-btn-primary" to="/decision">Buka SMC Engine</NavLink>
            <NavLink className="kt-btn" to="/market">Lihat Market</NavLink>
            <NavLink className="kt-btn" to="/macro">Macro Regime</NavLink>
          </div>

          <div className="kt-mini-stats">
            <div className="kt-mini-stat"><b>{pairs.length || 5}</b><span>Pairs monitored</span></div>
            <div className="kt-mini-stat"><b>{xau?.bias?.toUpperCase?.() ?? 'NEUTRAL'}</b><span>XAU/USD bias</span></div>
            <div className="kt-mini-stat"><b>{xau?.killZone?.replace('_', ' ')?.toUpperCase?.() ?? 'LIVE'}</b><span>Current session</span></div>
          </div>
        </div>

        <div className="kt-terminal-card">
          <div className="kt-terminal-bar">
            <div className="kt-dots"><i /><i /><i /></div>
            <div className="kt-terminal-code">TERMINAL PREVIEW · {today}</div>
          </div>
          <div className="kt-terminal-body">
            {(mainPairs.length ? mainPairs : [
              { symbol: 'XAU/USD', bias: 'neutral', confidence: 45, premiumDiscount: 'discount' },
              { symbol: 'EUR/USD', bias: 'bullish', confidence: 90, premiumDiscount: 'discount' },
              { symbol: 'GBP/USD', bias: 'bullish', confidence: 90, premiumDiscount: 'discount' },
            ]).map((pair: any, idx: number) => (
              <div className="kt-terminal-row" key={pair.symbol}>
                <div className="code">{String(idx + 1).padStart(2, '0')}</div>
                <div>
                  <b>{pair.symbol}</b><br />
                  <span>{pair.premiumDiscount?.toUpperCase?.() ?? 'ZONE'} · {pair.killZone?.replace('_', ' ')?.toUpperCase?.() ?? 'KILLZONE'}</span>
                </div>
                <em className={pair.bias === 'bearish' ? 'dn' : pair.bias === 'bullish' ? 'up' : ''}>{pair.confidence ?? 0}%</em>
              </div>
            ))}
            <div className="kt-gridline" />
          </div>
        </div>
      </section>

      <section className="kt-section">
        <div className="kt-section-head">
          <div>
            <h2>Fitur lengkap, tetap clean.</h2>
            <p>Delapan area inti untuk riset top-down sampai eksekusi.</p>
          </div>
          <span className="kt-pill">8 Core Areas</span>
        </div>
        <div className="kt-module-grid">
          {modules.map((m) => (
            <NavLink className="kt-module" to={m.to} key={m.code}>
              <div className="code">{m.code}</div>
              <h3>{m.title}</h3>
              <p>{m.desc}</p>
            </NavLink>
          ))}
        </div>
      </section>

      <section className="kt-section">
        <div className="kt-section-head">
          <div>
            <h2>Daily Research.</h2>
            <p>Bias utama dan headline context sesi berjalan.</p>
          </div>
          <span className="kt-pill">Auto Refresh</span>
        </div>
        <div className="kt-feature-grid">
          {(mainPairs.length ? mainPairs : []).map((pair: any) => (
            <div className="kt-feature" key={pair.symbol}>
              <div className="code">{pair.symbol}</div>
              <h3><BiasBadge bias={pair.bias} /> <span style={{ marginLeft: 8 }}>{pair.confidence}%</span></h3>
              <p>{(pair.signals ?? ['Waiting for BOS / CHoCH confirmation']).slice(0, 2).join(' · ')}</p>
            </div>
          ))}
          <div className="kt-feature">
            <div className="code">MACRO</div>
            <h3>Macro View</h3>
            <p>Fed & ECB hawkish. Gold sensitive to real yield, USD, and geopolitical risk premium.</p>
          </div>
        </div>
      </section>

      {newsItems.length > 0 && (
        <section className="kt-section">
          <div className="kt-section-head">
            <div>
              <h2>AI Context Headlines.</h2>
              <p>Latest market headlines for session awareness.</p>
            </div>
          </div>
          <div className="kt-card">
            {newsItems.map((item: any, i: number) => (
              <a className="kt-terminal-row" href={item.link} target="_blank" rel="noopener noreferrer" key={i} style={{ padding: '14px 18px' }}>
                <div className="code">N{String(i + 1).padStart(2, '0')}</div>
                <div>
                  <b>{item.title}</b><br />
                  <span>{item.source} · {item.time}</span>
                </div>
                <em>↗</em>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
