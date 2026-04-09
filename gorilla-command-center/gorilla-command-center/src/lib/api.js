// ── Anthropic API ────────────────────────────────────────────────────────────

export async function callClaude(messages, system, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, system, messages }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.content?.filter(b => b.type === 'text').map(b => b.text).join('\n') || ''
}

// ── Meta Graph API ───────────────────────────────────────────────────────────

async function metaGET(path, token) {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`https://graph.facebook.com/v19.0${path}${sep}access_token=${token}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data
}

export async function discoverIGAccounts(token) {
  const pages = await metaGET('/me/accounts?fields=id,name,instagram_business_account', token)
  const accounts = []
  for (const page of (pages.data || [])) {
    if (page.instagram_business_account) {
      try {
        const ig = await metaGET(
          `/${page.instagram_business_account.id}?fields=id,username,name,profile_picture_url,followers_count,media_count,biography`,
          token
        )
        accounts.push({ ...ig, pageName: page.name, pageId: page.id })
      } catch {}
    }
  }
  return accounts
}

export async function fetchIGData(token, igUserId) {
  const profile = await metaGET(
    `/${igUserId}?fields=username,followers_count,media_count,profile_picture_url,biography,name`,
    token
  )
  let topMedia = []
  try {
    const media = await metaGET(
      `/${igUserId}/media?fields=id,caption,like_count,comments_count,timestamp,media_type,media_url&limit=5`,
      token
    )
    topMedia = media.data || []
  } catch {}
  return { profile, topMedia }
}

export async function igPublish(token, igUserId, imageUrl, caption) {
  const cRes = await fetch(
    `https://graph.facebook.com/v19.0/${igUserId}/media?image_url=${encodeURIComponent(imageUrl)}&caption=${encodeURIComponent(caption)}&access_token=${token}`,
    { method: 'POST' }
  )
  const c = await cRes.json()
  if (!c.id) throw new Error(c.error?.message || 'Error creando container de imagen')

  const pRes = await fetch(
    `https://graph.facebook.com/v19.0/${igUserId}/media_publish?creation_id=${c.id}&access_token=${token}`,
    { method: 'POST' }
  )
  const p = await pRes.json()
  if (!p.id) throw new Error(p.error?.message || 'Error publicando en Instagram')
  return p.id
}

// ── localStorage helpers ─────────────────────────────────────────────────────

export const storage = {
  get: (key) => { try { return JSON.parse(localStorage.getItem(key)) } catch { return null } },
  set: (key, val) => localStorage.setItem(key, JSON.stringify(val)),
  remove: (key) => localStorage.removeItem(key),
}
