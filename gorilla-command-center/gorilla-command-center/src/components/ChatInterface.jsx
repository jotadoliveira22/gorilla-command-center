import { useState, useRef, useEffect } from 'react'
import { callClaude } from '../lib/api.js'

function Spinner({ size = 14 }) {
  return <div style={{ width: size, height: size, border: '2px solid #333', borderTopColor: '#D63028', borderRadius: '50%', animation: 'spin .7s linear infinite', flexShrink: 0 }} />
}

export default function ChatInterface({ tab, apiKey }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const taRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  const resize = () => {
    const t = taRef.current
    if (!t) return
    t.style.height = 'auto'
    t.style.height = Math.min(t.scrollHeight, 140) + 'px'
  }

  const send = async (text) => {
    const content = (text || input).trim()
    if (!content || loading) return
    if (!apiKey) { alert('Configura tu Anthropic API Key en Configuración (⚙ arriba a la derecha).'); return }
    const updated = [...messages, { role: 'user', content }]
    setMessages(updated)
    setInput('')
    if (taRef.current) taRef.current.style.height = 'auto'
    setLoading(true)
    try {
      const reply = await callClaude(updated, tab.prompt, apiKey)
      setMessages([...updated, { role: 'assistant', content: reply }])
    } catch (e) {
      setMessages([...updated, { role: 'assistant', content: `Error: ${e.message}` }])
    } finally { setLoading(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '22px 26px 8px' }}>
        {messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 18, textAlign: 'center' }}>
            <div style={{ width: 50, height: 50, borderRadius: 13, background: '#1A1A1A', border: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#D63028' }}>{tab.welcome.icon}</div>
            <div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1.5, marginBottom: 7 }}>{tab.welcome.title}</div>
              <div style={{ fontSize: 13, color: '#666', lineHeight: 1.6, maxWidth: 370 }}>{tab.welcome.desc}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: '100%', maxWidth: 460 }}>
              {tab.welcome.suggestions.map((s, i) => (
                <button key={i} onClick={() => send(s)} style={{ background: '#141414', border: '1px solid #222', borderRadius: 9, padding: '10px 15px', color: '#666', fontSize: 12.5, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'all .15s' }}
                  onMouseEnter={e => { e.target.style.background = '#1E1E1E'; e.target.style.color = '#F0F0F0' }}
                  onMouseLeave={e => { e.target.style.background = '#141414'; e.target.style.color = '#666' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {messages.map((m, i) => (
              <div key={i} className="fade-up" style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {m.role === 'assistant' && (
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: '#1A1A1A', border: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#D63028', marginRight: 9, flexShrink: 0, alignSelf: 'flex-end', marginBottom: 2 }}>G</div>
                )}
                <div style={{ maxWidth: '78%', background: m.role === 'user' ? '#D63028' : '#1A1A1A', color: '#F0F0F0', borderRadius: m.role === 'user' ? '15px 15px 4px 15px' : '15px 15px 15px 4px', padding: '11px 15px', fontSize: 13.5, lineHeight: 1.65, border: m.role === 'user' ? 'none' : '1px solid #222', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="fade-up" style={{ display: 'flex', alignItems: 'flex-end', gap: 9 }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: '#1A1A1A', border: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#D63028' }}>G</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '12px 15px', background: '#1A1A1A', borderRadius: '15px 15px 15px 4px', border: '1px solid #222' }}>
                  {[0, 1, 2].map(j => <div key={j} style={{ width: 5, height: 5, borderRadius: '50%', background: '#333', animation: 'pulse 1.2s ease-in-out infinite', animationDelay: `${j * .2}s` }} />)}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div style={{ padding: '11px 26px 18px', borderTop: '1px solid #1A1A1A' }}>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])} style={{ background: 'none', border: 'none', color: '#333', fontSize: 11, cursor: 'pointer', marginBottom: 9, fontFamily: 'inherit', display: 'block' }}>↺ Nueva conversación</button>
        )}
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-end' }}>
          <textarea
            ref={taRef}
            value={input}
            onChange={e => { setInput(e.target.value); resize() }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={tab.placeholder}
            rows={1}
            style={{ flex: 1, resize: 'none', lineHeight: 1.5 }}
          />
          <button className="btn-red" onClick={() => send()} disabled={loading || !input.trim()} style={{ width: 42, height: 42, padding: 0, borderRadius: 10, fontSize: 15, justifyContent: 'center', flexShrink: 0 }}>↑</button>
        </div>
        <div style={{ fontSize: 10, color: '#333', marginTop: 6, textAlign: 'center' }}>Enter envía · Shift+Enter salto de línea</div>
      </div>
    </div>
  )
}
