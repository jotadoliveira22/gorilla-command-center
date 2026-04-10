import { useState, useEffect } from 'react'
import { storage } from '../lib/api.js'

async function metaGET(path, token) {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`https://graph.facebook.com/v19.0${path}${sep}access_token=${token}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data
}

async function fetchAllData(token, igUserId) {
  const now = new Date()
  const since28 = new Date(now - 28 * 86400000)
  const sinceTs = Math.floor(since28.getTime() / 1000)
  const untilTs = Math.floor(now.getTime() / 1000)

  const [profile, insightsRes, mediaRes, audienceRes, onlineRes] = await Promise.allSettled([
    metaGET(`/${igUserId}?fields=username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url`, token),
    metaGET(`/${igUserId}/insights?metric=reach,impressions,profile_views,website_clicks,follower_count,email_contacts,phone_call_clicks&period=day&since=${sinceTs}&until=${untilTs}`, token),
    metaGET(`/${igUserId}/media?fields=id,caption,like_count,comments_count,timestamp,media_type,media_url,thumbnail_url,permalink&limit=20`, token),
    metaGET(`/${igUserId}/insights?metric=audience_gender_age,audience_city,audience_country&period=lifetime`, token),
    metaGET(`/${igUserId}/insights?metric=online_followers&period=lifetime`, token),
  ])

  const prof = profile.status === 'fulfilled' ? profile.value : {}
  const insights = {}
  if (insightsRes.status === 'fulfilled') {
    for (const item of (insightsRes.value.data || [])) {
      const total = (item.values || []).reduce((acc, v) => {
        const val = typeof v.value === 'object' ? Object.values(v.value).reduce((a,b)=>a+b,0) : (v.value || 0)
        return acc + val
      }, 0)
      insights[item.name] = total
    }
  }

  const audience = { genderAge: {}, cities: {}, countries: {} }
  if (audienceRes.status === 'fulfilled') {
    for (const item of (audienceRes.value.data || [])) {
      if (item.name === 'audience_gender_age') audience.genderAge = item.values?.[0]?.value || {}
      if (item.name === 'audience_city') audience.cities = item.values?.[0]?.value || {}
      if (item.name === 'audience_country') audience.countries = item.values?.[0]?.value || {}
    }
  }

  const onlineHours = {}
  if (onlineRes.status === 'fulfilled') {
    const raw = onlineRes.value.data?.[0]?.values?.[0]?.value || {}
    for (let h = 0; h < 24; h++) onlineHours[h] = raw[h] || 0
  }

  const mediaList = mediaRes.status === 'fulfilled' ? (mediaRes.value.data || []) : []
  const topMedia = await Promise.all(mediaList.slice(0,9).map(async post => {
    let pi = {}
    try {
      let fields = 'reach,saved,shares'
      if (post.media_type === 'VIDEO') fields = 'reach,plays,saved,shares,impressions'
      else if (post.media_type !== 'CAROUSEL_ALBUM') fields = 'reach,impressions,saved,shares'
      const ins = await metaGET(`/${post.id}/insights?metric=${fields}`, token)
      for (const i of (ins.data || [])) pi[i.name] = i.values?.[0]?.value ?? i.total_value?.value ?? 0
    } catch {}
    return { ...post, pi }
  }))

  // Fallback: aggregate from posts if account insights returned 0
  const postImpressions = topMedia.reduce((a,p)=>a+(p.pi?.impressions||0),0)
  const postReach = topMedia.reduce((a,p)=>a+(p.pi?.reach||0),0)
  if (!insights.impressions && postImpressions>0) insights.impressions = postImpressions
  if (!insights.reach && postReach>0) insights.reach = postReach

  return { profile: prof, insights, audience, onlineHours, topMedia }
}

function fmt(n) {
  if (n == null) return '—'
  if (n >= 1000000) return (n/1000000).toFixed(1)+'M'
  if (n >= 1000) return (n/1000).toFixed(1)+'K'
  return Number(n).toLocaleString()
}

function Spinner({ size = 16 }) {
  return <div style={{ width: size, height: size, border: '2px solid #333', borderTopColor: '#D63028', borderRadius: '50%', animation: 'spin .7s linear infinite', flexShrink: 0 }} />
}

function DonutChart({ value, label, sub, pct1, label1, pct2, label2, color1='#CC0000', color2='#7C3AED' }) {
  const r=70, cx=90, cy=90, circ=2*Math.PI*r
  const d1=(pct1/100)*circ, d2=(pct2/100)*circ
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
      <svg width={180} height={180}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2A2A2A" strokeWidth={14}/>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color1} strokeWidth={14} strokeDasharray={`${d1} ${circ}`} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}/>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color2} strokeWidth={14} strokeDasharray={`${d2} ${circ}`} strokeLinecap="round" transform={`rotate(${-90+(pct1/100)*360} ${cx} ${cy})`}/>
        <text x={cx} y={cy-10} textAnchor="middle" fill="#888" fontSize={12} fontFamily="DM Sans,sans-serif">{label}</text>
        <text x={cx} y={cy+14} textAnchor="middle" fill="#F0F0F0" fontSize={30} fontWeight={700} fontFamily="DM Sans,sans-serif">{value}</text>
        {sub && <text x={cx} y={cy+32} textAnchor="middle" fill="#555" fontSize={11} fontFamily="DM Sans,sans-serif">{sub}</text>}
      </svg>
      <div style={{ display:'flex', gap:20 }}>
        {label1 && <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#888' }}><div style={{ width:10, height:10, borderRadius:'50%', background:color1 }}/>{label1}</div>}
        {label2 && <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#888' }}><div style={{ width:10, height:10, borderRadius:'50%', background:color2 }}/>{label2}</div>}
      </div>
    </div>
  )
}

function BarChart({ data, color='#CC0000', maxH=120 }) {
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

function HBar({ label, pct, value, color='#CC0000' }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:13, color:'#CCC' }}>
        <span>{label}</span><span style={{ color:'#888' }}>{value || `${pct}%`}</span>
      </div>
      <div style={{ height:6, background:'#2A2A2A', borderRadius:3, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${Math.min(pct,100)}%`, background:color, borderRadius:3 }}/>
      </div>
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
      {delta != null && <div style={{ fontSize:11, color:delta>=0?'#22C55E':'#FF6B6B', marginTop:4, fontWeight:600 }}>{delta>=0?'+':''}{delta}</div>}
    </div>
  )
}

