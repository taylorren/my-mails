import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'data', 'mails.db')
const DATA_DIR = path.dirname(DB_PATH)

// Ensure data directory exists
import fs from 'node:fs'
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

const db = new Database(DB_PATH)

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS mails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL UNIQUE,
    message_id TEXT,
    subject TEXT,
    from_name TEXT,
    from_email TEXT,
    to_json TEXT,
    cc_json TEXT,
    date TEXT,
    body_text TEXT,
    body_html TEXT,
    ai_summary TEXT,
    mailbox TEXT NOT NULL DEFAULT 'INBOX',
    scanned_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_mails_date ON mails(date);
  CREATE INDEX IF NOT EXISTS idx_mails_mailbox ON mails(mailbox);
  CREATE INDEX IF NOT EXISTS idx_mails_file_path ON mails(file_path);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_mails_message_id ON mails(message_id) WHERE message_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mail_id INTEGER,
    summary TEXT NOT NULL,
    action_by TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    closed_at TEXT,
    related_docs TEXT,
    FOREIGN KEY (mail_id) REFERENCES mails(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_actions_mail_id ON actions(mail_id);
  CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status);
`)

// Migration: add ai_summary column if not exists
try {
  db.exec(`ALTER TABLE mails ADD COLUMN ai_summary TEXT`)
} catch { /* column already exists */ }

export default db
