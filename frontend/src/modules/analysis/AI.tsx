import { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, User, Bot } from 'lucide-react'

interface Message { id: number; role: 'user' | 'assistant'; content: string }

const WELCOME_MSG: Message = {
  id: 1,
  role: 'assistant',
  content: 'Welcome to Aegis AI. I have live market context — ask me about setups, structure, risk, or any pair.',
}

const QUICK_ACTIONS = [
  'Analyze XAU/USD',
  'Check Kill Zone',
  'Risk Check',
  "What's the bias?",
]

const API_BASE = 'https://aegis-terminal-api.akbar-rm10.workers.dev'
const API_URL = `${API_BASE}/api/ai/chat`

/** Minimal markdown → HTML: bold, bullets, line breaks */
function renderMarkdown(text: string) {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul style="margin:4px 0 4px 18px;padding:0">$1</ul>')
  html = html.replace(/\n/g, '<br/>')
  return html
}

export default function AI() {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isTyping])

  const handleSend = async (text?: string) => {
    const query = (text ?? input).trim()
    if (!query) return

    const userMsg: Message = { id: Date.now(), role: 'user', content: query }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsTyping(true)

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          history: [...messages, userMsg].slice(-10).map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json()
      const aiMsg: Message = {
        id: Date.now() + 1,
        role: 'assistant',
        content: data.reply ?? data.message ?? data.error ?? 'Tidak ada respons dari AI.',
      }
      setMessages(prev => [...prev, aiMsg])
    } catch (err: any) {
      const errMsg: Message = {
        id: Date.now() + 1,
        role: 'assistant',
        content: `⚠️ Error API: ${err.message ?? 'Koneksi gagal'}. Periksa status backend.`,
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setIsTyping(false)
    }
  }

  return (
    <div>
      <div className="kt-route-head">
        <div>
          <div className="kt-kicker">Aegis AI</div>
          <h1>AI Context</h1>
          <p>SMC + ICT Context</p>
        </div>
        <div className="kt-route-actions">
          <Sparkles size={12} style={{ color: 'var(--kt-gold)' }} />
          <span>Groq Llama 3.3</span>
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
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
            {messages.map(msg => (
              <div key={msg.id} className="kt-chat-msg">
                <div className={`kt-chat-avatar ${msg.role}`}>
                  {msg.role === 'user' ? <User size={13} /> : <Bot size={13} />}
                </div>
                <div
                  className="kt-chat-content"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                />
              </div>
            ))}
            {isTyping && (
              <div className="kt-chat-msg">
                <div className="kt-chat-avatar bot"><Bot size={13} /></div>
                <div className="kt-chat-content" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--kt-muted)' }}>
                  <span className="ai-dot" style={{ animationDelay: '0s' }}>.</span>
                  <span className="ai-dot" style={{ animationDelay: '0.2s' }}>.</span>
                  <span className="ai-dot" style={{ animationDelay: '0.4s' }}>.</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {QUICK_ACTIONS.map(action => (
              <button
                key={action}
                className="kt-pill"
                style={{ cursor: 'pointer', fontSize: 'var(--xs)' }}
                onClick={() => handleSend(action)}
              >
                {action}
              </button>
            ))}
          </div>

          {/* Input row */}
          <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--kt-border-soft)', paddingTop: 14 }}>
            <input
              className="kt-input"
              style={{ flex: 1 }}
              placeholder="Ask about market context, setups, or checklists..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
            />
            <button className="kt-btn kt-btn-primary" onClick={() => handleSend()} disabled={isTyping}>
              <Send size={13} />
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blink {
          0%, 20% { opacity: 0.2; }
          50% { opacity: 1; }
          80%, 100% { opacity: 0.2; }
        }
        .ai-dot {
          font-size: 20px;
          font-weight: 700;
          color: var(--kt-gold);
          animation: blink 1.4s infinite;
        }
      `}</style>
    </div>
  )
}
