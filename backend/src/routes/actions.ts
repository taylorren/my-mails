import { Hono } from 'hono'
import db from '../db.js'
import type { ActionRecord } from '../types.js'

export const actionRoutes = new Hono()

// GET /api/actions - list all actions
actionRoutes.get('/', (c) => {
  const status = c.req.query('status') // 'open' | 'closed' | undefined (all)
  const page = Number(c.req.query('page')) || 1
  const limit = Number(c.req.query('limit')) || 50
  const offset = (page - 1) * limit

  let whereClause = ''
  const params: any[] = []

  if (status === 'open' || status === 'closed') {
    whereClause = 'WHERE a.status = ?'
    params.push(status)
  }

  const countRow = db
    .prepare(`SELECT COUNT(*) as total FROM actions a ${whereClause}`)
    .get(...params) as { total: number }

  const rows = db
    .prepare(
      `SELECT a.*, m.subject as mail_subject
       FROM actions a
       LEFT JOIN mails m ON a.mail_id = m.id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset)

  return c.json({
    items: rows,
    total: countRow.total,
    page,
    limit,
    totalPages: Math.ceil(countRow.total / limit),
  })
})

// POST /api/actions - create new action
actionRoutes.post('/', async (c) => {
  const body = await c.req.json<{
    mail_id?: number
    summary: string
    action_by?: string
    related_docs?: string
  }>()

  if (!body.summary || body.summary.trim() === '') {
    return c.json({ error: 'summary is required' }, 400)
  }

  const result = db
    .prepare(
      `INSERT INTO actions (mail_id, summary, action_by, related_docs)
       VALUES (?, ?, ?, ?)`
    )
    .run(
      body.mail_id || null,
      body.summary.trim(),
      body.action_by || null,
      body.related_docs || null
    )

  const action = db.prepare('SELECT * FROM actions WHERE id = ?').get(result.lastInsertRowid)
  return c.json(action, 201)
})

// PATCH /api/actions/:id - update action (close/reopen)
actionRoutes.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  const body = await c.req.json<{
    status?: 'open' | 'closed'
    summary?: string
    action_by?: string
    related_docs?: string
  }>()

  const existing = db.prepare('SELECT * FROM actions WHERE id = ?').get(id) as ActionRecord | undefined
  if (!existing) return c.json({ error: 'Action not found' }, 404)

  if (body.status === 'closed' && existing.status === 'open') {
    db.prepare(
      `UPDATE actions SET status = 'closed', closed_at = datetime('now') WHERE id = ?`
    ).run(id)
  } else if (body.status === 'open' && existing.status === 'closed') {
    db.prepare(
      `UPDATE actions SET status = 'open', closed_at = NULL WHERE id = ?`
    ).run(id)
  }

  if (body.summary !== undefined) {
    db.prepare('UPDATE actions SET summary = ? WHERE id = ?').run(body.summary, id)
  }
  if (body.action_by !== undefined) {
    db.prepare('UPDATE actions SET action_by = ? WHERE id = ?').run(body.action_by, id)
  }
  if (body.related_docs !== undefined) {
    db.prepare('UPDATE actions SET related_docs = ? WHERE id = ?').run(body.related_docs, id)
  }

  const updated = db.prepare('SELECT * FROM actions WHERE id = ?').get(id)
  return c.json(updated)
})
