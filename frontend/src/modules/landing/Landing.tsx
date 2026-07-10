import { NavLink } from 'react-router-dom'
import { Zap, Shield, ChevronRight, BarChart3, Calendar, Crosshair, Globe, Search, Briefcase, ScrollText } from 'lucide-react'

const features = [
  { code: 'RPT', title: 'Session Reports', desc: 'Analisis sesi Asia, London, dan New York. Data aktual dari SMC engine, bukan opini semata.', icon: ScrollText },
  { code: 'CAL', title: 'Economic Calendar', desc: 'Kalender ekonomi + Gold Bias indicator. Deteksi event USD → arah XAU otomatis.', icon: Calendar },
  { code: 'SMC', title: 'SMC Multi-TF', desc: 'Order Block, FVG, BSL/SSL dari candle OHLCV asli. Konfluensi multi-timeframe.', icon: Crosshair },
  { code: 'SCN', title: 'Market Scanner', desc: 'Live forex rates + SMC screener. 8+ pairs dengan auto-detect setup terkuat.', icon: Search },
  { code: 'REG', title: 'Regime Analysis', desc: 'Monitor DXY, yields, risk-on/off regimes. Tahu lingkungan sebelum trade.', icon: Globe },
  { code: 'TRS', title: 'Trade Suite', desc: 'Journal + Portfolio + Position Sizing + Trade Manager. Semua tersimpan di database.', icon: Briefcase },
]

const reports = [
  {
    badge: 'Daily · New York',
    date: 'Jumat, 19 Juni 2026',
    pairs: 'GBPJPY',
    snippet: 'CPI Jepang Mei 1.5% vs ekspektasi 1.6%, menjaga narasi reflasi JPY valid. Penjualan ritel Inggris 1.2% MoM, memperkuat metrik konsumsi GBP.',
  },
  {
    badge: 'Weekly Outlook',
    date: 'Minggu, 14 Juni 2026',
    pairs: 'XAU/USD · DXY · IDR',
    snippet: 'Pekan krusial: FOMC, BOJ, BOE, RBA, SNB, Bank Indonesia — volatilitas tinggi dan penataan ulang di pasar valuta global.',
  },
  {
    badge: 'Daily · Asia-London',
    date: 'Senin, 16 Juni 2026',
    pairs: 'EUR · AUD · JPY',
    snippet: 'RBA menahan suku bunga. Data ZEW Eropa melampaui ekspektasi. Fokus bergeser ke 17-18 Juni sebagai resolusi utama.',
  },
]

