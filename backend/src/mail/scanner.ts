import fs from 'node:fs'
import path from 'node:path'
import db from '../db.js'
import { parseEmlFile } from './parser.js'

export interface ScanResult {
  scanned: number
  skipped: number
  errors: number
}

/** Get the last scan timestamp, or null if never scanned. */
function getLastScanAt(): string | null {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'last_scan_at'").get() as { value: string } | undefined
  return row?.value || null
}

/** Update the last scan timestamp to now. */
function setLastScanAt(): void {
  const now = new Date().toISOString()
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('last_scan_at', ?)").run(now)
}

/**
 * Scan a Maildir folder for new emails.
 * On first run, uses MAIL_SCAN_SINCE date filter.
 * On subsequent runs, only processes files modified after last scan.
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

  const lastScanAt = getLastScanAt()
  const isFirstScan = !lastScanAt
  const lastScanMs = lastScanAt ? new Date(lastScanAt).getTime() : 0

  console.log(`Scanning ${mailbox}: first=${isFirstScan}, lastScan=${lastScanAt || 'never'}`)

  const allFiles = fs.readdirSync(curDir)

  // Filter files by mtime on subsequent scans
  const files = isFirstScan
    ? allFiles
    : allFiles.filter(f => {
        try {
          const stat = fs.statSync(path.join(curDir, f))
          return stat.mtimeMs > lastScanMs
        } catch {
          return false
        }
      })

  if (!isFirstScan) {
    console.log(`  Incremental: ${files.length} new/changed of ${allFiles.length} total`)
  }

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
        null
      )
    }
  })

  const batch: Array<{ filePath: string; data: any; mailbox: string }> = []

  for (const filename of files) {
    if (filename.startsWith('.')) continue

    const filePath = path.join(curDir, filename)

    // Dedup by file_path (already scanned)
    const existing = checkByPath.get(filePath) as { id: number } | undefined
    if (existing) {
      result.skipped++
      continue
    }

    try {
      const parsed = await parseEmlFile(filePath)

      // Dedup by message_id
      if (parsed.messageId) {
        const dup = checkByMsgId.get(parsed.messageId) as { id: number } | undefined
        if (dup) {
          result.skipped++
          continue
        }
      }

      // Filter by mail date (only on first scan; on incremental, we trust mtime)
      if (isFirstScan && parsed.date) {
        const mailDate = new Date(parsed.date)
        if (mailDate < since) continue
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
 * Scan both INBOX and Sent folders, then update last_scan_at.
 */
export async function scanAll(
  inboxPath: string,
  sentPath: string,
  since: Date
): Promise<{ inbox: ScanResult; sent: ScanResult }> {
  const inbox = await scanMaildir(inboxPath, 'INBOX', since)
  const sent = await scanMaildir(sentPath, 'Sent', since)
  setLastScanAt()
  return { inbox, sent }
}
