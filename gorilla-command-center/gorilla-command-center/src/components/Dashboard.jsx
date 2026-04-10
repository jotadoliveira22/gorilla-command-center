import { useState, useEffect, useCallback } from 'react';
import { discoverIGAccounts, storage } from '../lib/api.js';

// ─── Meta Graph API helpers ───────────────────────────────────────────────────
const BASE = 'https://graph.instagram.com';

async function igGet(path, token, params = {}) {
    const url = new URL(`${BASE}${path}`);
    url.searchParams.set('access_token', token);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
}

async function fetchProfile(token, igUserId) {
    return igGet(`/${igUserId}`, token, {
          fields: 'id,username,followers_count,follows_count,media_count,biography,profile_picture_url,website',
    });
}

async function fetchInsights(token, igUserId) {
    const since = Math.floor(Date.now() / 1000) - 28 * 86400;
    const until = Math.floor(Date.now() / 1000);
    return igGet(`/${igUserId}/insights`, token, {
          metric: 'reach,impressions,profile_views,follower_count,website_clicks,email_contacts,phone_call_clicks',
          period: 'day',
          since,
          until,
    });
}

async function fetchMedia(token, igUserId) {
    const data = await igGet(`/${igUserId}/media`, token, {
          fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
          limit: 9,
    });
    return data.data || [];
}

async function fetchMediaInsights(token, mediaId, mediaType) {
    const isVideo = ['VIDEO', 'REEL'].includes(mediaType);
    const metric = [
          'impressions',
          'reach',
          'saved',
          'shares',
          isVideo ? 'plays' : null,
        ]
      .filter(Boolean)
      .join(',');
    try {
          const data = await igGet(`/${mediaId}/insights`, token, { metric });
          return Object.fromEntries((data.data || []).map((m) => [m.name, m.values?.[0]?.value ?? m.value ?? 0]));
    } catch {
          return {};
    }
}

function sumInsight(data, name) {
    const item = (data?.data || []).find((d) => d.name === name);
    if (!item) return 0;
    return (item.values || []).reduce((acc, v) => acc + (v.value ?? 0), 0);
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatCard({ label, value, icon }) {
    return (
          <div style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
          }}>
                  <span style={{ fontSize: 22 }}>{icon}</span>span>
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{value ?? '—'}</span>span>
                  <span style={{ fontSize: 12, color: '#aaa' }}>{label}</span>span>
          </div>div>
        );
}

function InsightCard({ label, value, icon }) {
    return (
          <div style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 10,
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
          }}>
                  <span style={{ fontSize: 20 }}>{icon}</span>span>
                  <div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{value ?? '—'}</div>div>
                          <div style={{ fontSize: 11, color: '#999' }}>{label}</div>div>
                  </div>div>
          </div>div>
        );
}