export default function Landing() {
  return (
    <div>

      {/* Hero */}
      <section className="kt-hero">
        <div className="kt-hero-copy">
          <div className="kt-eyebrow"><Zap size={12} /> <b>Early Access</b> · Institutional Grade</div>
          <h1 className="kt-hero-title">
            Baca pasar seperti <span>institutional trader.</span>
          </h1>
          <p className="kt-hero-sub">
            Aegis Terminal menghadirkan analisis SMC/ICT, riset makro, dan AI-powered insights — framework berpikir pasar yang sesungguhnya. Bukan sekadar sinyal.
          </p>
          <div className="kt-hero-actions">
            <NavLink className="kt-btn kt-btn-primary" to="/market">Buka Terminal</NavLink>
            <NavLink className="kt-btn" to="/rates">Market Live</NavLink>
            <a className="kt-btn" href="#features">Jelajahi Fitur</a>
          </div>

          <div className="kt-mini-stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="kt-mini-stat"><b>6+</b><span>Modul Terintegrasi</span></div>
            <div className="kt-mini-stat"><b>3</b><span>Sesi Harian</span></div>
            <div className="kt-mini-stat"><b>8+</b><span>Pairs Dianalisis</span></div>
            <div className="kt-mini-stat"><b>2026</b><span>Aktif Sejak</span></div>
          </div>
        </div>

        <div className="kt-terminal-card">
          <div className="kt-terminal-bar">
            <div className="kt-dots"><i /><i /><i /></div>
            <div className="kt-terminal-code">AEGIS TERMINAL · LIVE</div>
          </div>
          <div className="kt-terminal-body">
            <div className="kt-terminal-row">
              <div className="code">01</div>
              <div><b>XAU/USD</b><br /><span>SMC ENGINE · KILLZONE ACTIVE</span></div>
              <em className="up">BULLISH 87%</em>
            </div>
            <div className="kt-terminal-row">
              <div className="code">02</div>
              <div><b>EUR/USD</b><br /><span>STRUCTURE · DISCOUNT ZONE</span></div>
              <em className="up">BULLISH 90%</em>
            </div>
            <div className="kt-terminal-row">
              <div className="code">03</div>
              <div><b>BTC/USD</b><br /><span>MACRO · RISK-ON REGIME</span></div>
              <em className="dn">BEARISH 65%</em>
            </div>
            <div className="kt-terminal-row">
              <div className="code">04</div>
              <div><b>IDX SCANNER</b><br /><span>12 FILTERS · 3 CANDIDATES</span></div>
              <em className="up">SCANNING</em>
            </div>
            <div className="kt-gridline" />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="kt-section" id="features">
        <div className="kt-section-head">
          <div>
            <h2>Riset & eksekusi dalam satu terminal.</h2>
            <p>Enam modul inti. Terintegrasi penuh. Tanpa kompromi.</p>
          </div>
          <span className="kt-pill">6 Modul Inti</span>
        </div>
        <div className="kt-module-grid">
          {features.map((f) => (
            <NavLink className="kt-module" to="/" key={f.code}>
              <div className="code">{f.code}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </NavLink>
          ))}
        </div>
      </section>

      {/* Sample Reports */}
      <section className="kt-section">
        <div className="kt-section-head">
          <div>
            <h2>Contoh laporan harian.</h2>
            <p>Data aktual dari SMC engine dan analis makro.</p>
          </div>
          <span className="kt-pill"><BarChart3 size={12} /> SAMPLES</span>
        </div>
        <div className="kt-grid-3">
          {reports.map((r, i) => (
            <div className="kt-card" key={i}>
              <div style={{ padding: 18 }}>
                <div style={{ marginBottom: 12 }}>
                  <span className="kt-tag gold">{r.badge}</span>
                </div>
                <div style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)', letterSpacing: '1.4px', textTransform: 'uppercase', marginBottom: 8 }}>
                  {r.date}
                </div>
                <div style={{ color: 'var(--kt-gold)', fontSize: 15, fontWeight: 700, marginBottom: 10, fontFamily: 'var(--font-mono)' }}>
                  {r.pairs}
                </div>
                <p style={{ color: 'var(--kt-text2)', fontSize: 'var(--sm)', lineHeight: 1.65, marginBottom: 14 }}>
                  {r.snippet}
                </p>
                <span style={{ color: 'var(--kt-gold)', fontSize: 'var(--xs)', letterSpacing: '1.2px', textTransform: 'uppercase', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  Baca selengkapnya <ChevronRight size={12} />
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Philosophy */}
      <section className="kt-section">
        <div className="kt-section-head">
          <div>
            <h2>Tanpa noise. Tanpa basa-basi. Hanya data.</h2>
            <p>Setiap titik data harus membantu keputusan trading Anda.</p>
          </div>
          <span className="kt-pill"><Shield size={12} /> FILOSOFI</span>
        </div>
        <div className="kt-card kt-card-pad">
          <p style={{ color: 'var(--kt-text2)', fontSize: 15, lineHeight: 1.75, marginBottom: 20 }}>
            Aegis Terminal memadukan framework institusional (SMC, ICT, Wyckoff) dengan AI modern untuk menembus noise pasar dan menyajikan apa yang penting. Tanpa hype, tanpa spam alert — hanya analisis terstruktur untuk trader serius.
          </p>
          <div className="kt-stat-grid kt-stat-grid-4">
            <div className="kt-stat">
              <div className="kt-stat-label">Multi-TF</div>
              <div className="kt-stat-value gold">Konfluens</div>
            </div>
            <div className="kt-stat">
              <div className="kt-stat-label">Regime</div>
              <div className="kt-stat-value gold">Aware Makro</div>
            </div>
            <div className="kt-stat">
              <div className="kt-stat-label">AI</div>
              <div className="kt-stat-value gold">Sintesis</div>
            </div>
            <div className="kt-stat">
              <div className="kt-stat-label">Jurnal</div>
              <div className="kt-stat-value gold">Terstruktur</div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="kt-section" style={{ marginBottom: 40 }}>
        <div className="kt-card kt-card-pad" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <h2 style={{ color: 'var(--kt-text)', fontSize: 26, letterSpacing: -1, fontWeight: 700 }}>
            Siap upgrade cara baca pasar?
          </h2>
          <p style={{ color: 'var(--kt-muted)', marginTop: 10, fontSize: 14, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
            Buka Aegis Terminal dan lihat pasar seperti institusi.
          </p>
          <div className="kt-hero-actions" style={{ justifyContent: 'center', marginTop: 28 }}>
            <NavLink className="kt-btn kt-btn-primary" to="/market">Buka Terminal</NavLink>
            <NavLink className="kt-btn" to="/rates">Lihat Data Live</NavLink>
          </div>
        </div>
      </section>
    </div>
  )
}
