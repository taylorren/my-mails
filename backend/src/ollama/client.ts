function getHost(): string {
  return process.env.OLLAMA_HOST_LAN
    || process.env.OLLAMA_HOST_LOCAL
    || 'http://localhost:11434'
}

export interface HostInfo {
  key: string
  label: string
  host: string
  type: 'ollama' | 'deepseek'
  apiKey?: string
}

function getHosts(): HostInfo[] {
  const hosts: HostInfo[] = []
  if (process.env.OLLAMA_HOST_LOCAL) hosts.push({ key: 'local', label: '🖥️ 本地', host: process.env.OLLAMA_HOST_LOCAL, type: 'ollama' })
  if (process.env.OLLAMA_HOST_LAN) hosts.push({ key: 'lan', label: '🏠 局域网', host: process.env.OLLAMA_HOST_LAN, type: 'ollama' })
  if (process.env.OLLAMA_HOST_CLOUD && process.env.OLLAMA_CLOUD_KEY) hosts.push({ key: 'cloud', label: '☁️ 云端', host: process.env.OLLAMA_HOST_CLOUD, type: 'ollama', apiKey: process.env.OLLAMA_CLOUD_KEY })
  if (process.env.DEEPSEEK_API_KEY) hosts.push({ key: 'deepseek', label: '🧠 DeepSeek', host: 'https://api.deepseek.com', type: 'deepseek' })
  return hosts
}

export interface ModelInfo {
  name: string
  hostKey: string
  hostLabel: string
  hostType: 'ollama' | 'deepseek'
}

function defaultModel(): string {
  return process.env.OLLAMA_MODEL || 'hermes3:latest'
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * Send a chat request via Ollama API.
 */
async function ollamaChatRaw(
  messages: ChatMessage[],
  model: string,
  host: string,
  apiKey?: string
): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  const res = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: { temperature: 0.3, num_predict: 512 },
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Ollama error ${res.status}: ${text}`)
  }
  const data = (await res.json()) as { message: { content: string } }
  return data.message.content
}

/**
 * Send a chat request via DeepSeek (OpenAI-compatible) API.
 */
async function deepseekChatRaw(
  messages: ChatMessage[],
  model: string
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured')

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 512,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`DeepSeek error ${res.status}: ${text}`)
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[] }
  return data.choices[0].message.content
}

/**
 * Unified chat - routes to Ollama or DeepSeek based on hostKey.
 */
export async function chat(
  messages: ChatMessage[],
  model?: string,
  hostKey?: string
): Promise<string> {
  const hosts = getHosts()
  const key = hostKey || 'lan' // default to LAN
  const info = hosts.find(h => h.key === key)

  if (info?.type === 'deepseek') {
    return deepseekChatRaw(messages, model || process.env.DEEPSEEK_MODEL || 'deepseek-chat')
  }

  // Ollama (local, lan, or cloud with key)
  const baseUrl = info?.host || getHost()
  return ollamaChatRaw(messages, model || defaultModel(), baseUrl, info?.apiKey)
}

// Keep backward compat
export async function ollamaChat(
  messages: ChatMessage[],
  model?: string,
  host?: string
): Promise<string> {
  return ollamaChatRaw(messages, model || defaultModel(), host || getHost())
}

export function getDefaultModel(): string {
  return defaultModel()
}

/**
 * List available models from all configured hosts.
 */
export async function listAllModels(): Promise<ModelInfo[]> {
  const hosts = getHosts()
  const results: ModelInfo[] = []

  for (const h of hosts) {
    if (h.type === 'deepseek') {
      const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat'
      results.push({ name: model, hostKey: h.key, hostLabel: h.label, hostType: 'deepseek' })
      continue
    }
    // Ollama (local, lan, cloud): fetch from /api/tags
    try {
      const headers: Record<string, string> = {}
      if (h.apiKey) headers['Authorization'] = `Bearer ${h.apiKey}`
      const res = await fetch(`${h.host}/api/tags`, { headers })
      if (res.ok) {
        const data = (await res.json()) as { models: { name: string }[] }
        for (const m of data.models) {
          results.push({ name: m.name, hostKey: h.key, hostLabel: h.label, hostType: 'ollama' })
        }
      }
    } catch { /* unreachable, skip */ }
  }

  return results
}

export async function listModels(host?: string): Promise<string[]> {
  const baseUrl = host || getHost()
  const res = await fetch(`${baseUrl}/api/tags`)
  if (!res.ok) throw new Error(`Failed to list models: ${res.status}`)
  const data = (await res.json()) as { models: { name: string }[] }
  return data.models.map((m) => m.name)
}
