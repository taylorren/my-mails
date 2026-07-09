import fs from 'node:fs'
import path from 'node:path'
import db from '../db.js'
import { parseEmlFile } from './parser.js'

export interface ScanResult {
  scanned: number
  skipped: number
  errors: number
}

/**
 * Scan a Maildir folder for new emails.
 * Skips files that already exist in the database (by file_path).
 */
export async function scanMaildir(
  maildirPath: string,
  mailbox: 'INBOX' | 'Sent',
  since: Date
): Promise<ScanResult> {
  const result: ScanResult = { scanned: 0, skipped: 0, errors: 0 }
  const curDir = path.join(maildirPath, 'cur')

  if (!fs.existsSync(curDir)) {
    console.warn(`Maildir not found: ${curDir}`)
    return result
  }

  const files = fs.readdirSync(curDir)

  // Prepare statements
  const checkByPath = db.prepare('SELECT id FROM mails WHERE file_path = ?')
  const checkByMsgId = db.prepare('SELECT id FROM mails WHERE message_id = ? AND message_id IS NOT NULL')
  const insertStmt = db.prepare(`
    INSERT INTO mails (file_path, message_id, subject, from_name, from_email, to_json, cc_json, date, body_text, body_html, mailbox, ai_summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertMany = db.transaction((entries: Array<{ filePath: string; data: any; mailbox: string }>) => {
    for (const entry of entries) {
      const { data } = entry
      insertStmt.run(
        entry.filePath,
        data.messageId,
        data.subject,
        data.fromName,
        data.fromEmail,
        data.toJson,
        data.ccJson,
        data.date,
        data.bodyText,
        data.bodyHtml,
        entry.mailbox,
        null // ai_summary filled later on demand
      )
    }
  })

  const batch: Array<{ filePath: string; data: any; mailbox: string }> = []

  for (const filename of files) {
    // Skip non-mail files (Maildir uses specific naming, but be safe)
    if (filename.startsWith('.')) continue

    const filePath = path.join(curDir, filename)

    // Check if already scanned (dedup by file_path)
    const existing = checkByPath.get(filePath) as { id: number } | undefined
    if (existing) {
      result.skipped++
      continue
    }

    try {
      const parsed = await parseEmlFile(filePath)

      // Dedup by message_id (same email may exist in multiple files)
      if (parsed.messageId) {
        const dup = checkByMsgId.get(parsed.messageId) as { id: number } | undefined
        if (dup) {
          result.skipped++
          continue
        }
      }

      // Filter by date
      if (parsed.date) {
        const mailDate = new Date(parsed.date)
        if (mailDate < since) {
          // Insert a placeholder so we don't re-scan it, but mark with old date
          // Actually, let's skip old mails entirely and NOT insert placeholder.
          // The user said "ignore" - so we skip and don't record.
          // But wait - this means we'll re-scan each time. Let's handle this
          // by inserting a minimal record for old mails too, to prevent rescan.
          // Actually, the user said "all mails before that date is irrelevant
          // and should be ignored." Let me create a separate table or just
          // insert with a flag. Simplest: insert with body=null and a note.
          // Or: just skip and accept re-scan. For now, skip.
          // Hmm, re-reading: "should be ignored" - skip them completely.
          continue
        }
      }

      batch.push({ filePath, data: parsed, mailbox })

      if (batch.length >= 20) {
        insertMany(batch)
        result.scanned += batch.length
        batch.length = 0
      }
    } catch (err) {
      console.error(`Error parsing ${filePath}:`, err)
      result.errors++
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    insertMany(batch)
    result.scanned += batch.length
  }

  return result
}

/**
 * Scan both INBOX and Sent folders.
 */
export async function scanAll(
  inboxPath: string,
  sentPath: string,
  since: Date
): Promise<{ inbox: ScanResult; sent: ScanResult }> {
  const inbox = await scanMaildir(inboxPath, 'INBOX', since)
  const sent = await scanMaildir(sentPath, 'Sent', since)
  return { inbox, sent }
}
