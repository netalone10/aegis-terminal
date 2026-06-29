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

**Signals to Watch**
• Golden cross forming (SMA20 crossing SMA50) — confirmation at 9,780
• Foreign net buy +Rp 280B last 5 days — accumulation pattern
• Earnings in 2 weeks — potential catalyst

**Verdict:** Bullish bias. Entry zone 9,650-9,780 on pullback. Target 10,200. SL 9,400.`,
  },
]

export default function AI() {
  const [messages, setMessages] = useState<Message[]>(MOCK_MESSAGES)
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)

  const handleSend = () => {
    if (!input.trim()) return
    const userMsg: Message = { id: Date.now(), role: 'user', content: input }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsTyping(true)

    setTimeout(() => {
      const aiMsg: Message = {
        id: Date.now() + 1, role: 'assistant',
        content: 'Analyzing your request... This is a placeholder response. The AI module will be connected to a real LLM endpoint in a future update.',
      }
      setMessages(prev => [...prev, aiMsg])
      setIsTyping(false)
    }, 1500)
  }

  return (
    <div>
      <div className="kt-route-head">
        <div>
          <div className="kt-kicker">AI Assistant</div>
          <h1>AI Context</h1>
          <p>Market context, setup analysis, and decision checklists</p>
        </div>
        <div className="kt-route-actions">
          <Sparkles size={12} style={{ color: 'var(--kt-gold)' }} />
          <span>GPT-4 Powered</span>
        </div>
      </div>

      <div className="kt-panel">
        <div className="kt-panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bot size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ color: 'var(--kt-text)', fontSize: 'var(--md)', fontWeight: 600 }}>Conversation</span>
          </div>
          <span className="kt-pill">{messages.length} messages</span>
        </div>
        <div className="kt-panel-body" style={{ minHeight: 400, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
            {messages.map(msg => (
              <div key={msg.id} className="kt-chat-msg">
                <div className={`kt-chat-avatar ${msg.role}`}>
                  {msg.role === 'user' ? <User size={13} /> : <Bot size={13} />}
                </div>
                <div className="kt-chat-content">
                  {msg.content.split('\n').map((line, i) => (
                    <p key={i} style={{ marginBottom: line ? 6 : 0 }}>{line || '\u00A0'}</p>
                  ))}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="kt-chat-msg">
                <div className="kt-chat-avatar bot"><Bot size={13} /></div>
                <div className="kt-chat-content" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--kt-muted)' }}>
                  <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                  Thinking...
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--kt-border-soft)', paddingTop: 14 }}>
            <input
              className="kt-input"
              style={{ flex: 1 }}
              placeholder="Ask about market context, setups, or checklists..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
            />
            <button className="kt-btn kt-btn-primary" onClick={handleSend}>
              <Send size={13} />
            </button>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
