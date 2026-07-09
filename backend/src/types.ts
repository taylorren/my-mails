// Types shared across the app

export interface MailRecord {
  id: number
  file_path: string
  message_id: string | null
  subject: string | null
  from_name: string | null
  from_email: string | null
  to_json: string | null // JSON array
  cc_json: string | null
  date: string | null // ISO
  body_text: string | null
  body_html: string | null
  ai_summary: string | null
  mailbox: string // 'INBOX' | 'Sent'
  scanned_at: string // ISO
}

export interface MailListItem {
  id: number
  subject: string | null
  from_name: string | null
  from_email: string | null
  date: string | null
  mailbox: string
  status: 'new' | 'pending' | 'done'
  /** Whether any action related to this mail has been open for > 7 days */
  is_stale: number // 0 or 1 from SQLite boolean
}

export interface ActionRecord {
  id: number
  mail_id: number | null
  summary: string
  action_by: string | null
  status: 'open' | 'closed'
  created_at: string
  closed_at: string | null
  related_docs: string | null // JSON array
}
