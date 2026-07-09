import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') })

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { mailRoutes } from './routes/mails.js'
import { actionRoutes } from './routes/actions.js'
import { scanRoutes } from './routes/scan.js'
import { ollamaRoutes } from './routes/ollama.js'

const app = new Hono()

// CORS for frontend dev server
app.use('/*', cors({
  origin: ['http://localhost:5173', 'http://localhost:3001'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}))

// Routes
app.route('/api/mails', mailRoutes)
app.route('/api/actions', actionRoutes)
app.route('/api/scan', scanRoutes)
app.route('/api/ollama', ollamaRoutes)

// Health check
app.get('/api/health', (c) => c.json({ ok: true }))

const port = Number(process.env.PORT) || 3001

console.log(`🚀 Backend starting on http://localhost:${port}`)
const hosts: string[] = []
if (process.env.OLLAMA_HOST_LOCAL) hosts.push(`🖥️ local: ${process.env.OLLAMA_HOST_LOCAL}`)
if (process.env.OLLAMA_HOST_LAN) hosts.push(`🏠 lan: ${process.env.OLLAMA_HOST_LAN}`)
if (process.env.OLLAMA_HOST_CLOUD) hosts.push(`☁️ cloud: ${process.env.OLLAMA_HOST_CLOUD}`)
console.log(`🤖 Ollama: ${process.env.OLLAMA_MODEL || 'hermes3:latest'} | ${hosts.join(' | ') || 'http://localhost:11434'}`)

serve({
  fetch: app.fetch,
  port,
})
