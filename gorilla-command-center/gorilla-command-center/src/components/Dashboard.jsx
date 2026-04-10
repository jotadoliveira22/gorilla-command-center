import { useState, useEffect } from 'react'
import { storage } from '../lib/api.js'

function Spinner({ size = 16 }) {
  return <div style={{ width: size, height: size, border: '2px solid #222', borderTopColor: '#D63028', borderRadius: '50%', animation: 'spin .7s linear infinite', flexShrink: 0 }} />
}

async function metaGET(path, token) {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`https://graph.facebook.com/v19.0${path}${sep}access_token=${token}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data
}

async function fetchAllIGData(token, igUserId) {
  const since = Math.floor((Date.now() - 28 * 86400000) / 1000)
  const until = Math.floor(Date.now() / 1000)

  // 1. Profile
  const profile = await metaGET(
    `/${igUserId}?fields=username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url`,
    token
  )

  // 2. Account insights (28 days)
  let insights = {}
  try {
    const metricsDay = ['reach', 'impressions', 'profile_views', 'website_clicks', 'email_contacts', 'phone_call_clicks', 'follower_count']
    const res = await metaGET(
      `/${igUserId}/insights?metric=${metricsDay.join(',')}&period=day&since=${since}&until=${until}`,
      token
    )
    for (const item of (res.data || [])) {
      const total = item.values?.reduce((acc, v) => acc + (v.value || 0), 0) || 0
      insights[item.name] = total
    }
  } catch {}

  // 3. Top media with insights
  let topMedia = []
  try {
    const mediaRes = await metaGET(
      `/${igUserId}/media?fields=id,caption,like_count,comments_count,timestamp,media_type,media_url,thumbnail_url,permalink&limit=9`,
      token
    )
    const mediaList = mediaRes.data || []

    // Fetch insights per post
    topMedia = await Promise.all(mediaList.map(async (post) => {
      let postInsights = {}
      try {
        const fields = post.media_type === 'VIDEO'
          ? 'impressions,reach,plays,saved,shares'
          : 'impressions,reach,saved,shares'
        const ins = await metaGET(`/${post.id}/insights?metric=${fields}`, token)
        for (const i of (ins.data || [])) postInsights[i.name] = i.values?.[0]?.value || 0
      } catch {}
      return { ...post, insights: postInsights }
    }))
  } catch {}

  // 4. Stories insights (last 24h)
  let storiesCount = 0
  try {
    const stories = await metaGET(`/${igUserId}/stories?fields=id&limit=1`, token)
    storiesCount = stories.data?.length || 0
  } catch {}

  return { profile, insights, topMedia, storiesCount }
}

function StatCard({ icon, label, value, delta, color = '#D63028', sub }) {
  return (
    <div style={{ background: '#1A1A1A', border: '1px solid #222', borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#F0F0F0', letterSpacing: -0.5 }}>{value ?? '—'}</div>
      <div style={{ fontSize: 11.5, color: '#666' }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#444' }}>{sub}</div>}
      {delta !== undefined && delta !== null && (
        <div style={{ fontSize: 11, color: '#22C55E', fontWeight: 600 }}>{delta}</div>
      )}
    </div>
  )
}

function fmt(n) {
  if (n === undefined || n === null) return '—'
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toLocaleString()
}

function mediaTypeLabel(type) {
  if (type === 'VIDEO') return '🎬 Reel/Video'
  if (type === 'CAROUSEL_ALBUM') return '📸 Carrusel'
  return '🖼 Imagen'
}

export default function Dashboard({ creds, setCreds }) {
  const [step, setStep] = useState('token')
  const [token, setToken] = useState('')
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [igData, setIgData] = useState(null)
  const [manualId, setManualId] = useState('')

  useEffect(() => {
    const saved = storage.get('ig_creds')
    if (saved?.accessToken && saved?.igUserId) {
      setToken(saved.accessToken)
      setCreds(saved)
      setStep('connected')
      loadAll(saved)
    }
  }, [])

  const loadAll = async (c = creds) => {
    setRefreshing(true)
    try {
      const data = await fetchAllIGData(c.accessToken, c.igUserId)
      setIgData(data)
    } catch (e) { setError(e.message) }
    finally { setRefreshing(false) }
  }

  const discover = async () => {
    if (!token.trim()) return
    setLoading(true); setError('')
    try {
      const pages = await metaGET('/me/accounts?fields=id,name,instagram_business_account', token.trim())
      const accounts = []
      for (const page of (pages.data || [])) {
        if (page.instagram_business_account) {
          try {
            const ig = await metaGET(`/${page.instagram_business_account.id}?fields=id,username,followers_count,media_count,profile_picture_url`, token.trim())
            accounts.push({ ...ig, pageName: page.name })
          } catch {}
        }
      }
      if (!accounts.length) throw new Error('No se encontraron cuentas Business. Usa el ID manual abajo.')
      setAccounts(accounts); setStep('discover')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const select = async (acc) => {
    setLoading(true); setError('')
    const nc = { accessToken: token.trim(), igUserId: acc.id }
    try {
      const data = await fetchAllIGData(nc.accessToken, nc.igUserId)
      storage.set('ig_creds', nc)
      setCreds(nc); setIgData(data); setStep('connected')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const connectManual = async () => {
    if (!token.trim() || !manualId.trim()) return
    setLoading(true); setError('')
    const nc = { accessToken: token.trim(), igUserId: manualId.trim() }
    try {
      const data = await fetchAllIGData(nc.accessToken, nc.igUserId)
      storage.set('ig_creds', nc)
      setCreds(nc); setIgData(data); setStep('connected')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const disconnect = () => {
    storage.remove('ig_creds')
    setCreds({ accessToken: '', igUserId: '' })
    setStep('token'); setToken(''); setIgData(null); setAccounts([]); setError('')
  }

  // ── CONNECTED VIEW ─────────────────────────────────────────────────────────
  if (step === 'connected' && igData) {
    const { profile, insights, topMedia } = igData
    const engagementRate = profile.followers_count
      ? ((topMedia.slice(0, 5).reduce((a, p) => a + (p.like_count || 0) + (p.comments_count || 0), 0) / 5) / profile.followers_count * 100).toFixed(2)
      : null

    return (
      <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
        {/* Profile header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28, padding: '18px 20px', background: '#1A1A1A', border: '1px solid #222', borderRadius: 14 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg,#D63028,#FF6B35)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
            {profile.profile_picture_url
              ? <img src={profile.profile_picture_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => e.target.style.display = 'none'} />
              : '🦍'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 1, color: '#F0F0F0' }}>@{profile.username}</div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 3, lineHeight: 1.5 }}>{profile.biography}</div>
            {profile.website && <div style={{ fontSize: 11, color: '#D63028', marginTop: 4 }}>{profile.website}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <span style={{ background: '#22C55E22', color: '#22C55E', fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 6, letterSpacing: '.5px', textTransform: 'uppercase' }}>Conectado</span>
            <button onClick={() => loadAll()} disabled={refreshing} style={{ background: 'none', border: '1px solid #222', borderRadius: 8, padding: '5px 10px', color: '#555', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
              {refreshing ? <Spinner size={12} /> : '↺ Actualizar'}
            </button>
            <button onClick={disconnect} style={{ background: 'none', border: '1px solid #222', borderRadius: 8, padding: '5px 10px', color: '#555', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Desconectar</button>
          </div>
        </div>

        {/* Main KPIs */}
        <div style={{ fontSize: 11, color: '#555', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12, fontWeight: 600 }}>Cuenta</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
          <StatCard icon="👥" label="Seguidores" value={fmt(profile.followers_count)} />
          <StatCard icon="➡️" label="Siguiendo" value={fmt(profile.follows_count)} />
          <StatCard icon="📸" label="Publicaciones" value={fmt(profile.media_count)} />
          <StatCard icon="💬" label="Engagement rate (5 posts)" value={engagementRate ? engagementRate + '%' : '—'} />
        </div>

        {/* Insights 28 días */}
        <div style={{ fontSize: 11, color: '#555', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12, fontWeight: 600 }}>Insights últimos 28 días</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
          <StatCard icon="📡" label="Alcance total" value={fmt(insights.reach)} sub="Cuentas únicas alcanzadas" />
          <StatCard icon="👁" label="Impresiones" value={fmt(insights.impressions)} sub="Veces que se vio tu contenido" />
          <StatCard icon="🔍" label="Visitas al perfil" value={fmt(insights.profile_views)} sub="Personas que visitaron tu perfil" />
          <StatCard icon="📈" label="Seguidores nuevos" value={fmt(insights.follower_count)} sub="Ganados en 28 días" />
          <StatCard icon="🌐" label="Clicks al sitio web" value={fmt(insights.website_clicks)} sub="Desde tu bio" />
          <StatCard icon="📧" label="Contactos email" value={fmt(insights.email_contacts)} sub="Clicks en email de bio" />
          <StatCard icon="📞" label="Clicks teléfono" value={fmt(insights.phone_call_clicks)} sub="Llamadas desde perfil" />
          <StatCard icon="📊" label="Posts analizados" value={topMedia.length} sub="Últimas publicaciones" />
        </div>

        {/* Top Posts */}
        {topMedia.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: '#555', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14, fontWeight: 600 }}>Últimas publicaciones</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {topMedia.map((post, i) => (
                <div key={i} style={{ background: '#1A1A1A', border: '1px solid #222', borderRadius: 12, overflow: 'hidden' }}>
                  {/* Thumbnail */}
                  <div style={{ width: '100%', aspectRatio: '1', background: '#2A2A2A', position: 'relative', overflow: 'hidden' }}>
                    {(post.media_url || post.thumbnail_url) && (
                      <img
                        src={post.media_url || post.thumbnail_url}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={e => e.target.style.display = 'none'}
                      />
                    )}
                    <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,.7)', borderRadius: 6, padding: '3px 8px', fontSize: 10, color: '#fff' }}>
                      {mediaTypeLabel(post.media_type)}
                    </div>
                    <a href={post.permalink} target="_blank" rel="noreferrer" style={{ position: 'absolute', inset: 0 }} />
                  </div>
                  {/* Stats */}
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4 }}>
                      {post.caption || '(sin caption)'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                      <div style={{ fontSize: 11, color: '#555' }}>❤ <span style={{ color: '#F0F0F0', fontWeight: 600 }}>{fmt(post.like_count)}</span> likes</div>
                      <div style={{ fontSize: 11, color: '#555' }}>💬 <span style={{ color: '#F0F0F0', fontWeight: 600 }}>{fmt(post.comments_count)}</span> comentarios</div>
                      {post.insights?.reach > 0 && <div style={{ fontSize: 11, color: '#555' }}>📡 <span style={{ color: '#F0F0F0', fontWeight: 600 }}>{fmt(post.insights.reach)}</span> alcance</div>}
                      {post.insights?.impressions > 0 && <div style={{ fontSize: 11, color: '#555' }}>👁 <span style={{ color: '#F0F0F0', fontWeight: 600 }}>{fmt(post.insights.impressions)}</span> impresiones</div>}
                      {post.insights?.saved > 0 && <div style={{ fontSize: 11, color: '#555' }}>🔖 <span style={{ color: '#F0F0F0', fontWeight: 600 }}>{fmt(post.insights.saved)}</span> guardados</div>}
                      {post.insights?.shares > 0 && <div style={{ fontSize: 11, color: '#555' }}>↗ <span style={{ color: '#F0F0F0', fontWeight: 600 }}>{fmt(post.insights.shares)}</span> compartidos</div>}
                      {post.insights?.plays > 0 && <div style={{ fontSize: 11, color: '#555' }}>▶ <span style={{ color: '#F0F0F0', fontWeight: 600 }}>{fmt(post.insights.plays)}</span> reproducciones</div>}
                    </div>
                    <div style={{ fontSize: 10, color: '#444', marginTop: 8 }}>
                      {new Date(post.timestamp).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {error && <div style={{ marginTop: 16, background: '#1A0A0A', border: '1px solid #4A1A1A', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#FF8080' }}>⚠️ {error}</div>}
      </div>
    )
  }

  // ── CONNECTING VIEW ────────────────────────────────────────────────────────
  if (step === 'connected' && !igData) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: '#666', fontSize: 13 }}>
        <Spinner size={18} /> Cargando datos de Instagram...
      </div>
    )
  }

  // ── DISCOVER VIEW ──────────────────────────────────────────────────────────
  if (step === 'discover') {
    return (
      <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
        <div style={{ maxWidth: 500, margin: '0 auto', paddingTop: 16 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, letterSpacing: 2, marginBottom: 6 }}>CUENTAS ENCONTRADAS</div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 18 }}>Selecciona la cuenta que quieres conectar</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {accounts.map(acc => (
              <button key={acc.id} onClick={() => select(acc)} style={{ background: '#1A1A1A', border: '1px solid #222', borderRadius: 12, padding: '15px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', width: '100%', transition: 'background .15s', fontFamily: 'inherit' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#D63028,#FF6B35)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  {acc.profile_picture_url ? <img src={acc.profile_picture_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🦍'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#F0F0F0', marginBottom: 3 }}>@{acc.username}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{acc.followers_count?.toLocaleString()} seguidores · Página: {acc.pageName}</div>
                </div>
                <span style={{ color: '#D63028', fontSize: 13, fontWeight: 600 }}>Seleccionar →</span>
              </button>
            ))}
          </div>
          {error && <div style={{ background: '#1A0A0A', border: '1px solid #4A1A1A', borderRadius: 10, padding: '12px 16px', fontSize: 12.5, color: '#FF8080', marginBottom: 12 }}>❌ {error}</div>}
          {loading && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#666', fontSize: 13 }}><Spinner />Conectando...</div>}
          <button onClick={() => { setStep('token'); setError('') }} style={{ background: 'none', border: '1px solid #222', borderRadius: 8, padding: '7px 14px', color: '#555', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', marginTop: 8 }}>← Volver</button>
        </div>
      </div>
    )
  }

  // ── TOKEN INPUT VIEW ───────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
      <div style={{ maxWidth: 500, margin: '0 auto', paddingTop: 16 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>📊</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 19, letterSpacing: 2, marginBottom: 8 }}>CONECTAR INSTAGRAM</div>
          <div style={{ fontSize: 13, color: '#666', lineHeight: 1.7 }}>Conecta tu cuenta Business para ver todos tus KPIs en tiempo real.</div>
        </div>

        <div style={{ background: '#1A1A1A', border: '1px solid #222', borderRadius: 12, padding: 18, marginBottom: 14 }}>
          <label style={{ fontSize: 11.5, color: '#666', display: 'block', marginBottom: 5 }}>Access Token de Meta</label>
          <input type="password" placeholder="EAAxxxx..." value={token} onChange={e => { setToken(e.target.value); setError('') }} onKeyDown={e => e.key === 'Enter' && discover()} style={{ width: '100%', background: '#111', border: '1px solid #222', borderRadius: 10, color: '#F0F0F0', fontSize: 13, padding: '10px 14px', fontFamily: 'inherit' }} />
          <div style={{ fontSize: 11, color: '#444', marginTop: 8, lineHeight: 1.7 }}>
            <strong style={{ color: '#D63028' }}>developers.facebook.com/tools/explorer</strong><br />
            Permisos: instagram_basic · pages_show_list · instagram_manage_insights · instagram_content_publish
          </div>
        </div>

        {error && <div style={{ background: '#1A0A0A', border: '1px solid #4A1A1A', borderRadius: 10, padding: '12px 16px', fontSize: 12.5, color: '#FF8080', marginBottom: 14, lineHeight: 1.6 }}>❌ {error}</div>}

        <button onClick={discover} disabled={loading || !token.trim()} style={{ background: '#D63028', color: '#fff', border: 'none', borderRadius: 10, padding: '13px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: '100%', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {loading ? <><Spinner size={14} />Buscando...</> : '🔍 Detectar mis cuentas automáticamente'}
        </button>

        <div style={{ textAlign: 'center', fontSize: 11.5, color: '#444', marginBottom: 10 }}>— o ingresa el ID manualmente —</div>

        <div style={{ background: '#1A1A1A', border: '1px solid #222', borderRadius: 12, padding: 18 }}>
          <label style={{ fontSize: 11.5, color: '#666', display: 'block', marginBottom: 5 }}>Instagram Business Account ID</label>
          <input placeholder="17841408592252612" value={manualId} onChange={e => setManualId(e.target.value)} style={{ width: '100%', background: '#111', border: '1px solid #222', borderRadius: 10, color: '#F0F0F0', fontSize: 13, padding: '10px 14px', fontFamily: 'inherit', marginBottom: 10 }} />
          <div style={{ fontSize: 11, color: '#555', marginBottom: 12 }}>Tu ID de @gorillagency: <strong style={{ color: '#D63028' }}>17841408592252612</strong></div>
          <button onClick={connectManual} disabled={loading || !token.trim() || !manualId.trim()} style={{ background: '#D63028', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {loading ? <><Spinner size={14} />Conectando...</> : '🔗 Conectar con ID manual'}
          </button>
        </div>

        <div style={{ background: '#1A1A1A', border: '1px solid #222', borderRadius: 12, padding: 18, marginTop: 20 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: '#555', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>Cómo obtener el Access Token</div>
          {[
            ['1', 'Graph API Explorer', 'developers.facebook.com/tools/explorer'],
            ['2', 'Selecciona "Gorilla Comand Center"', 'Dropdown App de Meta'],
            ['3', 'Agrega los permisos', 'instagram_basic + pages_show_list + instagram_manage_insights + instagram_content_publish'],
            ['4', 'Generate Access Token', 'Autoriza en el popup y copia el token'],
          ].map(([n, t, d]) => (
            <div key={n} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #222' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#D63028', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, color: '#fff' }}>{n}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#F0F0F0', marginBottom: 2 }}>{t}</div>
                <div style={{ fontSize: 11.5, color: '#555' }}>{d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
