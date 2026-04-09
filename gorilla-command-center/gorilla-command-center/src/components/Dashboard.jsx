import { useState, useEffect } from 'react'
import { discoverIGAccounts, fetchIGData, storage } from '../lib/api.js'

const MOCK = {
  profile: { username: 'gorillagency', followers_count: 12840, media_count: 247, biography: 'Agencia de Marketing + IA 🦍' },
  kpis: [
    { label: 'Seguidores', value: '12.8K', delta: '+3.2%', icon: '👥' },
    { label: 'Posts totales', value: '247', delta: '+18', icon: '📸' },
    { label: 'Engagement est.', value: '4.8%', delta: '+0.6%', icon: '💬' },
    { label: 'Alcance est. 7d', value: '48.2K', delta: '+12.1%', icon: '📡' },
    { label: 'Impresiones est.', value: '94.5K', delta: '+8.7%', icon: '👁' },
    { label: 'Visitas perfil', value: '3.2K', delta: '+15%', icon: '🔍' },
  ],
  topMedia: [
    { id: 1, caption: 'El 90% de las marcas está tirando dinero con su marketing digital...', like_count: 1240, comments_count: 89, media_type: 'CAROUSEL_ALBUM' },
    { id: 2, caption: '5 herramientas de IA que reemplazan equipos enteros de marketing...', like_count: 980, comments_count: 67, media_type: 'IMAGE' },
    { id: 3, caption: 'Cómo automaticé mi agencia con IA en 30 días...', like_count: 874, comments_count: 112, media_type: 'VIDEO' },
  ],
}

function Spinner({ size = 16 }) {
  return <div style={{ width: size, height: size, border: '2px solid #222', borderTopColor: '#D63028', borderRadius: '50%', animation: 'spin .7s linear infinite', flexShrink: 0 }} />
}