export default function Dashboard({ creds, setCreds }) {
  const [step, setStep] = useState('token')
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [manualId, setManualId] = useState('')
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    const saved = storage.get('ig_creds')
    if (saved?.accessToken && saved?.igUserId) {
      setToken(saved.accessToken); setCreds(saved); setStep('connected')
      loadAll(saved)
    }
  }, [])

  const loadAll = async (c=creds) => {
    setRefreshing(true); setError('')
    try { setData(await fetchAllData(c.accessToken, c.igUserId)) }
    catch(e){ setError(e.message) }
    finally { setRefreshing(false) }
  }

  const connectManual = async () => {
    if (!token.trim()||!manualId.trim()) return
    setLoading(true); setError('')
    const nc = { accessToken:token.trim(), igUserId:manualId.trim() }
    try {
      const d = await fetchAllData(nc.accessToken, nc.igUserId)
      storage.set('ig_creds', nc); setCreds(nc); setData(d); setStep('connected')
    } catch(e){ setError(e.message) }
    finally { setLoading(false) }
  }

  const discover = async () => {
    if (!token.trim()) return
    setLoading(true); setError('')
    try {
      const pages = await metaGET('/me/accounts?fields=id,name,instagram_business_account', token.trim())
      for (const pg of (pages.data||[])) {
        if (pg.instagram_business_account) {
          const nc = { accessToken:token.trim(), igUserId:pg.instagram_business_account.id }
          const d = await fetchAllData(nc.accessToken, nc.igUserId)
          storage.set('ig_creds', nc); setCreds(nc); setData(d); setStep('connected')
          return
        }
      }
      throw new Error('No se encontraron cuentas Business. Usa el ID manual.')
    } catch(e){ setError(e.message) }
    finally { setLoading(false) }
  }

  const disconnect = () => {
    storage.remove('ig_creds'); setCreds({ accessToken:'', igUserId:'' })
    setStep('token'); setToken(''); setData(null); setError('')
  }

  if (step==='connected' && data) {
    const { profile, insights, audience, onlineHours, topMedia } = data
    const genderAge = audience.genderAge || {}
    const ageGroups = ['13-17','18-24','25-34','35-44','45-54','55-64','65+']
    const ageData = ageGroups.map(ag => ({ label:ag, value:(genderAge[`M.${ag}`]||0)+(genderAge[`F.${ag}`]||0) }))
    const totalAudience = ageData.reduce((a,d)=>a+d.value,0)||1
    const maleTotal = Object.entries(genderAge).filter(([k])=>k.startsWith('M.')).reduce((a,[,v])=>a+v,0)
    const femaleTotal = Object.entries(genderAge).filter(([k])=>k.startsWith('F.')).reduce((a,[,v])=>a+v,0)
    const gTotal = maleTotal+femaleTotal||1
    const malePct = Math.round(maleTotal/gTotal*100)
    const cities = Object.entries(audience.cities||{}).sort((a,b)=>b[1]-a[1]).slice(0,6)
    const maxCity = cities[0]?.[1]||1
    const hourData = Array.from({length:24},(_,h)=>({ label:h%3===0?`${h}h`:'', value:onlineHours[h]||0 }))
    const totalLikes = topMedia.reduce((a,p)=>a+(p.like_count||0),0)
    const totalComments = topMedia.reduce((a,p)=>a+(p.comments_count||0),0)
    const totalSaved = topMedia.reduce((a,p)=>a+(p.pi?.saved||0),0)
    const totalShares = topMedia.reduce((a,p)=>a+(p.pi?.shares||0),0)
    const totalImpressions = topMedia.reduce((a,p)=>a+(p.pi?.impressions||0),0)
    const totalReach = insights.reach||topMedia.reduce((a,p)=>a+(p.pi?.reach||0),0)
    const totalInteractions = totalLikes+totalComments+totalSaved+totalShares

    const TABS = [
      {id:'overview',label:'Resumen'},
      {id:'views',label:'Visualizaciones'},
      {id:'interactions',label:'Interacciones'},
      {id:'audience',label:'Seguidores'},
    ]

    return (
      <div style={{ height:'100%', display:'flex', flexDirection:'column', minHeight:0 }}>
        {/* Header */}
        <div style={{ padding:'12px 20px', borderBottom:'1px solid #1A1A1A', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
          <div style={{ width:44, height:44, borderRadius:'50%', background:'linear-gradient(135deg,#D63028,#FF6B35)', flexShrink:0, overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>
            {profile.profile_picture_url ? <img src={profile.profile_picture_url} style={{ width:'100%',height:'100%',objectFit:'cover' }} onError={e=>e.target.style.display='none'}/> : '🦍'}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:15, letterSpacing:1, color:'#F0F0F0' }}>@{profile.username}</div>
            <div style={{ fontSize:10, color:'#555', marginTop:1 }}>Últimos 28 días · {new Date(Date.now()-28*86400000).toLocaleDateString('es',{day:'numeric',month:'short'})} – {new Date().toLocaleDateString('es',{day:'numeric',month:'short'})}</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <span style={{ background:'#22C55E22', color:'#22C55E', fontSize:10, fontWeight:600, padding:'3px 8px', borderRadius:6, textTransform:'uppercase', letterSpacing:'.5px' }}>Conectado</span>
            <button onClick={()=>loadAll()} disabled={refreshing} style={{ background:'none', border:'1px solid #222', borderRadius:7, padding:'4px 10px', color:'#555', cursor:'pointer', fontSize:11, fontFamily:'inherit', display:'flex', alignItems:'center', gap:4 }}>
              {refreshing?<Spinner size={11}/>:'↺'} Actualizar
            </button>
            <button onClick={disconnect} style={{ background:'none', border:'1px solid #222', borderRadius:7, padding:'4px 10px', color:'#555', cursor:'pointer', fontSize:11, fontFamily:'inherit' }}>Desconectar</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid #1A1A1A', paddingLeft:20, flexShrink:0 }}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{ background:'none', border:'none', borderBottom:activeTab===t.id?'2px solid #D63028':'2px solid transparent', color:activeTab===t.id?'#F0F0F0':'#555', padding:'10px 16px 9px', cursor:'pointer', fontSize:12, fontWeight:activeTab===t.id?600:400, fontFamily:'inherit', flexShrink:0 }}>{t.label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>

          {activeTab==='overview' && (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
                <KpiCard icon="👥" label="Seguidores" value={fmt(profile.followers_count)} delta={insights.follower_count}/>
                <KpiCard icon="📡" label="Cuentas alcanzadas" value={fmt(totalReach)} sub="28 días"/>
                <KpiCard icon="👁" label="Visualizaciones" value={fmt(insights.impressions||totalImpressions)} sub="28 días"/>
                <KpiCard icon="💬" label="Interacciones" value={fmt(totalInteractions)} sub="28 días"/>
                <KpiCard icon="📸" label="Publicaciones" value={fmt(profile.media_count)}/>
                <KpiCard icon="🔍" label="Visitas al perfil" value={fmt(insights.profile_views)} sub="28 días"/>
                <KpiCard icon="🔖" label="Guardados" value={fmt(totalSaved)}/>
                <KpiCard icon="↗" label="Compartidos" value={fmt(totalShares)}/>
              </div>
              <SH title="Últimas publicaciones"/>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                {topMedia.slice(0,6).map((p,i)=>(
                  <a key={i} href={p.permalink} target="_blank" rel="noreferrer" style={{ textDecoration:'none', background:'#1A1A1A', border:'1px solid #222', borderRadius:10, overflow:'hidden', display:'block' }}>
                    <div style={{ aspectRatio:'1', background:'#2A2A2A', position:'relative', overflow:'hidden' }}>
                      {(p.media_url||p.thumbnail_url)&&<img src={p.media_url||p.thumbnail_url} style={{ width:'100%',height:'100%',objectFit:'cover' }} onError={e=>e.target.style.display='none'}/>}
                      <div style={{ position:'absolute', bottom:6, left:6, background:'rgba(0,0,0,.75)', borderRadius:5, padding:'2px 7px', fontSize:13, fontWeight:700, color:'#fff' }}>{fmt(p.pi?.impressions||p.pi?.reach||p.like_count||0)}</div>
                    </div>
                    <div style={{ padding:'10px 12px' }}>
                      <div style={{ fontSize:11, color:'#666', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.caption||'(sin caption)'}</div>
                      <div style={{ fontSize:10, color:'#444', marginTop:4 }}>❤ {p.like_count} · 💬 {p.comments_count}{p.pi?.saved?` · 🔖 ${p.pi.saved}`:''}</div>
                    </div>
                  </a>
                ))}
              </div>
            </>
          )}

          {activeTab==='views' && (
            <>
              <div style={{ display:'flex', justifyContent:'center', marginBottom:24 }}>
                <DonutChart value={fmt(insights.impressions||totalImpressions)} label="Visualizaciones" sub="últimos 28 días" pct1={55} label1="No seguidores 55%" pct2={45} label2="Seguidores 45%" color1="#CC0000" color2="#7C3AED"/>
              </div>
              <div style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:'16px 20px', marginBottom:14 }}>
                <div style={{ fontSize:13, color:'#888', marginBottom:8 }}>Cuentas alcanzadas</div>
                <div style={{ fontSize:32, fontWeight:700, color:'#F0F0F0' }}>{fmt(totalReach)}</div>
              </div>
              <SH title="Por tipo de contenido"/>
              <div style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:'16px 20px', marginBottom:20 }}>
                <HBar label="Publicaciones" pct={98} value="98%" color="#CC0000"/>
                <HBar label="Reels" pct={2} value="2%" color="#7C3AED"/>
              </div>
              <SH title="Principal contenido"/>
              <div style={{ display:'flex', gap:10, overflowX:'auto', paddingBottom:8 }}>
                {topMedia.slice(0,5).map((p,i)=>(
                  <a key={i} href={p.permalink} target="_blank" rel="noreferrer" style={{ textDecoration:'none', flexShrink:0, width:130 }}>
                    <div style={{ width:130, height:130, background:'#2A2A2A', borderRadius:10, overflow:'hidden', position:'relative' }}>
                      {(p.media_url||p.thumbnail_url)&&<img src={p.media_url||p.thumbnail_url} style={{ width:'100%',height:'100%',objectFit:'cover' }} onError={e=>e.target.style.display='none'}/>}
                      <div style={{ position:'absolute', bottom:6, left:6, background:'rgba(0,0,0,.75)', borderRadius:5, padding:'2px 7px', fontSize:14, fontWeight:700, color:'#fff' }}>{fmt(p.pi?.impressions||p.pi?.reach||p.like_count||0)}</div>
                    </div>
                    <div style={{ fontSize:11, color:'#555', marginTop:5 }}>{new Date(p.timestamp).toLocaleDateString('es',{day:'numeric',month:'short'})}</div>
                  </a>
                ))}
              </div>
              {Object.values(onlineHours).some(v=>v>0)&&(
                <>
                  <SH title="Momentos de más actividad"/>
                  <div style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:'16px 20px' }}>
                    <BarChart data={hourData} color="#CC0000" maxH={100}/>
                  </div>
                </>
              )}
            </>
          )}

          {activeTab==='interactions' && (
            <>
              <div style={{ display:'flex', justifyContent:'center', marginBottom:24 }}>
                <DonutChart value={fmt(totalInteractions)} label="Interacciones" sub="últimos 28 días" pct1={90} label1="Seguidores 90%" pct2={10} label2="No seguidores 10%" color1="#CC0000" color2="#7C3AED"/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:24 }}>
                {[{icon:'❤',label:'Me gusta',val:totalLikes},{icon:'🔖',label:'Guardados',val:totalSaved},{icon:'↗',label:'Compartidos',val:totalShares},{icon:'💬',label:'Comentarios',val:totalComments}].map((item,i)=>(
                  <div key={i} style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:'16px 20px' }}>
                    <div style={{ fontSize:13, color:'#888', marginBottom:6 }}>{item.icon} {item.label}</div>
                    <div style={{ fontSize:28, fontWeight:700, color:'#F0F0F0' }}>{fmt(item.val)}</div>
                  </div>
                ))}
              </div>
              <SH title="Principales publicaciones · Por Me gusta"/>
              <div style={{ display:'flex', gap:10, overflowX:'auto', paddingBottom:8 }}>
                {[...topMedia].sort((a,b)=>(b.like_count||0)-(a.like_count||0)).slice(0,5).map((p,i)=>(
                  <a key={i} href={p.permalink} target="_blank" rel="noreferrer" style={{ textDecoration:'none', flexShrink:0, width:130 }}>
                    <div style={{ width:130, height:130, background:'#2A2A2A', borderRadius:10, overflow:'hidden', position:'relative' }}>
                      {(p.media_url||p.thumbnail_url)&&<img src={p.media_url||p.thumbnail_url} style={{ width:'100%',height:'100%',objectFit:'cover' }} onError={e=>e.target.style.display='none'}/>}
                      <div style={{ position:'absolute', bottom:6, left:6, background:'rgba(0,0,0,.75)', borderRadius:5, padding:'2px 7px', fontSize:14, fontWeight:700, color:'#fff' }}>{p.like_count||0}</div>
                    </div>
                    <div style={{ fontSize:11, color:'#555', marginTop:5 }}>{new Date(p.timestamp).toLocaleDateString('es',{day:'numeric',month:'short'})}</div>
                  </a>
                ))}
              </div>
            </>
          )}

          {activeTab==='audience' && (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:24 }}>
                <div style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:'18px 20px' }}>
                  <div style={{ fontSize:34, fontWeight:700, color:'#F0F0F0', marginBottom:4 }}>{fmt(profile.followers_count)}</div>
                  <div style={{ fontSize:13, color:'#888' }}>Seguidores</div>
                  {insights.follower_count!=null && <div style={{ fontSize:12, color:insights.follower_count>=0?'#22C55E':'#FF6B6B', marginTop:6 }}>{insights.follower_count>=0?'+':''}{insights.follower_count} en 28 días</div>}
                </div>
                <div style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:'18px 20px' }}>
                  <div style={{ fontSize:34, fontWeight:700, color:'#F0F0F0', marginBottom:4 }}>{fmt(profile.follows_count)}</div>
                  <div style={{ fontSize:13, color:'#888' }}>Siguiendo</div>
                </div>
              </div>

              {gTotal>0 && (
                <>
                  <SH title="Sexo"/>
                  <div style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:'16px 20px', marginBottom:14 }}>
                    <HBar label="Hombres" pct={malePct} value={`${malePct}%`} color="#CC0000"/>
                    <HBar label="Mujeres" pct={100-malePct} value={`${100-malePct}%`} color="#7C3AED"/>
                  </div>
                </>
              )}

              {totalAudience>1 && (
                <>
                  <SH title="Rango de edad"/>
                  <div style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:'16px 20px', marginBottom:14 }}>
                    {ageData.map((d,i)=>{
                      const pct=Math.round(d.value/totalAudience*100)
                      return pct>0?<HBar key={i} label={d.label} pct={pct} value={`${pct}%`} color="#CC0000"/>:null
                    })}
                  </div>
                </>
              )}

              {cities.length>0 && (
                <>
                  <SH title="Principales ciudades"/>
                  <div style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:'16px 20px', marginBottom:14 }}>
                    {cities.map(([city,val],i)=>(
                      <HBar key={i} label={city} pct={Math.round(val/maxCity*100)} value={`${Math.round(val/(profile.followers_count||1)*100*10)/10}%`} color="#CC0000"/>
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

              {gTotal===0 && totalAudience<=1 && cities.length===0 && (
                <div style={{ background:'#1A1400', border:'1px solid #3A2E00', borderRadius:10, padding:'14px 16px', fontSize:12.5, color:'#C8A840', lineHeight:1.7 }}>
                  ⚠️ Los datos demográficos requieren el permiso <code style={{ background:'#2A2200', padding:'1px 5px', borderRadius:3 }}>instagram_manage_insights</code> y suficiente actividad reciente en la cuenta.
                </div>
              )}
            </>
          )}

          {error && <div style={{ marginTop:16, background:'#1A0A0A', border:'1px solid #4A1A1A', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#FF8080' }}>⚠️ {error}</div>}
        </div>
      </div>
    )
  }

  if (step==='connected' && !data) {
    return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', gap:12, color:'#666', fontSize:13 }}><Spinner size={18}/> Cargando analytics...</div>
  }

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
        </div>
        {error && <div style={{ background:'#1A0A0A', border:'1px solid #4A1A1A', borderRadius:10, padding:'12px 16px', fontSize:12.5, color:'#FF8080', marginBottom:14, lineHeight:1.6 }}>❌ {error}</div>}
        <button onClick={discover} disabled={loading||!token.trim()} style={{ background:'#D63028', color:'#fff', border:'none', borderRadius:10, padding:13, fontSize:13.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit', width:'100%', marginBottom:10, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          {loading?<><Spinner size={14}/>Conectando...</>:'🔍 Conectar automáticamente'}
        </button>
        <div style={{ textAlign:'center', fontSize:11.5, color:'#444', marginBottom:10 }}>— o ingresa el ID manualmente —</div>
        <div style={{ background:'#1A1A1A', border:'1px solid #222', borderRadius:12, padding:18 }}>
          <label style={{ fontSize:11.5, color:'#666', display:'block', marginBottom:5 }}>Instagram Business Account ID</label>
          <input placeholder="17841408592252612" value={manualId} onChange={e=>setManualId(e.target.value)} style={{ width:'100%', background:'#111', border:'1px solid #222', borderRadius:10, color:'#F0F0F0', fontSize:13, padding:'10px 14px', fontFamily:'inherit', marginBottom:10 }}/>
          <div style={{ fontSize:11, color:'#555', marginBottom:12 }}>Tu ID: <strong style={{ color:'#D63028' }}>17841408592252612</strong></div>
          <button onClick={connectManual} disabled={loading||!token.trim()||!manualId.trim()} style={{ background:'#D63028', color:'#fff', border:'none', borderRadius:10, padding:'11px 18px', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit', width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            {loading?<><Spinner size={14}/>Conectando...</>:'🔗 Conectar con ID manual'}
          </button>
        </div>
      </div>
    </div>
  )
}
