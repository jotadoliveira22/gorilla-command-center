import { useState } from 'react'
import { callClaude } from '../lib/api.js'

function Spinner({ size = 14 }) {
  return <div style={{ width: size, height: size, border: '2px solid #333', borderTopColor: '#D63028', borderRadius: '50%', animation: 'spin .7s linear infinite', flexShrink: 0 }} />
}

const MOCK_ITEMS = [
  { id: 1, type: 'dm', user: '@mktlatam_pro', av: 'M', msg: 'Hola! Me interesa saber más sobre sus servicios de automatización con IA', time: 'Hace 5 min', unread: true },
  { id: 2, type: 'comment', user: '@emprendedor_ve', av: 'E', msg: '¿Esto aplica también para negocios pequeños o solo grandes empresas?', time: 'Hace 12 min', post: 'Carrusel: 5 errores de marketing', unread: true },
  { id: 3, type: 'dm', user: '@ceo_startup_mx', av: 'C', msg: 'Queremos contratar sus servicios. ¿Tienen paquetes corporativos?', time: 'Hace 28 min', unread: false },
  { id: 4, type: 'comment', user: '@freelancer_co', av: 'F', msg: 'Excelente contenido! ¿Recomiendan herramientas para empezar con IA?', time: 'Hace 1h', post: 'Reel: IA para marketing 2026', unread: false },
  { id: 5, type: 'dm', user: '@agencia_pe', av: 'A', msg: 'Vi su contenido sobre automatización y me gustaría una asesoría', time: 'Hace 2h', unread: false },
]

const SYSTEM = `Eres el community manager de @gorillagency. Genera respuestas cortas (máximo 3 oraciones), directas, con la personalidad de la marca: cercana, irreverente, experta. Incluye un CTA sutil si aplica. Solo devuelve el texto de la respuesta, sin explicaciones ni comillas.`

export default function DMs({ apiKey }) {
  const [sel, setSel] = useState(null)
  const [reply, setReply] = useState('')
  const [gen, setGen] = useState(false)
  const [auto, setAuto] = useState(false)
  const [copied, setCopied] = useState(false)

  const generate = async (item) => {
    setSel(item); setGen(true); setReply(''); setCopied(false)
    if (!apiKey) { setGen(false); alert('Configura tu Anthropic API Key en Configuración (⚙).'); return }
    try {
      const text = await callClaude(
        [{ role: 'user', content: `Genera respuesta a este ${item.type === 'dm' ? 'DM' : 'comentario'} de ${item.user}:\n"${item.msg}"` }],
        SYSTEM, apiKey
      )
      setReply(text)
    } catch (e) { setReply(`Error: ${e.message}`) }
    finally { setGen(false) }
  }

  const copy = () => {
    navigator.clipboard?.writeText(reply)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* Sidebar */}
      <div style={{ width: 280, borderRight: '1px solid #1A1A1A', overflowY: 'auto', flexShrink: 0 }}>
        <div style={{ padding: '13px 17px', borderBottom: '1px solid #1A1A1A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: '#555', letterSpacing: 1, textTransform: 'uppercase' }}>Bandeja</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 10, color: auto ? '#22C55E' : '#555' }}>{auto ? 'Auto ON' : 'Auto OFF'}</span>
            <div onClick={() => setAuto(a => !a)} style={{ width: 32, height: 17, borderRadius: 9, background: auto ? '#D63028' : '#333', cursor: 'pointer', position: 'relative', transition: 'background .2s' }}>
              <div style={{ position: 'absolute', top: 2, left: auto ? 14 : 2, width: 13, height: 13, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
            </div>
          </div>
        </div>
        {auto && <div style={{ padding: '8px 14px', background: '#0A1A0A', fontSize: 10, color: '#22C55E', borderBottom: '1px solid #1A1A1A' }}>⚡ Auto-respuesta requiere Meta Messaging API aprobada</div>}

        {MOCK_ITEMS.map(item => (
          <div key={item.id} onClick={() => generate(item)} className="hrow" style={{ padding: '12px 17px', cursor: 'pointer', borderBottom: '1px solid #1A1A1A', background: sel?.id === item.id ? '#1A1A1A' : 'transparent', display: 'flex', gap: 10, alignItems: 'flex-start', transition: 'background .15s' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: item.unread ? '#D63028' : '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{item.av}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontSize: 12, fontWeight: item.unread ? 700 : 500 }}>{item.user}</span>
                <span style={{ fontSize: 9.5, color: '#555' }}>{item.time}</span>
              </div>
              <div style={{ fontSize: 11, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.msg}</div>
              {item.type === 'comment' && <span className="badge" style={{ background: '#33333380', color: '#888', marginTop: 3, fontSize: 9 }}>Comentario</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Main panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 24, overflowY: 'auto' }}>
        {!sel ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 9, color: '#555', textAlign: 'center' }}>
            <div style={{ fontSize: 32 }}>💬</div>
            <div style={{ fontSize: 13 }}>Selecciona un mensaje para generar respuesta con IA</div>
            <div style={{ fontSize: 11.5, color: '#444', maxWidth: 360, lineHeight: 1.6 }}>
              Los mensajes de arriba son ejemplos. El envío automático real requiere que Meta apruebe tu app para la Messaging API (2–4 semanas de revisión en developers.facebook.com).
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 15 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#D63028', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{sel.av}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{sel.user}</div>
                <div style={{ fontSize: 11, color: '#555' }}>{sel.time} · {sel.type === 'dm' ? 'Mensaje directo' : sel.post}</div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13.5, lineHeight: 1.65 }}>{sel.msg}</div>
            </div>

            <div style={{ fontSize: 10.5, fontWeight: 600, color: '#555', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 9 }}>Respuesta generada por IA</div>

            {gen ? (
              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#555', fontSize: 13 }}><Spinner />Generando con tono de @gorillagency...</div>
            ) : reply ? (
              <>
                <div className="card" style={{ marginBottom: 11 }}>
                  <textarea value={reply} onChange={e => setReply(e.target.value)} rows={4} style={{ width: '100%', background: 'transparent', border: 'none', color: '#F0F0F0', fontSize: 13.5, lineHeight: 1.65, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
                </div>
                <div style={{ display: 'flex', gap: 9 }}>
                  <button className="btn-red" style={{ flex: 1, justifyContent: 'center' }} onClick={() => alert('Para enviar respuestas automáticas necesitas Meta Messaging API aprobada. Ve a developers.facebook.com → tu App → Agregar producto → Messenger.')}>
                    📤 Enviar respuesta
                  </button>
                  <button className="btn-ghost" onClick={() => generate(sel)}>↺ Regenerar</button>
                  <button className="btn-ghost" onClick={copy}>{copied ? '✅ Copiado' : 'Copiar'}</button>
                </div>
                <div style={{ fontSize: 11, color: '#444', marginTop: 8 }}>Para envío automático: aprobación Meta Messaging API requerida (2–4 semanas).</div>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
