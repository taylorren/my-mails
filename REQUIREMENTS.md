# Objective

This app scans locally stored and synced mails to provide AI-powered summarization, follow-up tracking, and better management of mails and customers.

# Fundamentals

1. Mails of importance are stored under `~/mail/gmail/INBOX/cur` and `~/mail/gmail/[Gmail]/Sent Mail`. Only mails dated after May 1st, 2025 are relevant.
2. Mails can contain English and Chinese. UTF-8 support throughout.
3. Web-based app built on modern frameworks (Vue 3, TypeScript, Tailwind CSS). No vanilla JS.
4. Complicated search supported by local vectorized library *(planned)*.
5. AI summary and follow-up action tracking via local/LAN Ollama. Actions stored in SQLite with full-text search support *(planned)*.
6. Follow-up actions have fields: summary, action by, created date, status (open/closed), closed date, related documents.

# UI

Simple and intuitive three-column layout:

1. **Folders sidebar** — INBOX / Sent with counts, scan trigger button.
2. **Mail list** — paginated list with status marks and infinite scroll.
3. **Mail detail** — split pane with AI summary + actions (top) and mail body (bottom, collapsed by default).

Status marks per mail:
- **O** (gray) — mail scanned, no AI summary yet
- **?** (amber) — AI summary done, has open actions
- **✓** (green) — all actions closed, or AI summary done with no actions

Mail turns orange when any action has been open for > 7 days.

User can close / reopen actions. List status updates in real-time without reload.

# Current Implementation

## Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js + TypeScript, Hono framework |
| Database | SQLite via better-sqlite3 (WAL mode) |
| AI | Ollama (Hermes 3), multi-host support (local/LAN/cloud) |
| Frontend | Vue 3 + TypeScript + Vite |
| State | Pinia |
| Routing | Vue Router |
| Styling | Tailwind CSS |

## Project Structure

```
mails/
├── package.json          # workspace root (pnpm)
├── pnpm-workspace.yaml
├── .env                  # shared env (MAIL_INBOX, MAIL_SENT, OLLAMA_*)
├── REQUIREMENTS.md
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── data/             # SQLite DB stored here
│   └── src/
│       ├── index.ts      # Hono server entry, CORS, route mounting
│       ├── db.ts         # SQLite schema + migrations
│       ├── types.ts      # Shared TypeScript interfaces
│       ├── mail/
│       │   ├── parser.ts   # .eml file parser (mailparser)
│       │   └── scanner.ts  # Maildir scanner, dedup, batch insert
│       ├── ollama/
│       │   ├── client.ts     # Ollama HTTP client, multi-host, model listing
│       │   └── summarizer.ts # System prompt + JSON parsing for mail → summary + actions
│       └── routes/
│           ├── mails.ts   # GET /api/mails (list with status), GET /api/mails/:id, GET /api/mails/counts
│           ├── actions.ts # GET/POST /api/actions, PATCH /api/actions/:id (close/reopen)
│           ├── scan.ts    # POST /api/scan — triggers Maildir scan
│           └── ollama.ts  # GET /api/ollama/models, POST /api/ollama/summarize/:mailId
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── main.ts
│       ├── App.vue
│       ├── style.css       # Tailwind + custom CSS variables
│       ├── router/index.ts
│       ├── stores/mails.ts # Pinia stores: useMailStore, useMailDetailStore
│       ├── lib/utils.ts
│       └── views/
│           ├── MailList.vue   # Three-column layout: folders, list, detail
│           └── MailDetail.vue # (standalone detail route)
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/mails` | List mails (page, limit, mailbox filter). Returns `status` (`new`/`pending`/`done`) and `is_stale`. |
| GET | `/api/mails/counts` | Folder counts (inbox, sent, total) |
| GET | `/api/mails/:id` | Single mail detail with actions |
| POST | `/api/scan` | Trigger Maildir scan (parses + inserts new mails, no AI) |
| GET | `/api/actions` | List actions (status filter, pagination) |
| POST | `/api/actions` | Create a new action |
| PATCH | `/api/actions/:id` | Close or reopen an action |
| GET | `/api/ollama/models` | List available models from all configured Ollama hosts |
| POST | `/api/ollama/summarize/:mailId` | Run AI summarization on a specific mail on demand |

## Database Schema

**mails** — id, file_path (unique), message_id (unique index), subject, from_name, from_email, to_json, cc_json, date, body_text, body_html, ai_summary, mailbox, scanned_at

**actions** — id, mail_id (FK), summary, action_by, status (open/closed), created_at, closed_at, related_docs

## Key Design Decisions

- **Scan does NOT run AI.** The scan route only parses and inserts mails. AI summarization is on demand via `/api/ollama/summarize/:mailId`.
- **Mail status is computed server-side.** The `status` field (`new`/`pending`/`done`) is derived from `ai_summary` and action states in the SQL query. `is_stale` checks if any action has been open > 7 days.
- **Real-time list sync.** When actions are closed/reopened or summary regenerated, the detail store updates the list store's item in-place so the O/?/✓ mark reflects immediately.
- **Multi-host Ollama.** The client iterates through configured hosts (local, LAN, cloud) until one responds. Model listing aggregates across all hosts.

## Not Yet Implemented

- Vector-based complicated search
- Full-text search on actions
- Manual action creation UI (backend endpoint exists)