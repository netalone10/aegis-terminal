import { Link } from 'react-router-dom'
import {
  Crosshair,
  BarChart3,
  Globe,
  Bot,
  ScanLine,
  Briefcase,
  CandlestickChart,
  BookOpen,
  ArrowRight,
  Zap,
  Shield,
  TrendingUp,
  ChevronRight,
} from 'lucide-react'

const features = [
  {
    icon: Crosshair,
    title: 'SMC / ICT Engine',
    desc: 'Order blocks, FVGs, liquidity sweeps, and market structure mapped in real-time. Institutional-grade smart money concepts on autopilot.',
  },
  {
    icon: BarChart3,
    title: 'Live Market Data',
    desc: 'Real-time price feeds, volume profiles, and multi-timeframe analysis across crypto, forex, and equities — all in one terminal.',
  },
  {
    icon: Globe,
    title: 'Macro Regime Analysis',
    desc: 'Track DXY, yields, risk-on/off regimes, and macro shifts that drive asset prices. Know the environment before you trade.',
  },
  {
    icon: Bot,
    title: 'AI-Powered Analysis',
    desc: 'GPT-driven trade ideas, multi-agent debates, and sentiment synthesis. Let AI surface setups while you focus on execution.',
  },
  {
    icon: ScanLine,
    title: 'IDX Stock Scanner',
    desc: 'Score every stock on technicals, momentum, and volume. Filter by index, sector, or custom criteria. Find alpha in seconds.',
  },
  {
    icon: Briefcase,
    title: 'Portfolio Tracking',
    desc: 'Monitor holdings, P&L, and allocation in real-time. Know exactly where you stand without leaving the terminal.',
  },
  {
    icon: CandlestickChart,
    title: 'Chart Lab',
    desc: 'Advanced charting with Bollinger squeezes, Fibonacci grids, multi-timeframe overlays, and volume confirmation tools.',
  },
  {
    icon: BookOpen,
    title: 'Trading Journal',
    desc: 'Log entries, tag setups, track win rate by strategy. Review and refine your edge with structured trade documentation.',
  },
]

const steps = [
  {
    num: '01',
    title: 'Connect & Scan',
    desc: 'Launch the terminal. The scanner surfaces high-probability setups across markets — SMC zones, volume breakouts, macro shifts.',
  },
  {
    num: '02',
    title: 'Analyze & Validate',
    desc: 'Deep-dive with AI analysis, multi-timeframe alignment, and institutional flow data. Every signal backed by multiple confirmations.',
  },
  {
    num: '03',
    title: 'Execute & Journal',
    desc: 'Take the trade with conviction. Log it in the journal. Review performance. Compound your edge over time.',
  },
]

const stats = [
  { value: '10K+', label: 'Signals Processed Daily' },
  { value: '8', label: 'Integrated Modules' },
  { value: '<50ms', label: 'Data Latency' },
  { value: '24/7', label: 'Market Coverage' },
]

