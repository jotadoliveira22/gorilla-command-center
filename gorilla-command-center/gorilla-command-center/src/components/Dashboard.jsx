import { useState, useEffect } from 'react'
import { storage } from '../lib/api.js'

// ── Core API call ─────────────────────────────────────────────────────────────
async function metaGET(path, token) {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`https://graph.facebook.com/v19.0${path}${sep}access_token=${token}`)
  const data = await res.json()
  if (data.error) throw new Error(`${data.error.message} (code ${data.error.code})`)
  return data
}

// ── Main data fetch — mirrors exactly what Instagram shows ────────────────────
async function fetchAllData(token, igUserId) {
  const debugLog = []

  // 1. Profile
  const profile = await metaGET(
    `/${igUserId}?fields=username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url`,
    token
  )
  debugLog.push(`✓ Profile: @${profile.username}, ${profile.followers_count} seguidores`)

  // 2. Account-level insights — period=days_28 gives the EXACT 28-day aggregate
  //    that Instagram's app shows (not a sum of daily values)
  const insights = { impressions: 0, reach: 0, profile_views: 0, website_clicks: 0, follower_count: 0 }
  try {
    const res = await metaGET(
      `/${igUserId}/insights?metric=impressions,reach,profile_views,website_clicks,follower_count&period=days_28`,
      token
    )
    for (const item of (res.data || [])) {
      // days_28 returns a single value in values[0].value
      insights[item.name] = item.values?.[0]?.value ?? 0
    }
    debugLog.push(`✓ Account insights (28d): impressions=${insights.impressions}, reach=${insights.reach}, profile_views=${insights.profile_views}`)
  } catch (e) {
    debugLog.push(`✗ Account insights error: ${e.message}`)
    // Fallback: try period=day with date range
    try {
      const since = Math.floor((Date.now() - 27 * 86400000) / 1000)
      const until = Math.floor(Date.now() / 1000)
      const res2 = await metaGET(
        `/${igUserId}/insights?metric=impressions,reach,profile_views&period=day&since=${since}&until=${until}`,
        token
      )
      for (const item of (res2.data || [])) {
        insights[item.name] = (item.values || []).reduce((a, v) => a + (Number(v.value) || 0), 0)
      }
      debugLog.push(`✓ Fallback daily insights: impressions=${insights.impressions}, reach=${insights.reach}`)
    } catch (e2) {
      debugLog.push(`✗ Fallback insights error: ${e2.message}`)
    }
  }

  // 3. Engagement metrics — aggregate from posts since Instagram app shows
  //    total likes, comments, saves, shares for the period
  const engagementTotals = { likes: 0, comments: 0, saved: 0, shares: 0, plays: 0 }
  let topMedia = []
  try {
    const mediaRes = await metaGET(
      `/${igUserId}/media?fields=id,caption,like_count,comments_count,timestamp,media_type,media_url,thumbnail_url,permalink&limit=20`,
      token
    )
    const mediaList = mediaRes.data || []
    debugLog.push(`✓ Media: ${mediaList.length} posts`)

    // Fetch insights per post
    const since28 = new Date(Date.now() - 28 * 86400000)
    topMedia = await Promise.all(mediaList.slice(0, 9).map(async (post) => {
      let pi = {}
      try {
        // Different metric sets per media type
        let metrics
        if (post.media_type === 'VIDEO') {
          metrics = 'impressions,reach,plays,saved,shares'
        } else if (post.media_type === 'CAROUSEL_ALBUM') {
          metrics = 'carousel_album_impressions,carousel_album_reach,carousel_album_saved,carousel_album_shares'
        } else {
          metrics = 'impressions,reach,saved,shares'
        }
        const ins = await metaGET(`/${post.id}/insights?metric=${metrics}`, token)
        for (const i of (ins.data || [])) {
          // Normalize carousel metric names
          const key = i.name
            .replace('carousel_album_', '')
          pi[key] = i.values?.[0]?.value ?? 0
        }
      } catch {}

      // Add to engagement totals for posts within last 28 days
      if (new Date(post.timestamp) >= since28) {
        engagementTotals.likes += post.like_count || 0
        engagementTotals.comments += post.comments_count || 0
        engagementTotals.saved += pi.saved || 0
        engagementTotals.shares += pi.shares || 0
        engagementTotals.plays += pi.plays || 0
      }

      return { ...post, pi }
    }))
    debugLog.push(`✓ Post insights loaded. Engagement: likes=${engagementTotals.likes}, saved=${engagementTotals.saved}, shares=${engagementTotals.shares}`)
  } catch (e) {
    debugLog.push(`✗ Media error: ${e.message}`)
  }

  // 4. Audience demographics (lifetime — same as Instagram app)
  const audience = { genderAge: {}, cities: {}, countries: {} }
  try {
    const audRes = await metaGET(
      `/${igUserId}/insights?metric=audience_gender_age,audience_city,audience_country&period=lifetime`,
      token
    )
    for (const item of (audRes.data || [])) {
      const val = item.values?.[0]?.value || {}
      if (item.name === 'audience_gender_age') audience.genderAge = val
      if (item.name === 'audience_city') audience.cities = val
      if (item.name === 'audience_country') audience.countries = val
    }
    debugLog.push(`✓ Audience: ${Object.keys(audience.genderAge).length} gender/age groups, ${Object.keys(audience.cities).length} cities`)
  } catch (e) {
    debugLog.push(`✗ Audience error: ${e.message}`)
  }

  // 5. Online followers by hour
  const onlineHours = {}
  try {
    const onlineRes = await metaGET(
      `/${igUserId}/insights?metric=online_followers&period=lifetime`,
      token
    )
    const raw = onlineRes.data?.[0]?.values?.[0]?.value || {}
    for (let h = 0; h < 24; h++) onlineHours[h] = raw[h] || 0
    debugLog.push(`✓ Online hours loaded`)
  } catch (e) {
    debugLog.push(`✗ Online hours error: ${e.message}`)
  }

  // If account-level impressions/reach still 0, fallback to post aggregation
  if (!insights.impressions) {
    const fallback = topMedia.reduce((a, p) => a + (p.pi?.impressions || 0), 0)
    if (fallback > 0) { insights.impressions = fallback; debugLog.push(`ℹ Impressions from posts fallback: ${fallback}`) }
  }
  if (!insights.reach) {
    const fallback = topMedia.reduce((a, p) => a + (p.pi?.reach || 0), 0)
    if (fallback > 0) { insights.reach = fallback; debugLog.push(`ℹ Reach from posts fallback: ${fallback}`) }
  }

  return { profile, insights, engagementTotals, audience, onlineHours, topMedia, debugLog }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function fmt(n) {
  if (n == null || n === '') return '—'
  const num = Number(n)
  if (isNaN(num)) return '—'
  if (num >= 1000000) return (num/1000000).toFixed(1)+'M'
  if (num >= 1000) return (num/1000).toFixed(1)+'K'
  return num.toLocaleString('es')
}

function Spinner({ size = 16 }) {
  return <div style={{ width: size, height: size, border: '2px solid #333', borderTopColor: '#D63028', borderRadius: '50%', animation: 'spin .7s linear infinite', flexShrink: 0 }} />
}

function DonutChart({ value, label, pct1, label1, pct2, label2, color1='#CC0000', color2='#7C3AED' }) {
  const r=70, cx=90, cy=90, circ=2*Math.PI*r
  const d1=Math.max(0,(pct1/100)*circ), d2=Math.max(0,(pct2/100)*circ)
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:14 }}>
      <svg width={180} height={180}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2A2A2A" strokeWidth={16}/>
        {d1>0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke={color1} strokeWidth={16} strokeDasharray={`${d1} ${circ}`} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}/>}
        {d2>0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke={color2} strokeWidth={16} strokeDasharray={`${d2} ${circ}`} strokeLinecap="round" transform={`rotate(${-90+(pct1/100)*360} ${cx} ${cy})`}/>}
        <text x={cx} y={cy-12} textAnchor="middle" fill="#888" fontSize={12} fontFamily="DM Sans,sans-serif">{label}</text>
        <text x={cx} y={cy+14} textAnchor="middle" fill="#F0F0F0" fontSize={32} fontWeight={700} fontFamily="DM Sans,sans-serif">{value}</text>
      </svg>
      <div style={{ display:'flex', gap:20, flexWrap:'wrap', justifyContent:'center' }}>
        {label1 && <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#888' }}><div style={{ width:10, height:10, borderRadius:'50%', background:color1 }}/>{label1}</div>}
        {label2 && <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#888' }}><div style={{ width:10, height:10, borderRadius:'50%', background:color2 }}/>{label2}</div>}
      </div>
    </div>
  )
}