function PostCard({ post, insights }) {
    const thumb = post.thumbnail_url || post.media_url;
    const isVideo = ['VIDEO', 'REEL'].includes(post.media_type);
    return (
          <a
                  href={post.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                <div style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 10,
                          overflow: 'hidden',
                          cursor: 'pointer',
                          transition: 'transform .15s',
                }}
                          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.02)')}
                          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                        >
                        <div style={{ position: 'relative', paddingTop: '100%', background: '#111' }}>
                          {thumb ? (
                                      <img
                                                      src={thumb}
                                                      alt="post"
                                                      style={{
                                                                        position: 'absolute', top: 0, left: 0,
                                                                        width: '100%', height: '100%', objectFit: 'cover',
                                                      }}
                                                    />
                                    ) : (
                                      <div style={{
                                                      position: 'absolute', top: 0, left: 0,
                                                      width: '100%', height: '100%',
                                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                      color: '#555', fontSize: 32,
                                      }}>📷</div>div>
                                  )}
                          {isVideo && (
                                      <span style={{
                                                      position: 'absolute', top: 6, right: 6,
                                                      background: 'rgba(0,0,0,.6)', borderRadius: 4,
                                                      padding: '2px 5px', fontSize: 10, color: '#fff',
                                      }}>▶ REEL</span>span>
                                  )}
                        </div>div>
                        <div style={{ padding: '10px 12px', fontSize: 11, color: '#bbb', display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
                                  <span>❤️ {post.like_count ?? 0}</span>span>
                                  <span>💬 {post.comments_count ?? 0}</span>span>
                                  <span>📡 {insights?.reach ?? 0}</span>span>
                                  <span>👁️ {insights?.impressions ?? 0}</span>span>
                                  <span>🔖 {insights?.saved ?? 0}</span>span>
                                  <span>↗️ {insights?.shares ?? 0}</span>span>
                          {isVideo && <span>▶️ {insights?.plays ?? 0}</span>span>}
                        </div>div>
                </div>div>
          </a>a>
        );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
    const [accounts, setAccounts] = useState([]);
    const [selected, setSelected] = useState(null);
    const [profile, setProfile] = useState(null);
    const [insights, setInsights] = useState(null);
    const [media, setMedia] = useState([]);
    const [mediaInsights, setMediaInsights] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
  
    // Load connected accounts on mount
    useEffect(() => {
          const accs = discoverIGAccounts();
          setAccounts(accs);
          if (accs.length > 0) setSelected(accs[0]);
    }, []);
  
    const loadData = useCallback(async (account) => {
          if (!account) return;
          setLoading(true);
          setError(null);
          setProfile(null);
          setInsights(null);
          setMedia([]);
          setMediaInsights({});
          try {
                  const { token, igUserId } = account;
                  const [prof, ins, posts] = await Promise.all([
                            fetchProfile(token, igUserId),
                            fetchInsights(token, igUserId),
                            fetchMedia(token, igUserId),
                          ]);
                  setProfile(prof);
                  setInsights(ins);
                  setMedia(posts);
                  // Fetch per-post insights in parallel
                  const insightsMap = {};
                  await Promise.all(
                            posts.map(async (p) => {
                                        insightsMap[p.id] = await fetchMediaInsights(token, p.id, p.media_type);
                            })
                          );
                  setMediaInsights(insightsMap);
          } catch (e) {
                  setError(e.message || 'Error al cargar datos');
          } finally {
                  setLoading(false);
          }
    }, []);
  
    useEffect(() => {
          if (selected) loadData(selected);
    }, [selected, loadData]);
  
    // Compute engagement rate from last 5 posts
    const engagementRate = (() => {
          if (!media.length || !profile?.followers_count) return null;
          const last5 = media.slice(0, 5);
          const avgEngagement =
                  last5.reduce((acc, p) => acc + (p.like_count || 0) + (p.comments_count || 0), 0) / last5.length;
          return ((avgEngagement / profile.followers_count) * 100).toFixed(2) + '%';
    })();
  
    const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n));
  
    // ── No accounts ─────────────────────────────────────────────────────────────
    if (accounts.length === 0) {
          return (
                  <div style={{
                            minHeight: '60vh', display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', gap: 16, color: '#aaa',
                  }}>
                          <span style={{ fontSize: 48 }}>📊</span>span>
                          <h2 style={{ color: '#fff', margin: 0 }}>No hay cuentas conectadas</h2>h2>
                          <p style={{ margin: 0 }}>Ve a <strong>Configuración</strong>strong> y conecta tu cuenta de Instagram.</p>p>
                  </div>div>
                );
    }
  
    // ── Render ───────────────────────────────────────────────────────────────────
    return (
          <div style={{ padding: '24px 20px', maxWidth: 960, margin: '0 auto', fontFamily: 'sans-serif' }}>
          
            {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                        <h1 style={{ margin: 0, fontSize: 22, color: '#fff' }}>📊 Dashboard Instagram</h1>h1>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          {accounts.length > 1 && (
                        <select
                                        value={selected?.igUserId}
                                        onChange={(e) => setSelected(accounts.find((a) => a.igUserId === e.target.value))}
                                        style={{
                                                          background: '#1a1a2e', color: '#fff', border: '1px solid #333',
                                                          borderRadius: 8, padding: '6px 10px', fontSize: 13,
                                        }}
                                      >
                          {accounts.map((a) => (
                                                        <option key={a.igUserId} value={a.igUserId}>@{a.username || a.igUserId}</option>option>
                                                      ))}
                        </select>select>
                                  )}
                                  <button
                                                onClick={() => loadData(selected)}
                                                disabled={loading}
                                                style={{
                                                                background: loading ? '#333' : '#6c47ff',
                                                                color: '#fff', border: 'none', borderRadius: 8,
                                                                padding: '8px 16px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13,
                                                }}
                                              >
                                    {loading ? 'Cargando…' : '↺ Actualizar'}
                                  </button>button>
                        </div>div>
                </div>div>
          
            {error && (
                    <div style={{
                                background: 'rgba(255,60,60,.1)', border: '1px solid rgba(255,60,60,.4)',
                                borderRadius: 8, padding: 14, color: '#ff6b6b', marginBottom: 20, fontSize: 13,
                    }}>
                              ⚠️ {error}
                    </div>div>
                )}
          
            {/* ── Sección Cuenta ──────────────────────────────────────────────────── */}
            {profile && (
                    <section style={{ marginBottom: 32 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                                {profile.profile_picture_url && (
                                    <img
                                                      src={profile.profile_picture_url}
                                                      alt="avatar"
                                                      style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }}
                                                    />
                                  )}
                                          <div>
                                                        <div style={{ fontWeight: 700, color: '#fff', fontSize: 16 }}>@{profile.username}</div>div>
                                            {profile.biography && (
                                      <div style={{ color: '#aaa', fontSize: 12, marginTop: 2, maxWidth: 400 }}>{profile.biography}</div>div>
                                                        )}
                                          </div>div>
                              </div>div>
                              <h2 style={{ color: '#ccc', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>
                                          Cuenta
                              </h2>h2>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                                          <StatCard label="Seguidores" value={fmt(profile.followers_count)} icon="👥" />
                                          <StatCard label="Siguiendo" value={fmt(profile.follows_count)} icon="➕" />
                                          <StatCard label="Publicaciones" value={fmt(profile.media_count)} icon="🗂️" />
                                          <StatCard label="Engagement Rate" value={engagementRate} icon="📈" />
                              </div>div>
                    </section>section>
                )}
          
            {/* ── Sección Insights 28 días ────────────────────────────────────────── */}
            {insights && (
                    <section style={{ marginBottom: 32 }}>
                              <h2 style={{ color: '#ccc', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>
                                          Insights últimos 28 días
                              </h2>h2>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                                          <InsightCard label="Alcance total" value={fmt(sumInsight(insights, 'reach'))} icon="📡" />
                                          <InsightCard label="Impresiones" value={fmt(sumInsight(insights, 'impressions'))} icon="👁️" />
                                          <InsightCard label="Visitas al perfil" value={fmt(sumInsight(insights, 'profile_views'))} icon="🔍" />
                                          <InsightCard label="Seguidores nuevos" value={fmt(sumInsight(insights, 'follower_count'))} icon="🆕" />
                                          <InsightCard label="Clicks web" value={fmt(sumInsight(insights, 'website_clicks'))} icon="🌐" />
                                          <InsightCard label="Contactos email" value={fmt(sumInsight(insights, 'email_contacts'))} icon="📧" />
                                          <InsightCard label="Clicks teléfono" value={fmt(sumInsight(insights, 'phone_call_clicks'))} icon="📞" />
                              </div>div>
                    </section>section>
                )}
          
            {/* ── Sección Últimas publicaciones ──────────────────────────────────── */}
            {media.length > 0 && (
                    <section>
                              <h2 style={{ color: '#ccc', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>
                                          Últimas publicaciones
                              </h2>h2>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                                {media.map((post) => (
                                    <PostCard key={post.id} post={post} insights={mediaInsights[post.id]} />
                                  ))}
                              </div>div>
                    </section>section>
                )}
          
            {/* Loading skeleton */}
            {loading && !profile && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginTop: 20 }}>
                      {Array.from({ length: 8 }).map((_, i) => (
                                  <div key={i} style={{
                                                  background: 'rgba(255,255,255,0.03)',
                                                  border: '1px solid rgba(255,255,255,0.06)',
                                                  borderRadius: 10, height: 90,
                                                  animation: 'pulse 1.5s ease-in-out infinite',
                                  }} />
                                ))}
                    </div>div>
                )}
          </div>div>
        );
}</div>
