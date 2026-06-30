import { NavLink } from 'react-router-dom'
import { Zap, Shield, ChevronRight } from 'lucide-react'

const features = [
  { code: 'SMC', title: 'Mesin SMC / ICT', desc: 'Order blocks, FVG, liquidity sweeps, and market structure mapped in real-time. Institutional smart money concepts on autopilot.' },
  { code: 'MKT', title: 'Data Market Live', desc: 'Real-time price feeds, volume profiles, and multi-timeframe analysis for crypto, forex, and stocks.' },
  { code: 'MAC', title: 'Analisis Regime Makro', desc: 'Monitor DXY, yields, risk-on/off regimes, and macro shifts that move prices. Know the environment before you trade.' },
  { code: 'AI', title: 'Analisis Berbasis AI', desc: 'AI trade ideas, multi-agent debate, and sentiment synthesis. AI finds setups, you focus on execution.' },
  { code: 'SCN', title: 'Scanner Saham IDX', desc: 'Score every stock by technicals, momentum, and volume. Filter by index, sector, or custom criteria.' },
  { code: 'PRT', title: 'Pelacakan Portofolio', desc: 'Track positions, P&L, and allocation in real-time. Know exactly where you stand without leaving the terminal.' },
  { code: 'CHT', title: 'Lab Chart', desc: 'Advanced charting with Bollinger squeeze, Fibonacci grid, multi-timeframe overlays, and volume confirmation.' },
  { code: 'JRN', title: 'Jurnal Trading', desc: 'Log entries, tag setups, track win rate per strategy. Review and sharpen your edge with structured documentation.' },
]

const steps = [
  { num: '01', title: 'Hubungkan & Scan', desc: 'Launch the terminal. Scanner finds high-probability setups across markets — SMC zones, volume breakouts, macro shifts.' },
  { num: '02', title: 'Analisis & Validasi', desc: 'Deep-dive with AI analysis, multi-timeframe alignment, and institutional flow data. Every signal confirmed multi-layer.' },
  { num: '03', title: 'Eksekusi & Jurnal', desc: 'Take trades with confidence. Log in journal. Review performance. Accumulate edge over time.' },
]

export default function Landing() {
  return (
    <div>
      {/* Hero */}
      <section className="kt-hero">
        <div className="kt-hero-copy">
          <div className="kt-eyebrow"><Zap size={12} /> <b>Kelas Institusional</b> Trading Terminal</div>
          <h1 className="kt-hero-title">
            Trade Smarter. <span>See Everything.</span>
          </h1>
          <p className="kt-hero-sub">
            Aegis Terminal unifies SMC/ICT analysis, macro regime tracking, AI-powered insights, and portfolio management in one professional trading cockpit.
          </p>
          <div className="kt-hero-actions">
            <NavLink className="kt-btn kt-btn-primary" to="/">Buka Terminal</NavLink>
            <NavLink className="kt-btn" to="/market">Market Live</NavLink>
            <a className="kt-btn" href="#features">Jelajahi Fitur</a>
          </div>

          <div className="kt-mini-stats">
            <div className="kt-mini-stat"><b>8</b><span>Modul Terintegrasi</span></div>
            <div className="kt-mini-stat"><b>&lt;50ms</b><span>Latensi Data</span></div>
            <div className="kt-mini-stat"><b>24/7</b><span>Cakupan Market</span></div>
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
            <h2>Everything a trader needs.</h2>
            <p>Eight integrated modules. One terminal. No compromises.</p>
          </div>
          <span className="kt-pill">8 Area Utama</span>
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

      {/* How It Works */}
      <section className="kt-section">
        <div className="kt-section-head">
          <div>
            <h2>Three steps to better trades.</h2>
            <p>From signal discovery to execution — streamlined.</p>
          </div>
          <span className="kt-pill">Workflow</span>
        </div>
        <div className="kt-card">
          {steps.map((s) => (
            <div className="kt-terminal-row" key={s.num} style={{ padding: '18px 20px' }}>
              <div className="code" style={{ fontSize: 22, fontWeight: 800 }}>{s.num}</div>
              <div>
                <b>{s.title}</b><br />
                <span>{s.desc}</span>
              </div>
              <ChevronRight size={16} style={{ color: 'var(--kt-muted)' }} />
            </div>
          ))}
        </div>
      </section>

      {/* Trust / Philosophy */}
      <section className="kt-section">
        <div className="kt-section-head">
          <div>
            <h2>Tanpa noise. Tanpa basa-basi. Hanya sinyal.</h2>
            <p>Built on one principle: every data point should help you make better decisions.</p>
          </div>
          <span className="kt-pill"><Shield size={12} /> FILOSOFI</span>
        </div>
        <div className="kt-card kt-card-pad">
          <p style={{ color: 'var(--kt-text2)', fontSize: 15, lineHeight: 1.75, marginBottom: 20 }}>
            Aegis Terminal blends institutional frameworks (SMC, ICT, Wyckoff) with modern AI to cut through market noise and surface what matters. No hype, no spam alerts — just structured analysis for serious traders.
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
            Ready to upgrade your trading?
          </h2>
          <p style={{ color: 'var(--kt-muted)', marginTop: 10, fontSize: 14, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
            Open Aegis Terminal and start seeing the market the way institutions do.
          </p>
          <div className="kt-hero-actions" style={{ justifyContent: 'center', marginTop: 28 }}>
            <NavLink className="kt-btn kt-btn-primary" to="/">Mulai Sekarang</NavLink>
            <NavLink className="kt-btn" to="/market">Lihat Data Live</NavLink>
          </div>
        </div>
      </section>
    </div>
  )
}
