/**
 * LLM API wrappers for OpenAI and Anthropic, including streaming variants.
 * 
 * Expects a `deps` object with:
 *   - readAppSettings(): returns settings object
 *   - getMainWindow(): returns BrowserWindow instance (for streaming tokens)
 */

let _deps = {}

function init(deps) {
  _deps = deps
}

function extractFirstJsonObject(text) {
  if (!text || typeof text !== 'string') return null
  const s = text.trim()
  if (!s) return null
  if (s.startsWith('{') || s.startsWith('[')) {
    try { return JSON.parse(s) } catch { /* continue */ }
  }
  const firstBrace = s.indexOf('{')
  const firstBracket = s.indexOf('[')
  let start = -1
  if (firstBrace >= 0 && firstBracket >= 0) start = Math.min(firstBrace, firstBracket)
  else start = Math.max(firstBrace, firstBracket)
  if (start < 0) return null

  const sub = s.slice(start)
  for (let end = sub.length; end > 1; end--) {
    const candidate = sub.slice(0, end).trim()
    const last = candidate[candidate.length - 1]
    if (last !== '}' && last !== ']') continue
    try { return JSON.parse(candidate) } catch { /* keep trying */ }
  }
  return null
}

function isJsonTruncated(text) {
  if (!text || typeof text !== 'string') return false
  const s = text.trim()
  if (!s) return false
  const firstBrace = s.indexOf('{')
  const firstBracket = s.indexOf('[')
  if (firstBrace < 0 && firstBracket < 0) return false
  const last = s[s.length - 1]
  if (last === '}' || last === ']') {
    try {
      JSON.parse(s.slice(Math.min(firstBrace >= 0 ? firstBrace : Infinity, firstBracket >= 0 ? firstBracket : Infinity)))
      return false
    } catch { /* truncated */ }
  }
  return true
}

async function extractJsonWithContinuation(text, messages, options = {}) {
  let parsed = extractFirstJsonObject(text)
  if (parsed) return parsed
  if (!isJsonTruncated(text)) return null

  console.log('[json-continuation] Response appears truncated, requesting continuation...')
  let accumulated = text

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const contMessages = [
        ...messages,
        { role: 'assistant', content: accumulated },
        { role: 'user', content: 'Your previous response was cut off mid-JSON. Continue EXACTLY from where you stopped. Output ONLY the remaining JSON, no commentary.' },
      ]
      const continuation = await llmChat(contMessages, { maxTokens: options.maxTokens || 4096 })
      accumulated += continuation
      parsed = extractFirstJsonObject(accumulated)
      if (parsed) {
        console.log('[json-continuation] Successfully parsed after continuation attempt', attempt + 1)
        return parsed
      }
    } catch (err) {
      console.error('[json-continuation] Continuation attempt failed:', err.message)
      break
    }
  }
  return null
}

function getAICredentials() {
  const settings = _deps.readAppSettings()
  const provider = settings.aiProvider || 'openai'
  if (provider === 'anthropic') {
    const apiKey = (process.env.ANTHROPIC_API_KEY && String(process.env.ANTHROPIC_API_KEY).trim())
      || (settings.anthropicApiKey && String(settings.anthropicApiKey).trim())
    return { provider, apiKey, model: settings.anthropicModel || 'claude-sonnet-4-5' }
  }
  const apiKey = (process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim())
    || (settings.openaiApiKey && String(settings.openaiApiKey).trim())
  return {
    provider, apiKey,
    model: settings.openaiModel || 'gpt-4o-mini',
    baseUrl: settings.openaiBaseUrl || 'https://api.openai.com',
  }
}

function getProvider() {
  try { return _deps.readAppSettings()?.aiProvider || 'openai' } catch { return 'openai' }
}

function isAnthropicProvider() {
  return getProvider() === 'anthropic'
}

async function callOpenAIChat({ apiKey, baseUrl, model, messages }) {
  const root = (baseUrl || 'https://api.openai.com').replace(/\/+$/, '')
  const url = `${root}/v1/chat/completions`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.2 }),
  })
  if (!resp.ok) {
    const t = await resp.text().catch(() => '')
    throw new Error(`OpenAI request failed (${resp.status}): ${t || resp.statusText}`)
  }
  const data = await resp.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenAI returned empty content')
  return content
}

