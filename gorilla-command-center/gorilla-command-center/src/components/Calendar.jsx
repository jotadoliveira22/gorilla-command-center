import { useState, useEffect } from 'react'
import { igPublish } from '../lib/api.js'

function Spinner({ size = 14 }) {
  return <div style={{ width: size, height: size, border: '2px solid #333', borderTopColor: '#D63028', borderRadius: '50%', animation: 'spin .7s linear infinite', flexShrink: 0 }} />
}

export default function Calendar({ posts, setPosts, creds }) {
  const [form, setForm] = useState({ title: '', caption: '', imageUrl: '', date: '', time: '' })
  const [saving, setSaving] = useState(false)
  const [posting, setPosting] = useState(null)
  const [results, setResults] = useState({})

  // Auto-scheduler: check every minute for due posts
  useEffect(() => {
    const id = setInterval(async () => {
      if (!creds.accessToken || !creds.igUserId) return
      const now = new Date()
      const due = posts.filter(p => p.status === 'scheduled' && p.imageUrl && new Date(`${p.date}T${p.time}`) <= now)
      for (const post of due) {
        try {
          await igPublish(creds.accessToken, creds.igUserId, post.imageUrl, post.caption || '')
          setPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'published', publishedAt: new Date().toISOString() } : p))
        } catch (e) { console.error('Auto-post failed:', e.message) }
      }
    }, 60000)
    return () => clearInterval(id)
  }, [posts, creds])

  const schedule = async () => {
    if (!form.title || !form.date || !form.time) return
    setSaving(true)
    const np = { id: Date.now(), ...form, status: 'scheduled', createdAt: new Date().toISOString() }
    setPosts(p => [np, ...p])
    setForm({ title: '', caption: '', imageUrl: '', date: '', time: '' })
    setSaving(false)
  }

  const publish = async (post) => {
    if (!creds.accessToken || !creds.igUserId) { alert('Conecta tu Instagram en el Dashboard primero.'); return }
    if (!post.imageUrl) { alert('Agrega una URL de imagen pública para poder publicar.'); return }
    setPosting(post.id)
    try {
      const id = await igPublish(creds.accessToken, creds.igUserId, post.imageUrl, post.caption || '')
      setResults(r => ({ ...r, [post.id]: { ok: true, id } }))
      setPosts(p => p.map(x => x.id === post.id ? { ...x, status: 'published', publishedAt: new Date().toISOString() } : x))
    } catch (e) {
      setResults(r => ({ ...r, [post.id]: { ok: false, err: e.message } }))
    } finally { setPosting(null) }
  }

  const pending = posts.filter(p => p.status === 'scheduled').sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`))
  const done = posts.filter(p => p.status === 'published')

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* Form panel */}
      <div style={{ width: 300, borderRight: '1px solid #1A1A1A', padding: 20, overflowY: 'auto', flexShrink: 0 }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 12, letterSpacing: 2, color: '#555', marginBottom: 16 }}>AGENDAR PUBLICACIÓN</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label>Título interno *</label><input placeholder="Ej: Carrusel IA marketing" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div><label>Caption para Instagram</label><textarea placeholder="Texto que aparecerá en el post..." value={form.caption} onChange={e => setForm(f => ({ ...f, caption: e.target.value }))} rows={3} style={{ resize: 'vertical' }} /></div>
          <div>
            <label>URL de imagen pública</label>
            <input placeholder="https://..." value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} />
            <div style={{ fontSize: 11, color: '#444', marginTop: 4, lineHeight: 1.5 }}>Sube la imagen a Cloudinary (gratis) y pega la URL aquí. Requerida para auto-publicar.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
            <div><label>Fecha *</label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div><label>Hora *</label><input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} /></div>
          </div>
          <button className="btn-red" onClick={schedule} disabled={saving || !form.title || !form.date || !form.time} style={{ padding: 12, justifyContent: 'center' }}>
            {saving ? 'Guardando...' : '📅 Agendar publicación'}
          </button>
        </div>

        <div style={{ marginTop: 18, background: '#1A1400', border: '1px solid #3A2E00', borderRadius: 9, padding: 12, fontSize: 11.5, color: '#C8A840', lineHeight: 1.6 }}>
          <strong>Auto-posteo activo:</strong> Con la app abierta en el navegador, los posts se publican automáticamente a la hora programada si tienes Instagram conectado y URL de imagen configurada.
        </div>

        <div style={{ marginTop: 12, background: '#0A1A1A', border: '1px solid #0A3A3A', borderRadius: 9, padding: 12, fontSize: 11.5, color: '#4ACFCF', lineHeight: 1.6 }}>
          <strong>💡 Google Calendar sync</strong><br />
          Para sincronizar con Google Calendar, conecta la integración desde la configuración de tu cuenta de Google. Próximamente disponible en esta versión.
        </div>
      </div>

      {/* Posts list */}
      <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 12, letterSpacing: 2, color: '#555' }}>PUBLICACIONES</div>
          <div style={{ fontSize: 11, color: '#555' }}>{pending.length} pendientes · {done.length} publicadas</div>
        </div>

        {posts.length === 0 && (
          <div style={{ textAlign: 'center', color: '#555', fontSize: 13, marginTop: 50 }}>
            <div style={{ fontSize: 30, marginBottom: 9 }}>📅</div>No hay publicaciones agendadas.
          </div>
        )}

        {pending.length > 0 && (
          <>
            <div style={{ fontSize: 10, color: '#555', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 9 }}>Próximas</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 20 }}>
              {pending.map(post => {
                const r = results[post.id]
                const dt = new Date(`${post.date}T${post.time}`)
                const isPast = dt < new Date()
                return (
                  <div key={post.id} className="card" style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                    <div style={{ width: 48, height: 48, borderRadius: 8, background: '#333', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>
                      {post.imageUrl ? <img src={post.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => e.target.style.display = 'none'} /> : '📷'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</div>
                      <div style={{ fontSize: 11.5, color: '#555', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.caption || '(sin caption)'}</div>
                      <div style={{ fontSize: 10.5, color: isPast ? '#FF8080' : '#D63028' }}>
                        {isPast ? '⚠ Hora pasada · ' : ''}
                        {dt.toLocaleString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                      {r && <div style={{ fontSize: 11, marginTop: 4, color: r.ok ? '#22C55E' : '#FF8080' }}>{r.ok ? `✅ Publicado · ID: ${r.id}` : `❌ ${r.err}`}</div>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
                      <button className="btn-red" onClick={() => publish(post)} disabled={posting === post.id} style={{ fontSize: 11, padding: '6px 11px' }}>
                        {posting === post.id ? <><Spinner size={10} />...</> : '📤 Publicar'}
                      </button>
                      <button className="btn-ghost" onClick={() => setPosts(p => p.filter(x => x.id !== post.id))} style={{ fontSize: 11, padding: '5px 11px' }}>Eliminar</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {done.length > 0 && (
          <>
            <div style={{ fontSize: 10, color: '#555', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 9 }}>Publicadas</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {done.map(post => (
                <div key={post.id} className="card" style={{ display: 'flex', gap: 11, alignItems: 'center', opacity: .65 }}>
                  <div style={{ fontSize: 17 }}>✅</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{post.title}</div>
                    <div style={{ fontSize: 11, color: '#22C55E', marginTop: 2 }}>{post.publishedAt ? new Date(post.publishedAt).toLocaleString('es') : ''}</div>
                  </div>
                  <button className="btn-ghost" onClick={() => setPosts(p => p.filter(x => x.id !== post.id))} style={{ fontSize: 11, padding: '4px 9px' }}>×</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
