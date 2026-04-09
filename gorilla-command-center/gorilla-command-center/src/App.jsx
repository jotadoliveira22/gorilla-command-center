import { useState, useEffect } from 'react'
import Dashboard from './components/Dashboard.jsx'
import ChatInterface from './components/ChatInterface.jsx'
import Calendar from './components/Calendar.jsx'
import DMs from './components/DMs.jsx'
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
    placeholder: '¿Sobre qué tema o marca quieres crear un carrusel?',
    welcome: {
      icon: '◈',
      title: 'Generador de Carruseles Instagram',
      desc: 'Dime el tema y los datos de tu marca. Te genero el carrusel completo slide a slide, listo para exportar como JPG.',
      suggestions: [
        'Los 5 errores más comunes en email marketing para @gorillagency',
        'Presentar los servicios de automatización de la agencia',
        'Carrusel educativo: Automatización con IA para negocios en Latam',
      ],
    },
  },
  { id: 'calendar', label: 'Calendario', sub: 'Scheduling + Auto-post' },
  { id: 'dms', label: 'DMs & Comentarios', sub: 'Automatización IA' },
]

export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [creds, setCreds] = useState({ accessToken: '', igUserId: '' })
  const [posts, setPosts] = useState([])
  const [apiKey, setApiKey] = useState('')
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    const key = storage.get('anthropic_key')
    if (key) setApiKey(key)
    else setShowSettings(true) // first open: show settings
    const savedCreds = storage.get('ig_creds')
    if (savedCreds) setCreds(savedCreds)
  }, [])

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
            <button
              onClick={() => setShowSettings(true)}
              style={{ background: 'none', border: '1px solid #222', borderRadius: 8, padding: '5px 10px', color: '#555', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', transition: 'all .15s' }}
              onMouseEnter={e => { e.target.style.borderColor = '#333'; e.target.style.color = '#F0F0F0' }}
              onMouseLeave={e => { e.target.style.borderColor = '#222'; e.target.style.color = '#555' }}
            >
              ⚙ Configuración
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1A1A1A', paddingLeft: 20, flexShrink: 0, overflowX: 'auto' }}>
          {TABS.map(t => {
            const active = t.id === tab
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ background: 'none', border: 'none', borderBottom: active ? '2px solid #D63028' : '2px solid transparent', color: active ? '#F0F0F0' : '#555', padding: '11px 16px 10px', cursor: 'pointer', fontSize: 12.5, fontWeight: active ? 600 : 400, fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0, transition: 'color .15s' }}>
                <span>{t.label}</span>
                <span style={{ fontSize: 9.5, color: active ? '#D63028' : '#333', letterSpacing: .5 }}>{t.sub}</span>
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {tab === 'dashboard' && <Dashboard creds={creds} setCreds={setCreds} />}
          {(tab === 'contenido' || tab === 'carrusel') && <ChatInterface key={tab} tab={cur} apiKey={apiKey} />}
          {tab === 'calendar' && <Calendar posts={posts} setPosts={setPosts} creds={creds} />}
          {tab === 'dms' && <DMs apiKey={apiKey} />}
        </div>
      </div>
    </>
  )
}