export default function Dashboard({ creds, setCreds }) {
  const [step, setStep] = useState('token')
  const [token, setToken] = useState('')
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [igData, setIgData] = useState(null)

  useEffect(() => {
    const saved = storage.get('ig_creds')
    if (saved?.accessToken && saved?.igUserId) {
      setToken(saved.accessToken)
      setCreds(saved)
      setStep('connected')
      loadData(saved)
    }
  }, [])

  const loadData = async (c = creds) => {
    setLoading(true)
    try {
      const d = await fetchIGData(c.accessToken, c.igUserId)
      setIgData(d)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const discover = async () => {
    if (!token.trim()) return
    setLoading(true); setError('')
    try {
      const found = await discoverIGAccounts(token.trim())
      if (!found.length) throw new Error('No se encontraron cuentas Instagram Business conectadas a este token. Verifica que: (1) tu cuenta IG esté conectada a una Página de Facebook, (2) el token tenga los permisos: instagram_basic + pages_show_list.')
      setAccounts(found); setStep('discover')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const select = async (acc) => {
    setLoading(true); setError('')
    const nc = { accessToken: token.trim(), igUserId: acc.id }
    try {
      const d = await fetchIGData(nc.accessToken, nc.igUserId)
      storage.set('ig_creds', nc)
      setCreds(nc); setIgData(d); setStep('connected')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const disconnect = () => {
    storage.remove('ig_creds')
    setCreds({ accessToken: '', igUserId: '' })
    setStep('token'); setToken(''); setIgData(null); setAccounts([]); setError('')
  }

  const display = igData || MOCK
  const kpis = igData
    ? [
        { label: 'Seguidores', value: display.profile.followers_count >= 1000 ? (display.profile.followers_count / 1000).toFixed(1) + 'K' : display.profile.followers_count, icon: '👥', delta: '' },
        { label: 'Posts totales', value: display.profile.media_count, icon: '📸', delta: '' },
      ]
    : MOCK.kpis

  return (
    <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>

      {step === 'token' && (
        <div style={{ maxWidth: 500, margin: '0 auto', paddingTop: 16 }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>📊</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 19, letterSpacing: 2, marginBottom: 8 }}>CONECTAR INSTAGRAM</div>
            <div style={{ fontSize: 13, color: '#666', lineHeight: 1.7 }}>Pega tu Access Token y detectamos automáticamente tu cuenta Instagram Business.</div>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <label>Access Token de Meta</label>
            <input type="password" placeholder="EAAxxxx..." value={token} onChange={e => { setToken(e.target.value); setError('') }} onKeyDown={e => e.key === 'Enter' && discover()} />
            <div style={{ fontSize: 11.5, color: '#555', marginTop: 8, lineHeight: 1.7 }}>
              Obtén el token en <strong style={{ color: '#D63028' }}>developers.facebook.com/tools/explorer</strong><br />
              Permisos necesarios: <code style={{ background: '#222', padding: '1px 6px', borderRadius: 4, fontSize: 10 }}>instagram_basic</code> <code style={{ background: '#222', padding: '1px 6px', borderRadius: 4, fontSize: 10 }}>pages_show_list</code> <code style={{ background: '#222', padding: '1px 6px', borderRadius: 4, fontSize: 10 }}>instagram_manage_insights</code> <code style={{ background: '#222', padding: '1px 6px', borderRadius: 4, fontSize: 10 }}>instagram_content_publish</code>
            </div>
          </div>

          {error && <div style={{ background: '#1A0A0A', border: '1px solid #4A1A1A', borderRadius: 10, padding: '12px 16px', fontSize: 12.5, color: '#FF8080', marginBottom: 14, lineHeight: 1.6 }}>❌ {error}</div>}

          <button className="btn-red" onClick={discover} disabled={loading || !token.trim()} style={{ width: '100%', padding: 13, justifyContent: 'center' }}>
            {loading ? <><Spinner size={14} />Buscando cuentas...</> : '🔍 Detectar mis cuentas de Instagram'}
          </button>

          <div className="card" style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#555', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>Cómo obtener el Access Token</div>
            {[
              ['1', 'Graph API Explorer', 'developers.facebook.com/tools/explorer'],
              ['2', 'Selecciona tu App', 'Dropdown: "Gorilla Comand Center"'],
              ['3', 'Agrega los permisos', 'instagram_basic + pages_show_list + instagram_manage_insights + instagram_content_publish'],
              ['4', 'Generate Access Token', 'Clic en el botón azul → autoriza en el popup'],
              ['5', 'Pega aquí', 'Copia el token largo y pégalo arriba'],
            ].map(([n, t, d]) => (
              <div key={n} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #222' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#D63028', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{n}</div>
                <div><div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{t}</div><div style={{ fontSize: 11.5, color: '#555' }}>{d}</div></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 'discover' && (
        <div style={{ maxWidth: 500, margin: '0 auto', paddingTop: 16 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, letterSpacing: 2, marginBottom: 6 }}>CUENTAS ENCONTRADAS</div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 18 }}>Selecciona la cuenta que quieres conectar</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {accounts.map(acc => (
              <button key={acc.id} className="hrow" onClick={() => select(acc)} style={{ background: '#1A1A1A', border: '1px solid #222', borderRadius: 12, padding: '15px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', width: '100%', transition: 'background .15s' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#D63028,#FF6B35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, overflow: 'hidden' }}>
                  {acc.profile_picture_url ? <img src={acc.profile_picture_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🦍'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>@{acc.username}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{acc.followers_count?.toLocaleString()} seguidores · Página: {acc.pageName}</div>
                </div>
                <span style={{ color: '#D63028', fontSize: 13, fontWeight: 600 }}>Seleccionar →</span>
              </button>
            ))}
          </div>
          {error && <div style={{ background: '#1A0A0A', border: '1px solid #4A1A1A', borderRadius: 10, padding: '12px 16px', fontSize: 12.5, color: '#FF8080', marginBottom: 12, lineHeight: 1.6 }}>❌ {error}</div>}
          {loading && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#666', fontSize: 13 }}><Spinner />Conectando...</div>}
          <button className="btn-ghost" onClick={() => { setStep('token'); setError('') }} style={{ marginTop: 8 }}>← Volver</button>
        </div>
      )}

      {step === 'connected' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg,#D63028,#FF6B35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0, overflow: 'hidden' }}>
              {display.profile?.profile_picture_url ? <img src={display.profile.profile_picture_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🦍'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, letterSpacing: 1 }}>@{display.profile?.username}</div>
              <div style={{ fontSize: 12, color: '#666' }}>{display.profile?.biography}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {igData ? <span className="badge" style={{ background: '#22C55E22', color: '#22C55E' }}>Conectado</span> : <span className="badge" style={{ background: '#C8A84022', color: '#C8A840' }}>Demo</span>}
              <button className="btn-ghost" style={{ fontSize: 11, padding: '6px 12px' }} onClick={() => loadData()} disabled={loading}>{loading ? <Spinner size={12} /> : '↺'}</button>
              <button className="btn-ghost" style={{ fontSize: 11, padding: '6px 12px' }} onClick={disconnect}>Desconectar</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
            {kpis.slice(0, 6).map((k, i) => (
              <div key={i} className="card" style={{ padding: '15px 17px' }}>
                <div style={{ fontSize: 17, marginBottom: 7 }}>{k.icon}</div>
                <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.5 }}>{k.value}</div>
                <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{k.label}</div>
                {k.delta && <div style={{ fontSize: 10.5, color: '#22C55E', marginTop: 4, fontWeight: 600 }}>{k.delta}</div>}
              </div>
            ))}
          </div>

          {(display.topMedia || MOCK.topMedia).length > 0 && (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#555', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Top Posts</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(display.topMedia || MOCK.topMedia).map((p, i) => (
                  <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 15px' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 7, background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>#{i + 1}</div>
                    {p.media_url && <img src={p.media_url} style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} onError={e => e.target.style.display = 'none'} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>{p.caption || '(sin caption)'}</div>
                      <div style={{ fontSize: 11, color: '#666' }}>❤ {(p.like_count || 0).toLocaleString()} · 💬 {p.comments_count || 0} · {p.media_type}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
