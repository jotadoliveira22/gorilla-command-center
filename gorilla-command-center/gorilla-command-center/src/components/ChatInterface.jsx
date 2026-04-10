import { useState, useRef, useEffect } from 'react'
import { callClaude } from '../lib/api.js'
import CarouselDownloader from './CarouselDownloader.jsx'

function Spinner({ size = 14 }) {
  return <div style={{ width: size, height: size, border: '2px solid #333', borderTopColor: '#D63028', borderRadius: '50%', animation: 'spin .7s linear infinite', flexShrink: 0 }} />
}

// Detect if message contains HTML carousel
function extractHtml(content) {
  const match = content.match(/<!DOCTYPE html[\s\S]*<\/html>/i) ||
                content.match(/<html[\s\S]*<\/html>/i) ||
                content.match(/```html\n([\s\S]*?)\n```/)
  if (match) return match[1] || match[0]
  if (content.includes('<div') && content.includes('</div>') && content.includes('background') && content.length > 2000) {
    const start = content.indexOf('<')
    const end = content.lastIndexOf('>') + 1
    if (start >= 0 && end > start) return content.slice(start, end)
  }
  return null
}

function MessageBubble({ msg, isCarrusel }) {
  const htmlContent = isCarrusel && msg.role === 'assistant' ? extractHtml(msg.content) : null

  if (htmlContent) {
    return (
      <div className="fade-up" style={{ width: '100%' }}>
        <CarouselDownloader html={htmlContent} />
        {/* Show any text before/after the HTML */}
        {msg.content.replace(htmlContent, '').replace(/```html|```/g, '').trim() && (
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: '#1A1A1A', border: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#D63028', marginRight: 9, flexShrink: 0, alignSelf: 'flex-start', marginTop: 2 }}>G</div>
            <div style={{ maxWidth: '78%', background: '#1A1A1A', color: '#F0F0F0', borderRadius: '15px 15px 15px 4px', padding: '11px 15px', fontSize: 13, lineHeight: 1.65, border: '1px solid #222', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {msg.content.replace(htmlContent, '').replace(/```html|```/g, '').trim()}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fade-up" style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
      {msg.role === 'assistant' && <div style={{ width: 26, height: 26, borderRadius: 7, background: '#1A1A1A', border: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#D63028', marginRight: 9, flexShrink: 0, alignSelf: 'flex-end', marginBottom: 2 }}>G</div>}
      <div style={{ maxWidth: '78%', background: msg.role === 'user' ? '#D63028' : '#1A1A1A', color: '#F0F0F0', borderRadius: msg.role === 'user' ? '15px 15px 4px 15px' : '15px 15px 15px 4px', padding: '11px 15px', fontSize: 13.5, lineHeight: 1.65, border: msg.role === 'user' ? 'none' : '1px solid #222', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {msg.content}
      </div>
    </div>
  )
}

export default function ChatInterface({ tab, apiKey, messages, setMessages }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [style, setStyle] = useState(null)
  const bottomRef = useRef(null)
  const taRef = useRef(null)
  const isCarrusel = tab.id === 'carrusel'

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
    if (!apiKey) { alert('Configura tu Anthropic API Key en Configuración (⚙).'); return }

    const displayContent = (isCarrusel && style && messages.length === 0)
      ? `Estilo ${style} · ${content}`
      : content

    const apiContent = (isCarrusel && style && messages.length === 0)
      ? `ESTILO: ${style}
TEMA: ${content}`
      : content

    const displayMsgs = [...messages, { role: 'user', content: displayContent }]
    const apiMsgs = [...messages, { role: 'user', content: apiContent }]

    setMessages(displayMsgs)
    setInput('')
    if (taRef.current) taRef.current.style.height = 'auto'
    setLoading(true)
    try {
      const reply = await callClaude(apiMsgs, tab.prompt, apiKey)
      setMessages([...displayMsgs, { role: 'assistant', content: reply }])
    } catch (e) {
      setMessages([...displayMsgs, { role: 'assistant', content: `Error: ${e.message}` }])
    } finally { setLoading(false) }
  }

  const clear = () => { setMessages([]); setStyle(null) }
  const isEmpty = messages.length === 0
  const blocked = isCarrusel && isEmpty && !style

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '22px 26px 8px' }}>
        {isEmpty ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 18, textAlign: 'center' }}>
            <div style={{ width: 50, height: 50, borderRadius: 13, background: '#1A1A1A', border: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#D63028' }}>{tab.welcome.icon}</div>
            <div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1.5, marginBottom: 7 }}>{tab.welcome.title}</div>
              <div style={{ fontSize: 13, color: '#666', lineHeight: 1.6, maxWidth: 370 }}>{tab.welcome.desc}</div>
            </div>

            {isCarrusel && (
              <div style={{ width: '100%', maxWidth: 460 }}>
                <div style={{ fontSize: 11, color: '#555', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Elige el estilo del carrusel</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  {['A', 'B'].map(s => (
                    <button key={s} onClick={() => setStyle(s)} style={{ background: style === s ? '#1A1A1A' : '#0F0F0F', border: `2px solid ${style === s ? '#D63028' : '#222'}`, borderRadius: 12, padding: '16px 12px', cursor: 'pointer', transition: 'all .15s', textAlign: 'left' }}>
                      <div style={{ fontSize: 11, color: '#D63028', fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>ESTILO {s}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#F0F0F0', marginBottom: 4 }}>{s === 'A' ? 'Gorilla Dark' : 'Editorial Beige'}</div>
                      <div style={{ fontSize: 11, color: '#666', lineHeight: 1.5 }}>{s === 'A' ? 'Fondo negro · Hooks · Viralidad' : 'Fondo crema · Educativo · Autoridad'}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                        {(s === 'A' ? ['#CC0000', '#1A1A1A', '#ECFF4B', '#FFFFFF'] : ['#CC0000', '#F0EBE0', '#ECFF4B', '#1A1A1A']).map(c => (
                          <div key={c} style={{ width: 14, height: 14, borderRadius: 3, background: c, border: '1px solid #333' }} />
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
                {style && <div style={{ background: '#D6302811', border: '1px solid #D6302833', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#D63028', marginBottom: 4, textAlign: 'left' }}>✓ Estilo {style} — {style === 'A' ? 'Gorilla Dark' : 'Editorial Beige'} seleccionado. Escribe el tema abajo.</div>}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: '100%', maxWidth: 460 }}>
              {tab.welcome.suggestions.map((s, i) => (
                <button key={i} onClick={() => send(s)} disabled={blocked} style={{ background: '#141414', border: '1px solid #222', borderRadius: 9, padding: '10px 15px', color: blocked ? '#444' : '#666', fontSize: 12.5, cursor: blocked ? 'not-allowed' : 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>{s}</button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {isCarrusel && style && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: '#1A1A1A', borderRadius: 8, border: '1px solid #222', fontSize: 12 }}>
                <span style={{ color: '#D63028', fontWeight: 700 }}>Estilo {style}</span>
                <span style={{ color: '#555' }}>·</span>
                <span style={{ color: '#666' }}>{style === 'A' ? 'Gorilla Dark' : 'Editorial Beige'}</span>
              </div>
            )}
            {messages.map((m, i) => (
              <MessageBubble key={i} msg={m} isCarrusel={isCarrusel} />
            ))}
            {loading && (
              <div className="fade-up" style={{ display: 'flex', alignItems: 'flex-end', gap: 9 }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: '#1A1A1A', border: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#D63028' }}>G</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '12px 15px', background: '#1A1A1A', borderRadius: '15px 15px 15px 4px', border: '1px solid #222' }}>
                  {[0,1,2].map(j => <div key={j} style={{ width: 5, height: 5, borderRadius: '50%', background: '#333', animation: 'pulse 1.2s ease-in-out infinite', animationDelay: `${j*.2}s` }} />)}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
      <div style={{ padding: '11px 26px 18px', borderTop: '1px solid #1A1A1A' }}>
        {messages.length > 0 && <button onClick={clear} style={{ background: 'none', border: 'none', color: '#333', fontSize: 11, cursor: 'pointer', marginBottom: 9, fontFamily: 'inherit', display: 'block' }}>↺ Nueva conversación</button>}
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-end' }}>
          <textarea ref={taRef} value={input} onChange={e => { setInput(e.target.value); resize() }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} placeholder={blocked ? 'Primero elige un estilo arriba...' : tab.placeholder} disabled={blocked} rows={1} style={{ flex: 1, resize: 'none', lineHeight: 1.5, opacity: blocked ? 0.4 : 1 }} />
          <button className="btn-red" onClick={() => send()} disabled={loading || !input.trim() || blocked} style={{ width: 42, height: 42, padding: 0, borderRadius: 10, fontSize: 15, justifyContent: 'center', flexShrink: 0 }}>↑</button>
        </div>
        <div style={{ fontSize: 10, color: '#333', marginTop: 6, textAlign: 'center' }}>Enter envía · Shift+Enter salto de línea</div>
      </div>
    </div>
  )
}
