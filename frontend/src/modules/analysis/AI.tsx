import { useState } from 'react'
import { Send, Sparkles, User, Bot, Loader2 } from 'lucide-react'

interface Message { id: number; role: 'user' | 'assistant'; content: string }

const MOCK_MESSAGES: Message[] = [
  {
    id: 1, role: 'user',
    content: 'Analyze BBCA for me — technical setup, fundamentals, and any signals I should watch.',
  },
  {
    id: 2, role: 'assistant',
    content: `**BBCA.JK — Bank Central Asia Analysis**

**Technical Setup**
• Price: 9,850 (+1.24% today)
• Trading above SMA20 (9,720) and SMA50 (9,580) — bullish alignment
• RSI at 58 — neutral-bullish, room to run before overbought
• MACD: signal line crossover 3 days ago, histogram expanding
• Volume: 1.8x 20-day average — institutional participation confirmed
• Bollinger Bands: price near upper band, watch for squeeze breakout

**Key Levels**
• Support: 9,650 (prior breakout), 9,400 (SMA50)
• Resistance: 10,000 (psychological), 10,200 (measured move target)

**Fundamentals**
• P/E: 22.4x (sector avg 18x) — premium justified by ROE 24.1%
• Revenue Growth: +12.3% YoY
• D/E: 0.8x — conservative leverage
• NIM: 5.8% — best-in-class among IDX banks
• Foreign flow: net buy Rp 245B this week

**Verdict:** Bullish bias. Golden cross confirmed on weekly. Enter on pullback to 9,650-9,720 zone with SL below 9,400. Target 10,200 (R:R 2.2:1).`,
  },
  { id: 3, role: 'user', content: 'What about the banking sector overall? Any rotation signals?' },
]

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center border ${
        isUser ? 'bg-info/10 border-info/20' : 'bg-primary/10 border-primary/20'
      }`}>
        {isUser ? <User size={14} className="text-info" /> : <Bot size={14} className="text-primary" />}
      </div>
      <div className={`max-w-[75%] rounded-xl px-5 py-3.5 ${
        isUser
          ? 'glass border-border/40'
          : 'bg-surface-dark/60 border border-border/20 backdrop-blur-sm'
      }`}>
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-[11px] font-semibold ${isUser ? 'text-info' : 'text-primary'}`}>
            {isUser ? 'You' : 'Aegis AI'}
          </span>
          <span className="text-[10px] text-fg-placeholder font-mono">just now</span>
        </div>
        <div className="text-[13px] text-fg-secondary leading-relaxed whitespace-pre-wrap">
          {msg.content.split('\n').map((line, i) => {
            if (line.startsWith('**') && line.endsWith('**')) {
              return <p key={i} className="font-bold text-fg mt-3 mb-1.5 text-[14px]">{line.replace(/\*\*/g, '')}</p>
            }
            if (line.startsWith('•')) {
              return <p key={i} className="pl-3 mt-0.5">{line}</p>
            }
            return <p key={i}>{line}</p>
          })}
        </div>
      </div>
    </div>
  )
}

export default function AI() {
  const [messages] = useState<Message[]>(MOCK_MESSAGES)
  const [input, setInput] = useState('')
  const [streaming] = useState(false)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border/40 bg-surface-dark/40 backdrop-blur-sm">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
          <Sparkles size={14} className="text-primary" />
        </div>
        <span className="text-[13px] font-semibold text-fg">AI Assistant</span>
        <span className="text-[11px] text-fg-muted font-mono ml-1">· powered by Aegis</span>
        <div className="ml-auto flex items-center gap-1.5 text-[11px] text-fg-muted font-mono">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
          <span>Online</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-5 space-y-5">
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {streaming && (
          <div className="flex items-center gap-2 text-[12px] text-fg-muted">
            <Loader2 size={14} className="animate-spin text-primary" />
            <span>Aegis is thinking...</span>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="border-t border-border/40 bg-surface-dark/40 backdrop-blur-sm p-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about any stock, strategy, or market insight..."
            className="flex-1 px-4 py-3 glass rounded-xl text-[13px] text-fg placeholder:text-fg-placeholder focus:outline-none focus:border-primary/50 transition-colors"
          />
          <button
            className="p-3 bg-gradient-to-r from-primary to-primary-hover text-canvas rounded-xl hover:shadow-[0_0_15px_rgba(62,207,142,0.3)] transition-all disabled:opacity-40"
            disabled={!input.trim()}
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-[10px] text-fg-placeholder mt-2 text-center font-mono">
          AI responses are for informational purposes only. Not financial advice.
        </p>
      </div>
    </div>
  )
}
