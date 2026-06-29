import { NavLink } from 'react-router-dom'
import { Zap, Shield, ChevronRight } from 'lucide-react'

const features = [
  { code: 'SMC', title: 'Mesin SMC / ICT', desc: 'Order block, FVG, liquidity sweep, dan market structure dipetakan real-time. Konsep smart money institusional diautopilot.' },
  { code: 'MKT', title: 'Data Market Live', desc: 'Feed harga real-time, profil volume, dan analisis multi-timeframe untuk kripto, forex, dan saham.' },
  { code: 'MAC', title: 'Analisis Regime Makro', desc: 'Pantau DXY, yield, regime risk-on/off, dan pergeseran makro yang menggerakkan harga. Kenali lingkungan sebelum trading.' },
  { code: 'AI', title: 'Analisis Berbasis AI', desc: 'Ide trade dari AI, debat multi-agent, dan sintesis sentimen. AI menemukan setup, lo fokus eksekusi.' },
  { code: 'SCN', title: 'Scanner Saham IDX', desc: 'Skor setiap saham dari teknikal, momentum, dan volume. Filter berdasarkan indeks, sektor, atau kriteria kustom.' },
  { code: 'PRT', title: 'Pelacakan Portofolio', desc: 'Pantau posisi, P&L, dan alokasi real-time. Tahu persis posisi lo tanpa keluar terminal.' },
  { code: 'CHT', title: 'Lab Chart', desc: 'Charting canggih dengan Bollinger squeeze, Fibonacci grid, overlay multi-timeframe, dan konfirmasi volume.' },
  { code: 'JRN', title: 'Jurnal Trading', desc: 'Catat entri, tag setup, lacak win rate per strategi. Review dan asah edge dengan dokumentasi terstruktur.' },
]

const steps = [
  { num: '01', title: 'Hubungkan & Scan', desc: 'Jalankan terminal. Scanner menemukan setup probabilitas tinggi di berbagai market — zona SMC, volume breakout, pergeseran makro.' },
  { num: '02', title: 'Analisis & Validasi', desc: 'Deep-dive dengan analisis AI, alignment multi-timeframe, dan data aliran institusional. Setiap sinyal dikonfirmasi multi-layer.' },
  { num: '03', title: 'Eksekusi & Jurnal', desc: 'Ambil trade dengan keyakinan. Catat di jurnal. Review performa. Kumulasi edge dari waktu ke waktu.' },
]

export default function Landing() {
  return (
    <div>
      {/* Hero */}
      <section className="kt-hero">
        <div className="kt-hero-copy">
          <div className="kt-eyebrow"><Zap size={12} /> <b>Kelas Institusional</b> Trading Terminal</div>
          <h1 className="kt-hero-title">
            Trade Lebih Cerdas. <span>Lihat Semuanya.</span>
          </h1>
          <p className="kt-hero-sub">
            Aegis Terminal menyatukan analisis SMC/ICT, pelacakan regime makro, insight berbasis AI, dan manajemen portofolio dalam satu cockpit trading profesional.
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
            <h2>Semua yang trader butuhkan.</h2>
            <p>Delapan modul terintegrasi. Satu terminal. Tanpa kompromi.</p>
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
            <h2>Tiga langkah menuju trade yang lebih baik.</h2>
            <p>Dari penemuan sinyal hingga eksekusi — tersederhanakan.</p>
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
            <p>Dibangun atas satu prinsip: setiap data harus membantu lo membuat keputusan yang lebih baik.</p>
          </div>
          <span className="kt-pill"><Shield size={12} /> FILOSOFI</span>
        </div>
        <div className="kt-card kt-card-pad">
          <p style={{ color: 'var(--kt-text2)', fontSize: 15, lineHeight: 1.75, marginBottom: 20 }}>
            Aegis Terminal memadukan kerangka kerja institusional (SMC, ICT, Wyckoff) dengan AI modern untuk menembus noise market dan menampilkan yang penting. Tanpa hype, tanpa spam alert — hanya analisis terstruktur untuk trader serius.
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
            Siap upgrade trading lo?
          </h2>
          <p style={{ color: 'var(--kt-muted)', marginTop: 10, fontSize: 14, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
            Buka Aegis Terminal dan mulai melihat market seperti cara institusi melihatnya.
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
