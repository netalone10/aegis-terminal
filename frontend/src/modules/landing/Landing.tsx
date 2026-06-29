import { NavLink } from 'react-router-dom'
import { Zap, Shield, ChevronRight } from 'lucide-react'

const features = [
  { code: 'SMC', title: 'SMC / ICT Engine', desc: 'Order blocks, FVGs, liquidity sweeps, and market structure mapped in real-time. Institutional-grade smart money concepts on autopilot.' },
  { code: 'MKT', title: 'Live Market Data', desc: 'Real-time price feeds, volume profiles, and multi-timeframe analysis across crypto, forex, and equities.' },
  { code: 'MAC', title: 'Macro Regime Analysis', desc: 'Track DXY, yields, risk-on/off regimes, and macro shifts that drive asset prices. Know the environment before you trade.' },
  { code: 'AI', title: 'AI-Powered Analysis', desc: 'GPT-driven trade ideas, multi-agent debates, and sentiment synthesis. Let AI surface setups while you focus on execution.' },
  { code: 'SCN', title: 'IDX Stock Scanner', desc: 'Score every stock on technicals, momentum, and volume. Filter by index, sector, or custom criteria.' },
  { code: 'PRT', title: 'Portfolio Tracking', desc: 'Monitor holdings, P&L, and allocation in real-time. Know exactly where you stand without leaving the terminal.' },
  { code: 'CHT', title: 'Chart Lab', desc: 'Advanced charting with Bollinger squeezes, Fibonacci grids, multi-timeframe overlays, and volume confirmation.' },
  { code: 'JRN', title: 'Trading Journal', desc: 'Log entries, tag setups, track win rate by strategy. Review and refine your edge with structured documentation.' },
]

const steps = [
  { num: '01', title: 'Connect & Scan', desc: 'Launch the terminal. The scanner surfaces high-probability setups across markets — SMC zones, volume breakouts, macro shifts.' },
  { num: '02', title: 'Analyze & Validate', desc: 'Deep-dive with AI analysis, multi-timeframe alignment, and institutional flow data. Every signal backed by multiple confirmations.' },
  { num: '03', title: 'Execute & Journal', desc: 'Take the trade with conviction. Log it in the journal. Review performance. Compound your edge over time.' },
]

export default function Landing() {
  return (
    <div>
      {/* Hero */}
      <section className="kt-hero">
        <div className="kt-hero-copy">
          <div className="kt-eyebrow"><Zap size={12} /> <b>Institutional-Grade</b> Trading Terminal</div>
          <h1 className="kt-hero-title">
            Trade Smarter. <span>See Everything.</span>
          </h1>
          <p className="kt-hero-sub">
            Aegis Terminal unifies SMC/ICT analysis, macro regime tracking, AI-powered insights, and portfolio management into one professional trading cockpit.
          </p>
          <div className="kt-hero-actions">
            <NavLink className="kt-btn kt-btn-primary" to="/">Launch Terminal</NavLink>
            <NavLink className="kt-btn" to="/market">Live Market</NavLink>
            <a className="kt-btn" href="#features">Explore Features</a>
          </div>

          <div className="kt-mini-stats">
            <div className="kt-mini-stat"><b>8</b><span>Integrated Modules</span></div>
            <div className="kt-mini-stat"><b>&lt;50ms</b><span>Data Latency</span></div>
            <div className="kt-mini-stat"><b>24/7</b><span>Market Coverage</span></div>
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
            <p>Eight integrated modules. One terminal. Zero compromise.</p>
          </div>
          <span className="kt-pill">8 Core Areas</span>
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
            <h2>No noise. No fluff. Just signal.</h2>
            <p>Built on one principle: every piece of data should help you make a better decision.</p>
          </div>
          <span className="kt-pill"><Shield size={12} /> PHILOSOPHY</span>
        </div>
        <div className="kt-card kt-card-pad">
          <p style={{ color: 'var(--kt-text2)', fontSize: 15, lineHeight: 1.75, marginBottom: 20 }}>
            Aegis Terminal combines institutional frameworks (SMC, ICT, Wyckoff) with modern AI to cut through market noise and surface what matters. No hype, no alerts spam — just structured analysis for serious traders.
          </p>
          <div className="kt-stat-grid kt-stat-grid-4">
            <div className="kt-stat">
              <div className="kt-stat-label">Multi-TF</div>
              <div className="kt-stat-value gold">Confluence</div>
            </div>
            <div className="kt-stat">
              <div className="kt-stat-label">Regime</div>
              <div className="kt-stat-value gold">Macro-Aware</div>
            </div>
            <div className="kt-stat">
              <div className="kt-stat-label">AI</div>
              <div className="kt-stat-value gold">Synthesis</div>
            </div>
            <div className="kt-stat">
              <div className="kt-stat-label">Journal</div>
              <div className="kt-stat-value gold">Structured</div>
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
            Launch Aegis Terminal and start seeing the market the way institutions do.
          </p>
          <div className="kt-hero-actions" style={{ justifyContent: 'center', marginTop: 28 }}>
            <NavLink className="kt-btn kt-btn-primary" to="/">Get Started</NavLink>
            <NavLink className="kt-btn" to="/market">See Live Data</NavLink>
          </div>
        </div>
      </section>
    </div>
  )
}
