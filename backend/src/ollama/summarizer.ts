import { chat } from './client.js'

const SYSTEM_PROMPT = `你是一个帮助商务人士管理邮件的助手。
请分析以下邮件，并用中文提供：

1. 一句话摘要，概括邮件核心内容。
2. 需要跟进的行动事项列表（如有）。每项用简短的中文句子描述。

请严格按以下 JSON 格式回复（不要包含其他文字）：
{
  "summary": "...",
  "actions": ["...", "..."]
}

如果没有需要跟进的行动，actions 用空数组 [].`

export interface SummarizeResult {
  summary: string
  actions: string[]
}

/**
 * Generate a summary and action items from an email.
 */
export async function summarizeMail(
  subject: string | null,
  bodyText: string | null,
  model?: string,
  hostKey?: string
): Promise<SummarizeResult> {
  // Truncate body to avoid exceeding context window
  const truncatedBody = (bodyText || '').slice(0, 4000)
  const userMessage = `主题: ${subject || '(无主题)'}\n\n正文:\n${truncatedBody}`

  const response = await chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    model,
    hostKey
  )

  // Parse JSON from response (handle various Ollama output quirks)
  let json = response.trim()

  // Strip markdown code blocks
  json = json.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim()

  // Some models wrap the JSON in quotes or omit outer braces
  if (!json.startsWith('{') && json.includes('"summary"')) {
    json = '{' + json + '}'
  }

  // Fix common JSON issues: unescaped newlines in string values
  json = json.replace(/\n/g, ' ')

  try {
    const parsed = JSON.parse(json) as SummarizeResult
    return {
      summary: parsed.summary || '',
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
    }
  } catch {
    // Fallback: try to extract summary and actions via regex
    const summaryMatch = response.match(/"summary"\s*:\s*"([^"]+)"/)
    const actionsMatch = response.match(/"actions"\s*:\s*\[([\s\S]*?)\]/)
    if (summaryMatch) {
      const actions: string[] = []
      if (actionsMatch) {
        const actionRegex = /"([^"]+)"/g
        let m: RegExpExecArray | null
        while ((m = actionRegex.exec(actionsMatch[1])) !== null) {
          actions.push(m[1])
        }
      }
      return { summary: summaryMatch[1], actions }
    }
    // Last resort: use first 200 chars as summary
    return { summary: response.slice(0, 200).replace(/\n/g, ' '), actions: [] }
  }
}