export default function Landing() {
  return (
    <div className="flex flex-col gap-0">
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center text-center py-24 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#ffbf00]/5 via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10 max-w-3xl mx-auto flex flex-col items-center gap-6">
          <span className="inline-flex items-center gap-2 text-xs font-mono tracking-widest text-[#ffbf00] uppercase border border-[#ffbf00]/30 rounded-full px-4 py-1.5">
            <Zap className="w-3.5 h-3.5" />
            Institutional-Grade Terminal
          </span>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-[#f5f5f5] leading-[1.1]">
            Trade Smarter.<br />
            <span className="text-[#ffbf00]">See Everything.</span>
          </h1>
          <p className="text-lg md:text-xl text-[#888] max-w-xl leading-relaxed">
            Aegis Terminal unifies SMC/ICT analysis, macro regime tracking, AI-powered insights, and portfolio management into one professional trading cockpit.
          </p>
          <div className="flex gap-3 mt-2">
            <Link
              to="/"
              className="inline-flex items-center gap-2 bg-[#ffbf00] text-black font-semibold text-sm px-6 py-3 rounded-lg hover:bg-[#e6ac00] transition-colors"
            >
              Launch Terminal
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 border border-[#333] text-[#f5f5f5] font-medium text-sm px-6 py-3 rounded-lg hover:border-[#555] transition-colors"
            >
              Explore Features
            </a>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-[#222] bg-[#0a0a0a]">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 divide-x divide-[#222]">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-1 py-8 px-4">
              <span className="text-3xl md:text-4xl font-bold text-[#ffbf00] font-mono">{s.value}</span>
              <span className="text-xs text-[#666] uppercase tracking-wider">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-mono tracking-widest text-[#ffbf00] uppercase mb-3">Capabilities</p>
            <h2 className="text-3xl md:text-4xl font-bold text-[#f5f5f5]">Everything a trader needs.</h2>
            <p className="text-[#666] mt-3 max-w-lg mx-auto">Eight integrated modules. One terminal. Zero compromise.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((f) => {
              const Icon = f.icon
              return (
                <div
                  key={f.title}
                  className="group bg-[#111] border border-[#222] rounded-xl p-6 hover:border-[#ffbf00]/40 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-[#ffbf00]/10 flex items-center justify-center mb-4 group-hover:bg-[#ffbf00]/20 transition-colors">
                    <Icon className="w-5 h-5 text-[#ffbf00]" />
                  </div>
                  <h3 className="text-sm font-semibold text-[#f5f5f5] mb-2">{f.title}</h3>
                  <p className="text-xs text-[#888] leading-relaxed">{f.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-4 bg-[#0a0a0a] border-y border-[#222]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-mono tracking-widest text-[#ffbf00] uppercase mb-3">Workflow</p>
            <h2 className="text-3xl md:text-4xl font-bold text-[#f5f5f5]">Three steps to better trades.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((s) => (
              <div key={s.num} className="relative flex flex-col gap-4">
                <span className="text-6xl font-bold font-mono text-[#222]">{s.num}</span>
                <h3 className="text-lg font-semibold text-[#f5f5f5] -mt-8">{s.title}</h3>
                <p className="text-sm text-[#888] leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust / Philosophy */}
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-[#ffbf00]">
              <Shield className="w-5 h-5" />
              <span className="text-xs font-mono tracking-widest uppercase">Built for serious traders</span>
            </div>
            <h2 className="text-3xl font-bold text-[#f5f5f5]">
              No noise. No fluff. Just signal.
            </h2>
            <p className="text-[#888] leading-relaxed">
              Aegis Terminal is built on one principle: every piece of data should help you make a better decision. We combine institutional frameworks (SMC, ICT, Wyckoff) with modern AI to cut through market noise and surface what matters.
            </p>
            <ul className="flex flex-col gap-2 mt-2">
              {[
                'Multi-timeframe confluence analysis',
                'Macro-aware regime detection',
                'AI-powered sentiment & technical synthesis',
                'Structured journaling for continuous improvement',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-[#aaa]">
                  <ChevronRight className="w-3.5 h-3.5 text-[#ffbf00] flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="w-64 h-64 rounded-2xl bg-gradient-to-br from-[#ffbf00]/20 to-transparent border border-[#ffbf00]/20 flex items-center justify-center">
              <TrendingUp className="w-20 h-20 text-[#ffbf00]/40" />
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-24 px-4 border-t border-[#222] bg-gradient-to-t from-[#ffbf00]/5 to-transparent">
        <div className="max-w-2xl mx-auto text-center flex flex-col items-center gap-6">
          <h2 className="text-3xl md:text-4xl font-bold text-[#f5f5f5]">
            Ready to upgrade your trading?
          </h2>
          <p className="text-[#888]">
            Launch Aegis Terminal and start seeing the market the way institutions do.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 bg-[#ffbf00] text-black font-semibold text-sm px-8 py-3.5 rounded-lg hover:bg-[#e6ac00] transition-colors"
          >
            Get Started
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  )
}
