import { useState, useEffect } from 'react'
import Dashboard from './components/Dashboard.jsx'
import ChatInterface from './components/ChatInterface.jsx'
import Calendar from './components/Calendar.jsx'
import DMs from './components/DMs.jsx'
import BusinessIntel from './components/BusinessIntel.jsx'
import Settings from './components/Settings.jsx'
import { CONTENIDO_PROMPT, CARRUSEL_PROMPT } from './lib/prompts.js'
import { storage } from './lib/api.js'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', sub: 'Instagram KPIs' },
  {
    id: 'contenido', label: 'Creador Contenido', sub: '@gorillagency',
    prompt: CONTENIDO_PROMPT,
    placeholder: 'Dame una noticia, tendencia o idea para convertir en contenido...',
    welcome: {
      icon: '✦',
      title: 'Creador de Contenido @gorillagency',
      desc: 'Dime un tema, noticia o tendencia y te entrego el análisis estratégico completo + la pieza lista para publicar.',
      suggestions: [
        'Meta lanzó nuevas herramientas de IA para anunciantes',
        'El email marketing tiene 78% de open rate con IA',
        'TikTok Shop creció 450% este año en ventas Gen-Z',
      ],
    },
  },
  {
    id: 'carrusel', label: 'Generador Carruseles', sub: 'Instagram JPG',
    prompt: CARRUSEL_PROMPT,
    placeholder: '¿Sobre qué tema quieres crear el carrusel?',
    welcome: {
      icon: '◈',
      title: 'Generador de Carruseles @gorillagency',
      desc: 'La marca ya está configurada. Elige el estilo (A o B) y escribe el tema — el carrusel se genera directamente.',
      suggestions: [
        'Los 5 errores más comunes en email marketing',
        'Cómo automatizar tu agencia con IA en 2026',
        'Por qué el contenido orgánico supera a los ads pagados',
      ],
    },
  },
  { id: 'calendar', label: 'Calendario', sub: 'Scheduling + Auto-post' },
  { id: 'dms', label: 'DMs & Comentarios', sub: 'Automatización IA' },
  { id: 'bi', label: 'Business Intel', sub: 'Análisis Competitivo' },
]

export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [creds, setCreds] = useState({ accessToken: '', igUserId: '' })
  const [posts, setPosts] = useState([])
  const [apiKey, setApiKey] = useState('')
  const [showSettings, setShowSettings] = useState(false)

  // Persistent conversation histories per tab
  const [histories, setHistories] = useState({ contenido: [], carrusel: [] })

  useEffect(() => {
    const key = storage.get('anthropic_key')
    if (key) setApiKey(key)
    else setShowSettings(true)
    const savedCreds = storage.get('ig_creds')
    if (savedCreds) setCreds(savedCreds)
    // Load saved histories
    const savedHistories = storage.get('chat_histories')
    if (savedHistories) setHistories(savedHistories)
  }, [])

  // Save histories to localStorage whenever they change
  useEffect(() => {
    storage.set('chat_histories', histories)
  }, [histories])

  const setTabMessages = (tabId, msgs) => {
    setHistories(h => ({ ...h, [tabId]: msgs }))
  }

  const cur = TABS.find(t => t.id === tab)
  const pending = posts.filter(p => p.status === 'scheduled').length

  return (
    <>
      {showSettings && <Settings apiKey={apiKey} setApiKey={setApiKey} onClose={apiKey ? () => setShowSettings(false) : null} />}

      <div style={{ background: '#0C0C0C', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #1A1A1A', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: '#D63028', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>🦍</div>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: 2, color: '#D63028', lineHeight: 1 }}>GORILLA AGENCY</div>
            <div style={{ fontSize: 9, color: '#333', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 2 }}>Content Command Center</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            {pending > 0 && (
              <div style={{ fontSize: 10.5, color: '#D63028', display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#D63028', animation: 'blink 2s ease-in-out infinite' }} />
                {pending} pendiente{pending > 1 ? 's' : ''}
              </div>
            )}
            {creds.accessToken && <span className="badge" style={{ background: '#22C55E22', color: '#22C55E' }}>IG Conectado</span>}
            {apiKey && <span className="badge" style={{ background: '#3B82F622', color: '#3B82F6' }}>Claude ✓</span>}
            <button onClick={() => setShowSettings(true)} style={{ background: 'none', border: '1px solid #222', borderRadius: 8, padding: '5px 10px', color: '#555', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', transition: 'all .15s' }}>
              ⚙ Configuración
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1A1A1A', paddingLeft: 20, flexShrink: 0, overflowX: 'auto' }}>
          {TABS.map(t => {
            const active = t.id === tab
            const hasHistory = (t.id === 'contenido' || t.id === 'carrusel') && histories[t.id]?.length > 0
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ background: 'none', border: 'none', borderBottom: active ? '2px solid #D63028' : '2px solid transparent', color: active ? '#F0F0F0' : '#555', padding: '11px 16px 10px', cursor: 'pointer', fontSize: 12.5, fontWeight: active ? 600 : 400, fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0, transition: 'color .15s', position: 'relative' }}>
                <span>{t.label}</span>
                <span style={{ fontSize: 9.5, color: active ? '#D63028' : '#333', letterSpacing: .5 }}>{t.sub}</span>
                {hasHistory && <div style={{ position: 'absolute', top: 8, right: 8, width: 6, height: 6, borderRadius: '50%', background: '#D63028' }} />}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {tab === 'dashboard' && <Dashboard creds={creds} setCreds={setCreds} />}
          {(tab === 'contenido' || tab === 'carrusel') && (
            <ChatInterface
              tab={cur}
              apiKey={apiKey}
              messages={histories[tab] || []}
              setMessages={(msgs) => setTabMessages(tab, msgs)}
            />
          )}
          {tab === 'calendar' && <Calendar posts={posts} setPosts={setPosts} creds={creds} />}
          {tab === 'dms' && <DMs apiKey={apiKey} />}
          {tab === 'bi' && <BusinessIntel apiKey={apiKey} />}
        </div>
      </div>
    </>
  )
}