async function callAnthropicChat({ apiKey, model, messages, maxTokens = 2048 }) {
  const url = 'https://api.anthropic.com/v1/messages'
  let systemText = ''
  const conversationMessages = []
  for (const msg of messages) {
    if (msg.role === 'system') systemText = msg.content
    else conversationMessages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content })
  }
  const body = {
    model,
    max_tokens: Math.max(256, Number(maxTokens) || 4096),
    temperature: 0.2,
    messages: conversationMessages,
  }
  if (systemText) body.system = systemText

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const t = await resp.text().catch(() => '')
    const err = new Error(`Anthropic request failed (${resp.status}): ${t || resp.statusText}`)
    err.status = resp.status
    const ra = resp.headers?.get?.('retry-after')
    err.retryAfterMs = ra ? Math.max(0, Number(ra) * 1000) : 0
    err.bodyText = t
    throw err
  }
  const data = await resp.json()
  const textBlock = (data?.content || []).find(b => b.type === 'text')
  const content = textBlock?.text
  if (!content) throw new Error('Anthropic returned empty content')
  return content
}

async function callOpenAIChatStream({ apiKey, baseUrl, model, messages, onToken }) {
  const root = (baseUrl || 'https://api.openai.com').replace(/\/+$/, '')
  const url = `${root}/v1/chat/completions`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.2, stream: true }),
  })
  if (!resp.ok) {
    const t = await resp.text().catch(() => '')
    throw new Error(`OpenAI stream failed (${resp.status}): ${t || resp.statusText}`)
  }
  let accumulated = ''
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ')) continue
      const payload = trimmed.slice(6)
      if (payload === '[DONE]') break
      try {
        const json = JSON.parse(payload)
        const delta = json.choices?.[0]?.delta?.content
        if (delta) { accumulated += delta; onToken?.(delta, accumulated) }
      } catch { /* skip */ }
    }
  }
  return accumulated
}

async function callAnthropicChatStream({ apiKey, model, messages, maxTokens = 4096, onToken }) {
  const url = 'https://api.anthropic.com/v1/messages'
  let systemText = ''
  const conversationMessages = []
  for (const msg of messages) {
    if (msg.role === 'system') systemText = msg.content
    else conversationMessages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content })
  }
  const body = {
    model,
    max_tokens: Math.max(256, Number(maxTokens) || 4096),
    temperature: 0.2,
    messages: conversationMessages,
    stream: true,
  }
  if (systemText) body.system = systemText

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const t = await resp.text().catch(() => '')
    const err = new Error(`Anthropic stream failed (${resp.status}): ${t || resp.statusText}`)
    err.status = resp.status
    throw err
  }

  let accumulated = ''
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ')) continue
      try {
        const json = JSON.parse(trimmed.slice(6))
        if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
          const text = json.delta.text
          accumulated += text
          onToken?.(text, accumulated)
        }
      } catch { /* skip */ }
    }
  }
  return accumulated
}

async function llmChat(messages, options = {}) {
  const creds = getAICredentials()
  if (!creds.apiKey) throw new Error(`No API key set for ${creds.provider}. Set it in AI settings.`)
  if (creds.provider === 'anthropic') {
    const maxTokens = options.maxTokens || 4096
    let attempt = 0
    while (true) {
      try {
        return await callAnthropicChat({ apiKey: creds.apiKey, model: creds.model, messages, maxTokens })
      } catch (err) {
        attempt++
        const status = err?.status
        const msg = String(err?.message || '').toLowerCase()
        const isRateLimited = status === 429 || msg.includes('rate limit') || msg.includes('rate_limit')
        if (!isRateLimited || attempt >= 3) throw err
        const backoffMs = err?.retryAfterMs || (500 * Math.pow(2, attempt - 1))
        await new Promise(r => setTimeout(r, Math.min(backoffMs, 5000)))
      }
    }
  }
  return callOpenAIChat({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, model: creds.model, messages })
}

async function llmChatStream(messages, options = {}) {
  const creds = getAICredentials()
  if (!creds.apiKey) throw new Error(`No API key set for ${creds.provider}. Set it in AI settings.`)
  const onToken = options.onToken
  const maxTokens = options.maxTokens || 4096

  if (creds.provider === 'anthropic') {
    let attempt = 0
    while (true) {
      try {
        return await callAnthropicChatStream({ apiKey: creds.apiKey, model: creds.model, messages, maxTokens, onToken })
      } catch (err) {
        attempt++
        const status = err?.status
        const msg = String(err?.message || '').toLowerCase()
        const isRateLimited = status === 429 || msg.includes('rate limit') || msg.includes('rate_limit')
        if (!isRateLimited || attempt >= 3) throw err
        const backoffMs = err?.retryAfterMs || (500 * Math.pow(2, attempt - 1))
        await new Promise(r => setTimeout(r, Math.min(backoffMs, 5000)))
      }
    }
  }
  return callOpenAIChatStream({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, model: creds.model, messages, onToken })
}

module.exports = {
  init,
  extractFirstJsonObject,
  isJsonTruncated,
  extractJsonWithContinuation,
  getAICredentials,
  getProvider,
  isAnthropicProvider,
  llmChat,
  llmChatStream,
}
