import { useState, useEffect, useRef } from 'react'
import { storage } from '../lib/api.js'

function Spinner({ size = 14 }) {
  return <div style={{ width: size, height: size, border: '2px solid #333', borderTopColor: '#D63028', borderRadius: '50%', animation: 'spin .7s linear infinite', flexShrink: 0 }} />
}

async function callClaudeWithSearch(prompt, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: `Eres un analista experto en marketing digital e inteligencia competitiva para agencias de marketing en Latinoamérica. 
Tu especialidad es analizar competidores en Instagram y redes sociales para @gorillagency (Socially Awkward Gorilla Agency, Caracas).
Responde SIEMPRE en español. Sé directo, usa datos específicos cuando los encuentres, y da recomendaciones accionables.
Formato tu respuesta con secciones claras usando emojis como iconos.`,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.content?.filter(b => b.type === 'text').map(b => b.text).join('\n') || ''
}

const DEFAULT_COMPETITORS = [
  { handle: 'socialmediacol', name: 'Social Media Colombia', category: 'Agencia LatAm', notes: '' },
  { handle: 'buenosairesdigital', name: 'Buenos Aires Digital', category: 'Agencia LatAm', notes: '' },
]

export default function BusinessIntel({ apiKey }) {
  const [competitors, setCompetitors] = useState([])
  const [activeComp, setActiveComp] = useState(null)
  const [analysis, setAnalysis] = useState({})
  const [loading, setLoading] = useState({})
  const [addHandle, setAddHandle] = useState('')
  const [addName, setAddName] = useState('')
  const [addCategory, setAddCategory] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [activeView, setActiveView] = useState('competitors') // competitors | market | strategy

  useEffect(() => {
    const saved = storage.get('bi_competitors')
    setCompetitors(saved || DEFAULT_COMPETITORS)
    const savedAnalysis = storage.get('bi_analysis') || {}
    setAnalysis(savedAnalysis)
  }, [])

  const saveCompetitors = (list) => {
    setCompetitors(list)
    storage.set('bi_competitors', list)
  }

  const addCompetitor = () => {
    if (!addHandle.trim()) return
    const newList = [...competitors, {
      handle: addHandle.trim().replace('@', ''),
      name: addName.trim() || addHandle.trim(),
      category: addCategory.trim() || 'Competidor',
      notes: '',
      addedAt: new Date().toISOString(),
    }]
    saveCompetitors(newList)
    setAddHandle(''); setAddName(''); setAddCategory(''); setShowAdd(false)
  }

  const removeCompetitor = (handle) => {
    saveCompetitors(competitors.filter(c => c.handle !== handle))
    if (activeComp?.handle === handle) setActiveComp(null)
  }

  const analyze = async (comp, type = 'profile') => {
    if (!apiKey) { alert('Configura tu Anthropic API Key en Configuración.'); return }
    const key = `${comp.handle}_${type}`
    setLoading(l => ({ ...l, [key]: true }))

    const prompts = {
      profile: `Investiga el perfil de Instagram @${comp.handle} (${comp.name}).
Busca y analiza:
1. 📊 DATOS BÁSICOS: seguidores, siguiendo, número de posts, frecuencia de publicación
2. 🎯 TIPO DE CONTENIDO: qué formatos usa (Reels, carruseles, posts, Stories), temáticas principales
3. ✍️ ESTILO DE COMUNICACIÓN: tono, copy, uso de hashtags, CTAs
4. 📈 ENGAGEMENT: nivel de interacción estimado, qué posts les funcionan mejor
5. 💡 ESTRATEGIA APARENTE: qué está intentando lograr esta cuenta
6. ⚡ FORTALEZAS Y DEBILIDADES vs @gorillagency
7. 🎯 OPORTUNIDADES para @gorillagency basadas en lo que este competidor NO está haciendo bien`,

      content: `Analiza el contenido reciente de @${comp.handle} en Instagram.
Busca sus últimos posts y analiza:
1. 📱 ÚLTIMOS POSTS: describe los 5 posts más recientes y sus temas
2. 🔥 CONTENIDO VIRAL: ¿qué post tiene más engagement y por qué?
3. 📅 CALENDARIO: ¿cuándo publica? ¿qué días y horas?
4. 🎨 ESTÉTICA VISUAL: paleta de colores, estilo de diseño, coherencia de marca
5. 📝 COPY Y HOOKS: ¿qué frases/hooks usan en sus captions?
6. #️⃣ HASHTAGS: estrategia de hashtags que usa
7. 💬 ENGAGEMENT: comentarios típicos que reciben, tipo de audiencia que los sigue`,

      strategy: `Basándote en @${comp.handle} y en el contexto de @gorillagency (agencia de marketing digital en Caracas, Venezuela):
1. 🕵️ ANÁLISIS DE BRECHA: ¿qué hace @${comp.handle} que @gorillagency no hace todavía?
2. 🎯 CONTENIDO DIFERENCIADOR: 5 ideas de contenido específicas que @gorillagency podría crear para superar a @${comp.handle}
3. 📊 OPORTUNIDADES DE MERCADO: nichos o audiencias que @${comp.handle} no está cubriendo
4. ⚡ ACCIONES INMEDIATAS: 3 cosas concretas que @gorillagency puede hacer esta semana para ganar terreno
5. 🔮 PREDICCIÓN: si las tendencias actuales continúan, ¿qué pasará con @${comp.handle} en los próximos 6 meses?`
    }

    try {
      const result = await callClaudeWithSearch(prompts[type], apiKey)
      const newAnalysis = { ...analysis, [key]: { text: result, timestamp: new Date().toISOString() } }
      setAnalysis(newAnalysis)
      storage.set('bi_analysis', newAnalysis)
    } catch (e) {
      const newAnalysis = { ...analysis, [key]: { text: `Error: ${e.message}`, timestamp: new Date().toISOString() } }
      setAnalysis(newAnalysis)
    } finally {
      setLoading(l => ({ ...l, [key]: false }))
    }
  }

  const analyzeMarket = async (type) => {
    if (!apiKey) { alert('Configura tu Anthropic API Key en Configuración.'); return }
    setLoading(l => ({ ...l, [`market_${type}`]: true }))
    const compList = competitors.map(c => `@${c.handle}`).join(', ')

    const prompts = {
      overview: `Analiza el mercado de agencias de marketing digital en Instagram en Latinoamérica.
Los principales competidores de @gorillagency son: ${compList}

Dame:
1. 🌎 PANORAMA DEL MERCADO: estado actual del marketing digital en LatAm en Instagram
2. 📊 POSICIONAMIENTO: ¿dónde está cada uno de estos competidores en el mercado?
3. 🔥 TENDENCIAS: las 5 tendencias más importantes en contenido de marketing digital en Instagram ahora mismo
4. 💰 OPORTUNIDADES: nichos poco explotados en el mercado de agencias LatAm
5. ⚠️ AMENAZAS: nuevos competidores, cambios de algoritmo, tendencias que pueden afectar negativamente
6. 🎯 RECOMENDACIÓN ESTRATÉGICA para @gorillagency`,

      trends: `Investiga las tendencias actuales de contenido en Instagram para agencias de marketing en 2026.
Dame:
1. 📱 FORMATOS QUE ESTÁN FUNCIONANDO: Reels vs carruseles vs posts estáticos — ¿qué tiene más alcance ahora?
2. 🤖 IA EN CONTENIDO: cómo las agencias están usando IA para crear contenido y qué funciona
3. 🎨 ESTILOS VISUALES TRENDING: qué estéticas, paletas y estilos están dominando en marketing digital
4. ✍️ COPY Y HOOKS QUE CONVIERTEN: tipos de captions, hooks de apertura y CTAs con mejor engagement
5. 📈 ALGORITMO: qué está priorizando Instagram actualmente
6. 🔮 PREDICCIÓN 2026: qué tendencias van a explotar en los próximos 3 meses`
    }

    try {
      const result = await callClaudeWithSearch(prompts[type], apiKey)
      const newAnalysis = { ...analysis, [`market_${type}`]: { text: result, timestamp: new Date().toISOString() } }
      setAnalysis(newAnalysis)
      storage.set('bi_analysis', newAnalysis)
    } catch (e) {
      const newAnalysis = { ...analysis, [`market_${type}`]: { text: `Error: ${e.message}`, timestamp: new Date().toISOString() } }
      setAnalysis(newAnalysis)
    } finally {
      setLoading(l => ({ ...l, [`market_${type}`]: false }))
    }
  }

  const getAge = (ts) => {
    if (!ts) return null
    const mins = Math.floor((Date.now() - new Date(ts)) / 60000)
    if (mins < 60) return `Hace ${mins}m`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `Hace ${hrs}h`
    return `Hace ${Math.floor(hrs / 24)}d`
  }

  const AnalysisCard = ({ title, analysisKey, prompt, icon, color = '#D63028' }) => {
    const data = analysis[analysisKey]
    const isLoading = loading[analysisKey]
    const [expanded, setExpanded] = useState(false)

    return (
      <div style={{ background: '#1A1A1A', border: '1px solid #222', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', borderBottom: data && expanded ? '1px solid #222' : 'none' }} onClick={() => data && setExpanded(e => !e)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{icon}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#F0F0F0' }}>{title}</div>
              {data?.timestamp && <div style={{ fontSize: 10, color: '#444', marginTop: 1 }}>Actualizado {getAge(data.timestamp)}</div>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {data && <span style={{ fontSize: 10, color: '#22C55E', fontWeight: 600 }}>✓ Listo</span>}
            <button onClick={(e) => { e.stopPropagation(); prompt() }} disabled={isLoading} style={{ background: color, color: '#fff', border: 'none', borderRadius: 7, padding: '6px 12px', cursor: isLoading ? 'wait' : 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
              {isLoading ? <><Spinner size={10} />{data ? 'Actualizando...' : 'Analizando...'}</> : data ? '↺ Actualizar' : '▶ Analizar'}
            </button>
          </div>
        </div>
        {data && expanded && (
          <div style={{ padding: '16px 18px', fontSize: 12.5, color: '#CCC', lineHeight: 1.8, whiteSpace: 'pre-wrap', maxHeight: 500, overflowY: 'auto' }}>
            {data.text}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #1A1A1A', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: '#D6302822', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🔭</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, letterSpacing: 1, color: '#F0F0F0' }}>BUSINESS INTELLIGENCE</div>
          <div style={{ fontSize: 10, color: '#555', marginTop: 1 }}>Análisis competitivo · @gorillagency</div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1A1A1A', paddingLeft: 20, flexShrink: 0 }}>
        {[
          { id: 'competitors', label: `Competidores (${competitors.length})` },
          { id: 'market', label: 'Mercado & Tendencias' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveView(t.id)} style={{ background: 'none', border: 'none', borderBottom: activeView === t.id ? '2px solid #D63028' : '2px solid transparent', color: activeView === t.id ? '#F0F0F0' : '#555', padding: '10px 16px 9px', cursor: 'pointer', fontSize: 12, fontWeight: activeView === t.id ? 600 : 400, fontFamily: 'inherit', flexShrink: 0 }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

        {/* ── COMPETIDORES ── */}
        {activeView === 'competitors' && (
          <>
            {/* Add competitor */}
            <div style={{ marginBottom: 20 }}>
              {!showAdd ? (
                <button onClick={() => setShowAdd(true)} style={{ background: '#D63028', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
                  + Agregar competidor
                </button>
              ) : (
                <div style={{ background: '#1A1A1A', border: '1px solid #D63028', borderRadius: 12, padding: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#F0F0F0', marginBottom: 14 }}>Nuevo competidor</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Handle de Instagram *</label>
                      <input value={addHandle} onChange={e => setAddHandle(e.target.value)} placeholder="@agenciaejemplo" style={{ width: '100%', background: '#111', border: '1px solid #333', borderRadius: 8, color: '#F0F0F0', fontSize: 12.5, padding: '8px 12px', fontFamily: 'inherit' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Nombre</label>
                      <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="Agencia Ejemplo" style={{ width: '100%', background: '#111', border: '1px solid #333', borderRadius: 8, color: '#F0F0F0', fontSize: 12.5, padding: '8px 12px', fontFamily: 'inherit' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Categoría</label>
                      <input value={addCategory} onChange={e => setAddCategory(e.target.value)} placeholder="Agencia LatAm" style={{ width: '100%', background: '#111', border: '1px solid #333', borderRadius: 8, color: '#F0F0F0', fontSize: 12.5, padding: '8px 12px', fontFamily: 'inherit' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={addCompetitor} disabled={!addHandle.trim()} style={{ background: '#D63028', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Agregar</button>
                    <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: '1px solid #333', borderRadius: 8, padding: '8px 16px', fontSize: 12.5, color: '#666', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>

            {/* Competitor list */}
            {competitors.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#444', fontSize: 13 }}>
                Agrega competidores para comenzar el análisis
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {competitors.map(comp => (
                <div key={comp.handle} style={{ background: '#111', border: '1px solid #1E1E1E', borderRadius: 14, overflow: 'hidden' }}>
                  {/* Competitor header */}
                  <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: '1px solid #1A1A1A', cursor: 'pointer' }} onClick={() => setActiveComp(activeComp?.handle === comp.handle ? null : comp)}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#D63028,#7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                      {comp.handle.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#F0F0F0' }}>@{comp.handle}</div>
                      <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{comp.name} · {comp.category}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {['profile','content','strategy'].map(t => analysis[`${comp.handle}_${t}`] && (
                        <span key={t} style={{ fontSize: 9, background: '#22C55E22', color: '#22C55E', padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '.5px' }}>{t === 'profile' ? 'Perfil' : t === 'content' ? 'Contenido' : 'Estrategia'}</span>
                      ))}
                      <button onClick={(e) => { e.stopPropagation(); removeCompetitor(comp.handle) }} style={{ background: 'none', border: 'none', color: '#333', cursor: 'pointer', fontSize: 16, padding: '4px', lineHeight: 1 }}>×</button>
                      <span style={{ color: '#444', fontSize: 14 }}>{activeComp?.handle === comp.handle ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Analysis panels — shown when expanded */}
                  {activeComp?.handle === comp.handle && (
                    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <AnalysisCard
                        title="Análisis de perfil y estrategia general"
                        analysisKey={`${comp.handle}_profile`}
                        prompt={() => analyze(comp, 'profile')}
                        icon="👤"
                        color="#D63028"
                      />
                      <AnalysisCard
                        title="Análisis de contenido reciente"
                        analysisKey={`${comp.handle}_content`}
                        prompt={() => analyze(comp, 'content')}
                        icon="📱"
                        color="#7C3AED"
                      />
                      <AnalysisCard
                        title="Oportunidades para @gorillagency"
                        analysisKey={`${comp.handle}_strategy`}
                        prompt={() => analyze(comp, 'strategy')}
                        icon="⚡"
                        color="#D63028"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── MERCADO & TENDENCIAS ── */}
        {activeView === 'market' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: '#1A0A00', border: '1px solid #D6302833', borderRadius: 12, padding: '14px 18px', fontSize: 12.5, color: '#D63028', lineHeight: 1.7 }}>
              🔭 <strong>Inteligencia de mercado en tiempo real.</strong> Claude busca en internet y analiza el ecosistema competitivo de agencias de marketing digital en LatAm para darte insights accionables.
            </div>

            <AnalysisCard
              title="Panorama del mercado — Agencias LatAm en Instagram"
              analysisKey="market_overview"
              prompt={() => analyzeMarket('overview')}
              icon="🌎"
              color="#D63028"
            />
            <AnalysisCard
              title="Tendencias de contenido Instagram 2026"
              analysisKey="market_trends"
              prompt={() => analyzeMarket('trends')}
              icon="📈"
              color="#7C3AED"
            />

            {/* Quick insights from existing analysis */}
            {Object.keys(analysis).filter(k => k.startsWith('market_')).length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#444', fontSize: 13, lineHeight: 1.8 }}>
                Haz clic en <strong style={{ color: '#D63028' }}>▶ Analizar</strong> en cualquiera de los cards de arriba para obtener tu análisis de mercado. Claude buscará información actualizada en internet.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