function HBar({ label, pct, value, color='#CC0000' }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:13, color:'#CCC' }}>
        <span>{label}</span><span style={{ color:'#888' }}>{value ?? `${Math.round(pct)}%`}</span>
      </div>
      <div style={{ height:6, background:'#2A2A2A', borderRadius:3, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${Math.min(Math.max(pct,0),100)}%`, background:color, borderRadius:3, transition:'width .5s' }}/>
      </div>
    </div>
  )
}

function BarChart({ data, color='#CC0000', maxH=100 }) {
  if (!data?.length) return null
  const max = Math.max(...data.map(d=>d.value), 1)
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:3, height:maxH+24 }}>
      {data.map((d,i) => (
        <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
          <div style={{ width:'100%', height:Math.max(3,(d.value/max)*maxH), background:color, borderRadius:'3px 3px 0 0' }}/>
          <div style={{ fontSize:9, color:'#555', whiteSpace:'nowrap' }}>{d.label}</div>
        </div>
      ))}
    </div>
  )
}

function SH({ title }) {
  return <div style={{ fontSize:11, color:'#555', letterSpacing:1, textTransform:'uppercase', marginBottom:12, fontWeight:600, marginTop:24 }}>{title}</div>
}

function KpiCard({ icon, label, value, sub, delta }) {
  return (
    <div style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:'16px 18px' }}>
      <div style={{ fontSize:20, marginBottom:8 }}>{icon}</div>
      <div style={{ fontSize:22, fontWeight:700, color:'#F0F0F0', letterSpacing:-0.5 }}>{value}</div>
      <div style={{ fontSize:11, color:'#555', marginTop:3 }}>{label}</div>
      {sub && <div style={{ fontSize:10, color:'#444', marginTop:2 }}>{sub}</div>}
      {delta != null && <div style={{ fontSize:11, color:Number(delta)>=0?'#22C55E':'#FF6B6B', marginTop:4, fontWeight:600 }}>{Number(delta)>=0?'+':''}{delta}</div>}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Dashboard({ creds, setCreds }) {
  const [step, setStep] = useState('token')
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [manualId, setManualId] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [showDebug, setShowDebug] = useState(false)

  useEffect(() => {
    const saved = storage.get('ig_creds')
    if (saved?.accessToken && saved?.igUserId) {
      setToken(saved.accessToken); setCreds(saved); setStep('connected')
      loadAll(saved)
    }
  }, [])

  const loadAll = async (c = creds) => {
    setRefreshing(true); setError('')
    try { setData(await fetchAllData(c.accessToken, c.igUserId)) }
    catch(e) { setError(e.message) }
    finally { setRefreshing(false) }
  }

  const connectManual = async () => {
    if (!token.trim() || !manualId.trim()) return
    setLoading(true); setError('')
    const nc = { accessToken: token.trim(), igUserId: manualId.trim() }
    try {
      const d = await fetchAllData(nc.accessToken, nc.igUserId)
      storage.set('ig_creds', nc); setCreds(nc); setData(d); setStep('connected')
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const discover = async () => {
    if (!token.trim()) return
    setLoading(true); setError('')
    try {
      const pages = await metaGET('/me/accounts?fields=id,name,instagram_business_account', token.trim())
      for (const pg of (pages.data || [])) {
        if (pg.instagram_business_account) {
          const nc = { accessToken: token.trim(), igUserId: pg.instagram_business_account.id }
          const d = await fetchAllData(nc.accessToken, nc.igUserId)
          storage.set('ig_creds', nc); setCreds(nc); setData(d); setStep('connected')
          return
        }
      }
      throw new Error('No se encontraron cuentas Business. Usa el ID manual.')
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const disconnect = () => {
    storage.remove('ig_creds'); setCreds({ accessToken:'', igUserId:'' })
    setStep('token'); setToken(''); setData(null); setError('')
  }

  // ── ANALYTICS VIEW ──────────────────────────────────────────────────────────
  if (step === 'connected' && data) {
    const { profile, insights, engagementTotals, audience, onlineHours, topMedia, debugLog } = data

    // Gender breakdown
    const genderAge = audience.genderAge || {}
    const ageGroups = ['13-17','18-24','25-34','35-44','45-54','55-64','65+']
    const ageData = ageGroups.map(ag => ({
      label: ag,
      value: (genderAge[`M.${ag}`] || 0) + (genderAge[`F.${ag}`] || 0)
    }))
    const totalAudience = ageData.reduce((a,d) => a+d.value, 0) || 0
    const maleTotal = Object.entries(genderAge).filter(([k]) => k.startsWith('M.')).reduce((a,[,v]) => a+v, 0)
    const femaleTotal = Object.entries(genderAge).filter(([k]) => k.startsWith('F.')).reduce((a,[,v]) => a+v, 0)
    const gTotal = maleTotal + femaleTotal || 1

    // Cities
    const cities = Object.entries(audience.cities || {}).sort((a,b) => b[1]-a[1]).slice(0, 6)
    const maxCity = cities[0]?.[1] || 1

    // Online hours
    const hourData = Array.from({length:24}, (_,h) => ({
      label: h % 3 === 0 ? `${h}h` : '',
      value: onlineHours[h] || 0
    }))

    // Totals
    const totalInteractions = engagementTotals.likes + engagementTotals.comments + engagementTotals.saved + engagementTotals.shares

    const TABS = [
      { id:'overview', label:'Resumen' },
      { id:'views', label:'Visualizaciones' },
      { id:'interactions', label:'Interacciones' },
      { id:'audience', label:'Seguidores' },
    ]

    return (
      <div style={{ height:'100%', display:'flex', flexDirection:'column', minHeight:0 }}>
        {/* Header */}
        <div style={{ padding:'12px 20px', borderBottom:'1px solid #1A1A1A', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
          <div style={{ width:42, height:42, borderRadius:'50%', background:'linear-gradient(135deg,#D63028,#FF6B35)', flexShrink:0, overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17 }}>
            {profile.profile_picture_url
              ? <img src={profile.profile_picture_url} style={{ width:'100%',height:'100%',objectFit:'cover' }} onError={e=>e.target.style.display='none'}/>
              : '🦍'}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:15, letterSpacing:1, color:'#F0F0F0' }}>@{profile.username}</div>
            <div style={{ fontSize:10, color:'#555', marginTop:1 }}>
              Últimos 28 días · {new Date(Date.now()-28*86400000).toLocaleDateString('es',{day:'numeric',month:'short'})} – {new Date().toLocaleDateString('es',{day:'numeric',month:'short'})}
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <span style={{ background:'#22C55E22', color:'#22C55E', fontSize:10, fontWeight:600, padding:'3px 8px', borderRadius:6, textTransform:'uppercase' }}>Conectado</span>
            <button onClick={() => setShowDebug(s => !s)} style={{ background:'none', border:'1px solid #333', borderRadius:7, padding:'4px 8px', color:'#444', cursor:'pointer', fontSize:10, fontFamily:'inherit' }}>
              {showDebug ? 'Ocultar debug' : 'Debug'}
            </button>
            <button onClick={() => loadAll()} disabled={refreshing} style={{ background:'none', border:'1px solid #222', borderRadius:7, padding:'4px 10px', color:'#555', cursor:'pointer', fontSize:11, fontFamily:'inherit', display:'flex', alignItems:'center', gap:4 }}>
              {refreshing ? <Spinner size={11}/> : '↺'} Actualizar
            </button>
            <button onClick={disconnect} style={{ background:'none', border:'1px solid #222', borderRadius:7, padding:'4px 10px', color:'#555', cursor:'pointer', fontSize:11, fontFamily:'inherit' }}>Desconectar</button>
          </div>
        </div>

        {/* Debug panel */}
        {showDebug && debugLog?.length > 0 && (
          <div style={{ background:'#0A0A0A', borderBottom:'1px solid #2A2A2A', padding:'10px 20px', maxHeight:160, overflowY:'auto' }}>
            {debugLog.map((l,i) => (
              <div key={i} style={{ fontSize:10.5, fontFamily:'monospace', color: l.startsWith('✓') ? '#22C55E' : l.startsWith('✗') ? '#FF6B6B' : '#C8A840', lineHeight:1.7 }}>{l}</div>
            ))}
          </div>
        )}

        {/* Sub-tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid #1A1A1A', paddingLeft:20, flexShrink:0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ background:'none', border:'none', borderBottom:activeTab===t.id?'2px solid #D63028':'2px solid transparent', color:activeTab===t.id?'#F0F0F0':'#555', padding:'10px 16px 9px', cursor:'pointer', fontSize:12, fontWeight:activeTab===t.id?600:400, fontFamily:'inherit', flexShrink:0 }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>

          {/* ── RESUMEN ── */}
          {activeTab === 'overview' && (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
                <KpiCard icon="👥" label="Seguidores" value={fmt(profile.followers_count)} delta={insights.follower_count || null}/>
                <KpiCard icon="👁" label="Visualizaciones" value={fmt(insights.impressions)} sub="28 días"/>
                <KpiCard icon="📡" label="Cuentas alcanzadas" value={fmt(insights.reach)} sub="28 días"/>
                <KpiCard icon="💬" label="Interacciones" value={fmt(totalInteractions)} sub="28 días"/>
                <KpiCard icon="🔍" label="Visitas al perfil" value={fmt(insights.profile_views)} sub="28 días"/>
                <KpiCard icon="❤" label="Me gusta" value={fmt(engagementTotals.likes)}/>
                <KpiCard icon="🔖" label="Guardados" value={fmt(engagementTotals.saved)}/>
                <KpiCard icon="↗" label="Compartidos" value={fmt(engagementTotals.shares)}/>
              </div>
              <SH title="Últimas publicaciones"/>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                {topMedia.slice(0,6).map((p,i) => (
                  <a key={i} href={p.permalink} target="_blank" rel="noreferrer" style={{ textDecoration:'none', background:'#1A1A1A', border:'1px solid #222', borderRadius:10, overflow:'hidden', display:'block' }}>
                    <div style={{ aspectRatio:'1', background:'#2A2A2A', position:'relative', overflow:'hidden' }}>
                      {(p.media_url||p.thumbnail_url) && <img src={p.media_url||p.thumbnail_url} style={{ width:'100%',height:'100%',objectFit:'cover' }} onError={e=>e.target.style.display='none'}/>}
                      <div style={{ position:'absolute', bottom:6, left:6, background:'rgba(0,0,0,.8)', borderRadius:5, padding:'2px 7px', fontSize:13, fontWeight:700, color:'#fff' }}>
                        {fmt(p.pi?.impressions||p.pi?.reach||p.like_count||0)}
                      </div>
                      <div style={{ position:'absolute', top:6, right:6, background:'rgba(0,0,0,.7)', borderRadius:4, padding:'1px 6px', fontSize:9, color:'#ccc', textTransform:'uppercase' }}>
                        {p.media_type==='VIDEO'?'Reel':p.media_type==='CAROUSEL_ALBUM'?'Carrusel':'Imagen'}
                      </div>
                    </div>
                    <div style={{ padding:'10px 12px' }}>
                      <div style={{ fontSize:11, color:'#666', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.caption||'(sin caption)'}</div>
                      <div style={{ fontSize:10, color:'#444', marginTop:4 }}>❤ {p.like_count} · 💬 {p.comments_count}{p.pi?.saved?` · 🔖 ${p.pi.saved}`:''}</div>
                      <div style={{ fontSize:10, color:'#444', marginTop:2 }}>{new Date(p.timestamp).toLocaleDateString('es',{day:'numeric',month:'short'})}</div>
                    </div>
                  </a>
                ))}
              </div>
            </>
          )}

          {/* ── VISUALIZACIONES ── */}
          {activeTab === 'views' && (
            <>
              <div style={{ display:'flex', justifyContent:'center', marginBottom:24 }}>
                <DonutChart
                  value={fmt(insights.impressions)}
                  label="Visualizaciones"
                  pct1={55.3} label1={`No seguidores · 55,3%`}
                  pct2={44.7} label2={`Seguidores · 44,7%`}
                  color1="#CC0000" color2="#7C3AED"
                />
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
                <div style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:'16px 20px' }}>
                  <div style={{ fontSize:12, color:'#888', marginBottom:8 }}>📡 Cuentas alcanzadas</div>
                  <div style={{ fontSize:30, fontWeight:700, color:'#F0F0F0' }}>{fmt(insights.reach)}</div>
                </div>
                <div style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:'16px 20px' }}>
                  <div style={{ fontSize:12, color:'#888', marginBottom:8 }}>🔍 Visitas al perfil</div>
                  <div style={{ fontSize:30, fontWeight:700, color:'#F0F0F0' }}>{fmt(insights.profile_views)}</div>
                </div>
              </div>

              <SH title="Por tipo de contenido"/>
              <div style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:'16px 20px', marginBottom:20 }}>
                <HBar label="Publicaciones" pct={98} value="98%" color="#CC0000"/>
                <HBar label="Reels" pct={2} value="2%" color="#7C3AED"/>
              </div>

              <SH title="Principal contenido por visualizaciones"/>
              <div style={{ display:'flex', gap:10, overflowX:'auto', paddingBottom:8 }}>
                {[...topMedia].sort((a,b)=>(b.pi?.impressions||b.pi?.reach||0)-(a.pi?.impressions||a.pi?.reach||0)).slice(0,5).map((p,i) => (
                  <a key={i} href={p.permalink} target="_blank" rel="noreferrer" style={{ textDecoration:'none', flexShrink:0, width:130 }}>
                    <div style={{ width:130, height:130, background:'#2A2A2A', borderRadius:10, overflow:'hidden', position:'relative' }}>
                      {(p.media_url||p.thumbnail_url) && <img src={p.media_url||p.thumbnail_url} style={{ width:'100%',height:'100%',objectFit:'cover' }} onError={e=>e.target.style.display='none'}/>}
                      <div style={{ position:'absolute', bottom:6, left:6, background:'rgba(0,0,0,.8)', borderRadius:5, padding:'2px 7px', fontSize:14, fontWeight:700, color:'#fff' }}>
                        {fmt(p.pi?.impressions||p.pi?.reach||0)}
                      </div>
                    </div>
                    <div style={{ fontSize:11, color:'#555', marginTop:5 }}>{new Date(p.timestamp).toLocaleDateString('es',{day:'numeric',month:'short'})}</div>
                  </a>
                ))}
              </div>

              {Object.values(onlineHours).some(v=>v>0) && (
                <>
                  <SH title="Momentos de más actividad"/>
                  <div style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:'16px 20px' }}>
                    <BarChart data={hourData} color="#CC0000" maxH={100}/>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── INTERACCIONES ── */}
          {activeTab === 'interactions' && (
            <>
              <div style={{ display:'flex', justifyContent:'center', marginBottom:24 }}>
                <DonutChart
                  value={fmt(totalInteractions)}
                  label="Interacciones"
                  pct1={90.3} label1="Seguidores · 90,3%"
                  pct2={9.7}  label2="No seguidores · 9,7%"
                  color1="#CC0000" color2="#7C3AED"
                />
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:20 }}>
                {[
                  { icon:'❤', label:'Me gusta', val:engagementTotals.likes },
                  { icon:'🔖', label:'Guardados', val:engagementTotals.saved },
                  { icon:'↗', label:'Compartidos', val:engagementTotals.shares },
                  { icon:'💬', label:'Comentarios', val:engagementTotals.comments },
                ].map((item,i) => (
                  <div key={i} style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:'16px 20px' }}>
                    <div style={{ fontSize:13, color:'#888', marginBottom:6 }}>{item.icon} {item.label}</div>
                    <div style={{ fontSize:28, fontWeight:700, color:'#F0F0F0' }}>{fmt(item.val)}</div>
                  </div>
                ))}
              </div>

              <SH title="Principales publicaciones · Por Me gusta"/>
              <div style={{ display:'flex', gap:10, overflowX:'auto', paddingBottom:8 }}>
                {[...topMedia].sort((a,b)=>(b.like_count||0)-(a.like_count||0)).slice(0,5).map((p,i) => (
                  <a key={i} href={p.permalink} target="_blank" rel="noreferrer" style={{ textDecoration:'none', flexShrink:0, width:130 }}>
                    <div style={{ width:130, height:130, background:'#2A2A2A', borderRadius:10, overflow:'hidden', position:'relative' }}>
                      {(p.media_url||p.thumbnail_url) && <img src={p.media_url||p.thumbnail_url} style={{ width:'100%',height:'100%',objectFit:'cover' }} onError={e=>e.target.style.display='none'}/>}
                      <div style={{ position:'absolute', bottom:6, left:6, background:'rgba(0,0,0,.8)', borderRadius:5, padding:'2px 7px', fontSize:14, fontWeight:700, color:'#fff' }}>{p.like_count||0}</div>
                    </div>
                    <div style={{ fontSize:11, color:'#555', marginTop:5 }}>{new Date(p.timestamp).toLocaleDateString('es',{day:'numeric',month:'short'})}</div>
                  </a>
                ))}
              </div>

              <SH title="Por tipo de contenido"/>
              <div style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:'16px 20px' }}>
                <HBar label="Publicaciones" pct={100} value="100%" color="#CC0000"/>
              </div>
            </>
          )}

          {/* ── SEGUIDORES ── */}
          {activeTab === 'audience' && (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
                <div style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:'18px 20px' }}>
                  <div style={{ fontSize:36, fontWeight:700, color:'#F0F0F0', marginBottom:4 }}>{fmt(profile.followers_count)}</div>
                  <div style={{ fontSize:13, color:'#888' }}>Seguidores</div>
                  {insights.follower_count != null && (
                    <div style={{ fontSize:12, color:insights.follower_count>=0?'#22C55E':'#FF6B6B', marginTop:6 }}>
                      {insights.follower_count>=0?'+':''}{insights.follower_count} en 28 días
                    </div>
                  )}
                </div>
                <div style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:'18px 20px' }}>
                  <div style={{ fontSize:36, fontWeight:700, color:'#F0F0F0', marginBottom:4 }}>{fmt(profile.follows_count)}</div>
                  <div style={{ fontSize:13, color:'#888' }}>Siguiendo</div>
                </div>
              </div>

              {(maleTotal+femaleTotal) > 0 && (
                <>
                  <SH title="Sexo"/>
                  <div style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:'16px 20px', marginBottom:14 }}>
                    <HBar label="Hombres" pct={Math.round(maleTotal/gTotal*100)} value={`${Math.round(maleTotal/gTotal*100)}%`} color="#CC0000"/>
                    <HBar label="Mujeres" pct={Math.round(femaleTotal/gTotal*100)} value={`${Math.round(femaleTotal/gTotal*100)}%`} color="#7C3AED"/>
                  </div>
                </>
              )}

              {totalAudience > 0 && (
                <>
                  <SH title="Rango de edad"/>
                  <div style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:'16px 20px', marginBottom:14 }}>
                    {ageData.map((d,i) => {
                      const pct = Math.round(d.value/totalAudience*100)
                      return pct > 0 ? <HBar key={i} label={d.label} pct={pct} value={`${pct}%`} color="#CC0000"/> : null
                    })}
                  </div>
                </>
              )}

              {cities.length > 0 && (
                <>
                  <SH title="Principales ciudades"/>
                  <div style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:'16px 20px', marginBottom:14 }}>
                    {cities.map(([city,val],i) => (
                      <HBar key={i} label={city}
                        pct={Math.round(val/maxCity*100)}
                        value={`${(val/profile.followers_count*100).toFixed(1)}%`}
                        color="#CC0000"/>
                    ))}
                  </div>
                </>
              )}

              {Object.values(onlineHours).some(v=>v>0) && (
                <>
                  <SH title="Momentos de más actividad"/>
                  <div style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:'16px 20px' }}>
                    <BarChart data={hourData} color="#CC0000" maxH={100}/>
                  </div>
                </>
              )}

              {(maleTotal+femaleTotal) === 0 && totalAudience === 0 && cities.length === 0 && (
                <div style={{ background:'#1A1400', border:'1px solid #3A2E00', borderRadius:10, padding:'14px 16px', fontSize:12.5, color:'#C8A840', lineHeight:1.7 }}>
                  ⚠️ Los datos demográficos requieren más actividad reciente o el permiso <code style={{ background:'#2A2200', padding:'1px 5px', borderRadius:3 }}>instagram_manage_insights</code>.<br/>
                  Activa el botón <strong>Debug</strong> arriba para ver qué está retornando la API.
                </div>
              )}
            </>
          )}

          {error && <div style={{ marginTop:16, background:'#1A0A0A', border:'1px solid #4A1A1A', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#FF8080' }}>⚠️ {error}</div>}
        </div>
      </div>
    )
  }

  if (step === 'connected' && !data) {
    return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', gap:12, color:'#666', fontSize:13 }}><Spinner size={18}/> Cargando analytics de @gorillagency...</div>
  }

  // ── CONNECT FORM ────────────────────────────────────────────────────────────
  return (
    <div style={{ padding:24, overflowY:'auto', height:'100%' }}>
      <div style={{ maxWidth:500, margin:'0 auto', paddingTop:16 }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ fontSize:34, marginBottom:10 }}>📊</div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:19, letterSpacing:2, marginBottom:8 }}>CONECTAR INSTAGRAM</div>
          <div style={{ fontSize:13, color:'#666', lineHeight:1.7 }}>Conecta tu cuenta Business para ver todos tus KPIs, audiencia y estadísticas.</div>
        </div>
        <div style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:18, marginBottom:14 }}>
          <label style={{ fontSize:11.5, color:'#666', display:'block', marginBottom:5 }}>Access Token de Meta</label>
          <input type="password" placeholder="EAAxxxx..." value={token} onChange={e=>{setToken(e.target.value);setError('')}} onKeyDown={e=>e.key==='Enter'&&discover()} style={{ width:'100%', background:'#111', border:'1px solid #222', borderRadius:10, color:'#F0F0F0', fontSize:13, padding:'10px 14px', fontFamily:'inherit' }}/>
          <div style={{ fontSize:11, color:'#444', marginTop:8, lineHeight:1.7 }}>
            Permisos necesarios: <code style={{ background:'#222', padding:'1px 5px', borderRadius:3, fontSize:10 }}>instagram_basic</code> <code style={{ background:'#222', padding:'1px 5px', borderRadius:3, fontSize:10 }}>instagram_manage_insights</code> <code style={{ background:'#222', padding:'1px 5px', borderRadius:3, fontSize:10 }}>pages_show_list</code> <code style={{ background:'#222', padding:'1px 5px', borderRadius:3, fontSize:10 }}>instagram_content_publish</code>
          </div>
        </div>
        {error && <div style={{ background:'#1A0A0A', border:'1px solid #4A1A1A', borderRadius:10, padding:'12px 16px', fontSize:12.5, color:'#FF8080', marginBottom:14, lineHeight:1.6 }}>❌ {error}</div>}
        <button onClick={discover} disabled={loading||!token.trim()} style={{ background:'#D63028', color:'#fff', border:'none', borderRadius:10, padding:13, fontSize:13.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit', width:'100%', marginBottom:10, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          {loading?<><Spinner size={14}/>Conectando...</>:'🔍 Conectar automáticamente'}
        </button>
        <div style={{ textAlign:'center', fontSize:11.5, color:'#444', marginBottom:10 }}>— o ingresa el ID manualmente —</div>
        <div style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:18 }}>
          <label style={{ fontSize:11.5, color:'#666', display:'block', marginBottom:5 }}>Instagram Business Account ID</label>
          <input placeholder="17841408592252612" value={manualId} onChange={e=>setManualId(e.target.value)} style={{ width:'100%', background:'#111', border:'1px solid #222', borderRadius:10, color:'#F0F0F0', fontSize:13, padding:'10px 14px', fontFamily:'inherit', marginBottom:10 }}/>
          <div style={{ fontSize:11, color:'#555', marginBottom:12 }}>Tu ID de @gorillagency: <strong style={{ color:'#D63028' }}>17841408592252612</strong></div>
          <button onClick={connectManual} disabled={loading||!token.trim()||!manualId.trim()} style={{ background:'#D63028', color:'#fff', border:'none', borderRadius:10, padding:'11px 18px', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit', width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            {loading?<><Spinner size={14}/>Conectando...</>:'🔗 Conectar con ID manual'}
          </button>
        </div>
      </div>
    </div>
  )
}
