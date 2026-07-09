import { Hono } from 'hono'
import { scanAll } from '../mail/scanner.js'

export const scanRoutes = new Hono()

// POST /api/scan - trigger maildir scan
scanRoutes.post('/', async (c) => {
  const inboxPath = process.env.MAIL_INBOX || '/Users/tr/mail/gmail/INBOX'
  const sentPath = process.env.MAIL_SENT || '/Users/tr/mail/gmail/[Gmail]/Sent Mail'
  const sinceStr = process.env.MAIL_SCAN_SINCE || '2025-05-01'
  const since = new Date(sinceStr)

  console.log(`Scanning: INBOX=${inboxPath}, Sent=${sentPath}, since=${since.toISOString()}`)

  try {
    const result = await scanAll(inboxPath, sentPath, since)
    const total = result.inbox.scanned + result.sent.scanned
    const totalSkipped = result.inbox.skipped + result.sent.skipped
    const totalErrors = result.inbox.errors + result.sent.errors

    return c.json({
      ok: true,
      inbox: result.inbox,
      sent: result.sent,
      total,
      totalSkipped,
      totalErrors,
    })
  } catch (err) {
    console.error('Scan error:', err)
    return c.json({ error: 'Scan failed', details: String(err) }, 500)
  }
})
