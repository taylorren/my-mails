import { simpleParser, type ParsedMail } from 'mailparser'
import fs from 'node:fs'

export interface ParsedMailResult {
  messageId: string | null
  subject: string | null
  fromName: string | null
  fromEmail: string | null
  toJson: string | null
  ccJson: string | null
  date: string | null
  bodyText: string | null
  bodyHtml: string | null
}

export async function parseEmlFile(filePath: string): Promise<ParsedMailResult> {
  const raw = fs.readFileSync(filePath)
  const parsed: ParsedMail = await simpleParser(raw, {
    skipHtmlToText: false,
    skipTextToHtml: false,
  })

  const toAddr = (addr: any): { name: string; email: string } | null => {
    if (!addr) return null
    // mailparser wraps addresses in { value: [...] }
    const list: any[] = Array.isArray(addr) ? addr : (addr.value || [addr])
    if (list.length === 0) return null
    const first = list[0]
    return {
      name: first.name || '',
      email: first.address || '',
    }
  }

  const toJson = (addrs: any): string | null => {
    if (!addrs) return null
    // mailparser wraps addresses in { value: [...] }
    const list: any[] = Array.isArray(addrs) ? addrs : (addrs.value || [addrs])
    if (list.length === 0) return null
    return JSON.stringify(
      list.map((a: any) => ({
        name: a.name || '',
        email: a.address || '',
      }))
    )
  }

  const from = toAddr(parsed.from)
  const dateStr = parsed.date ? parsed.date.toISOString() : null

  return {
    messageId: parsed.messageId || null,
    subject: parsed.subject || null,
    fromName: from?.name || null,
    fromEmail: from?.email || null,
    toJson: toJson(parsed.to),
    ccJson: toJson(parsed.cc),
    date: dateStr,
    bodyText: parsed.text || null,
    bodyHtml: parsed.html || null,
  }
}
