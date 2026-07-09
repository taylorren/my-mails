import { Hono } from 'hono'
import db from '../db.js'
import type { MailListItem, MailRecord } from '../types.js'

export const mailRoutes = new Hono()

// GET /api/mails - list mails with pagination
mailRoutes.get('/', (c) => {
  const page = Number(c.req.query('page')) || 1
  const limit = Number(c.req.query('limit')) || 50
  const offset = (page - 1) * limit
  const mailbox = c.req.query('mailbox') // optional filter

  let whereClause = ''
  const params: any[] = []

  if (mailbox === 'INBOX' || mailbox === 'Sent') {
    whereClause = 'WHERE mailbox = ?'
    params.push(mailbox)
  }

  const countRow = db
    .prepare(`SELECT COUNT(*) as total FROM mails ${whereClause}`)
    .get(...(params.length ? params : [])) as { total: number }

  const rows = db
    .prepare(
      `SELECT m.id, m.subject, m.from_name, m.from_email, m.date, m.mailbox,
              CASE
                WHEN m.ai_summary IS NULL THEN 'new'
                WHEN EXISTS (SELECT 1 FROM actions WHERE mail_id = m.id AND status = 'open') THEN 'pending'
                ELSE 'done'
              END AS status,
              EXISTS (
                SELECT 1 FROM actions
                WHERE mail_id = m.id AND status = 'open'
                AND datetime(created_at, '+7 days') < datetime('now')
              ) AS is_stale
       FROM mails m ${whereClause}
       ORDER BY m.date DESC
       LIMIT ? OFFSET ?`
    )
    .all(...(params.length ? params : []), limit, offset) as MailListItem[]

  return c.json({
    items: rows,
    total: countRow.total,
    page,
    limit,
    totalPages: Math.ceil(countRow.total / limit),
  })
})

// GET /api/mails/counts - folder counts
mailRoutes.get('/counts', (c) => {
  const total = (db.prepare('SELECT COUNT(*) as cnt FROM mails').get() as { cnt: number }).cnt
  const inbox = (db.prepare("SELECT COUNT(*) as cnt FROM mails WHERE mailbox = 'INBOX'").get() as { cnt: number }).cnt
  const sent = (db.prepare("SELECT COUNT(*) as cnt FROM mails WHERE mailbox = 'Sent'").get() as { cnt: number }).cnt
  return c.json({ total, inbox, sent })
})

// GET /api/mails/:id - single mail detail
mailRoutes.get('/:id', (c) => {
  const id = Number(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  const mail = db.prepare('SELECT * FROM mails WHERE id = ?').get(id) as MailRecord | undefined
  if (!mail) return c.json({ error: 'Mail not found' }, 404)

  // Also fetch related actions
  const actions = db
    .prepare('SELECT * FROM actions WHERE mail_id = ? ORDER BY created_at DESC')
    .all(id)

  return c.json({ ...mail, actions })
})
