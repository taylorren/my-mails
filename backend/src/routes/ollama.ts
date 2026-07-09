import { Hono } from 'hono'
import { listAllModels, type ModelInfo } from '../ollama/client.js'
import { summarizeMail } from '../ollama/summarizer.js'
import db from '../db.js'

export const ollamaRoutes = new Hono()

// GET /api/ollama/models - list models from all configured hosts
ollamaRoutes.get('/models', async (c) => {
  try {
    const models: ModelInfo[] = await listAllModels()
    return c.json({ models })
  } catch (err) {
    return c.json({ error: 'No Ollama hosts available', models: [] }, 503)
  }
})

// POST /api/ollama/summarize/:mailId - re-summarize a mail
ollamaRoutes.post('/summarize/:mailId', async (c) => {
  const mailId = Number(c.req.param('mailId'))
  if (isNaN(mailId)) return c.json({ error: 'Invalid mail id' }, 400)

  const mail = db.prepare('SELECT id, subject, body_text FROM mails WHERE id = ?').get(mailId) as any
  if (!mail) return c.json({ error: 'Mail not found' }, 404)

  const body = await c.req.json().catch(() => ({}))
  const model = body.model || undefined
  const hostKey = body.hostKey || undefined

  try {
    const result = await summarizeMail(mail.subject, mail.body_text, model, hostKey)

    // Update summary
    if (result.summary) {
      db.prepare('UPDATE mails SET ai_summary = ? WHERE id = ?').run(result.summary, mailId)
    }

    // Insert new actions (avoid duplicates: delete old AI-generated ones first)
    // We only delete actions without action_by (i.e. AI-generated)
    db.prepare('DELETE FROM actions WHERE mail_id = ? AND action_by IS NULL').run(mailId)
    for (const actionText of result.actions) {
      if (actionText.trim()) {
        db.prepare('INSERT INTO actions (mail_id, summary) VALUES (?, ?)').run(mailId, actionText.trim())
      }
    }

    // Return updated mail + actions
    const updated = db.prepare('SELECT * FROM mails WHERE id = ?').get(mailId)
    const actions = db.prepare('SELECT * FROM actions WHERE mail_id = ? ORDER BY created_at DESC').all(mailId)
    return c.json({ ...updated as any, actions })
  } catch (err) {
    return c.json({ error: 'Ollama summarization failed', details: String(err) }, 500)
  }
})
