# 📬 Mails

A web-based mail management tool that scans local Maildir, generates AI summaries via Ollama, and tracks follow-up actions.

## Features

- **Maildir scanning** — parses `.eml` files from INBOX and Sent folders, deduplicates by file path and message ID
- **AI summarization** — on-demand mail summary + action extraction via local/LAN Ollama (Hermes 3)
- **Action tracking** — close, reopen, and track follow-up items per mail
- **Three-state status** — O (new), ? (pending actions), ✓ (done) — updates in real-time
- **Stale detection** — mail turns orange when any action has been open > 7 days

## Quick Start

### Prerequisites

- Node.js ≥ 18
- [pnpm](https://pnpm.io/)
- [Ollama](https://ollama.com/) (optional — for AI features)

### Setup

```bash
# Install dependencies
pnpm install

# Copy and edit environment variables
cp .env.example .env   # or edit .env directly
```

### Environment

| Variable | Description | Default |
|----------|-------------|---------|
| `MAIL_INBOX` | Path to Maildir INBOX `cur` folder | `~/mail/gmail/INBOX` |
| `MAIL_SENT` | Path to Maildir Sent `cur` folder | `~/mail/gmail/[Gmail]/Sent Mail` |
| `MAIL_SCAN_SINCE` | Only scan mails after this date | `2025-05-01` |
| `OLLAMA_MODEL` | Default Ollama model | `hermes3:latest` |
| `OLLAMA_HOST_LOCAL` | Local Ollama host | `http://localhost:11434` |
| `OLLAMA_HOST_LAN` | LAN Ollama host | (optional) |
| `OLLAMA_HOST_CLOUD` | Cloud Ollama host | (optional) |
| `PORT` | Backend server port | `3001` |

### Run

```bash
# Start both backend and frontend
pnpm dev

# Or individually
pnpm dev:backend   # → http://localhost:3001
pnpm dev:frontend  # → http://localhost:5173
```

Open **http://localhost:5173** in your browser. Click **🔄 扫描邮件** to scan your Maildir.

## Project Structure

```
mails/
├── backend/          # Hono + SQLite API server (port 3001)
│   ├── src/
│   │   ├── index.ts          # Server entry, routes, CORS
│   │   ├── db.ts             # SQLite schema
│   │   ├── mail/scanner.ts   # Maildir parser + batch insert
│   │   ├── mail/parser.ts    # .eml → structured data
│   │   ├── ollama/client.ts  # Multi-host Ollama HTTP client
│   │   ├── ollama/summarizer.ts  # Prompt + JSON parsing
│   │   └── routes/           # REST API routes
│   └── data/                 # SQLite DB stored here
├── frontend/         # Vue 3 + Tailwind SPA (port 5173)
│   └── src/
│       ├── views/MailList.vue  # Main three-column layout
│       ├── stores/mails.ts     # Pinia stores
│       └── router/index.ts
├── .env              # Environment config
└── REQUIREMENTS.md   # Full design document
```

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/mails` | List mails (paginated, filter by mailbox) |
| `GET` | `/api/mails/counts` | Folder counts |
| `GET` | `/api/mails/:id` | Single mail with actions |
| `POST` | `/api/scan` | Trigger Maildir scan |
| `GET` | `/api/actions` | List actions |
| `POST` | `/api/actions` | Create action |
| `PATCH` | `/api/actions/:id` | Close/reopen action |
| `GET` | `/api/ollama/models` | List available Ollama models |
| `POST` | `/api/ollama/summarize/:mailId` | Run AI summarization |

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js, TypeScript, Hono |
| Database | SQLite (better-sqlite3, WAL mode) |
| AI | Ollama (Hermes 3) |
| Frontend | Vue 3, TypeScript, Vite |
| State | Pinia |
| Styling | Tailwind CSS v4 |

## License

Private — single user.
