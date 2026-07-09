import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface MailListItem {
  id: number
  subject: string | null
  from_name: string | null
  from_email: string | null
  date: string | null
  mailbox: string
  status: 'new' | 'pending' | 'done'
  is_stale: number // 0 or 1 from SQLite boolean
}

export interface MailDetail extends MailListItem {
  message_id: string | null
  to_json: string | null
  cc_json: string | null
  body_text: string | null
  body_html: string | null
  ai_summary: string | null
  actions: ActionSummary[]
}

export interface ActionSummary {
  id: number
  summary: string
  action_by: string | null
  status: 'open' | 'closed'
  created_at: string
  closed_at: string | null
}

const API = '/api'

export const useMailStore = defineStore('mails', () => {
  const items = ref<MailListItem[]>([])
  const total = ref(0)
  const page = ref(1)
  const limit = ref(50)
  const loading = ref(false)
  const mailbox = ref<string | null>('INBOX') // default to INBOX
  const counts = ref<{ inbox: number; sent: number; total: number }>({ inbox: 0, sent: 0, total: 0 })

  const totalPages = computed(() => Math.ceil(total.value / limit.value))

  async function fetchMails(pageNum?: number, append = false) {
    loading.value = true
    try {
      const p = pageNum ?? page.value
      let url = `${API}/mails?page=${p}&limit=${limit.value}`
      if (mailbox.value) url += `&mailbox=${mailbox.value}`
      const res = await fetch(url)
      const data = await res.json()
      if (append) {
        items.value.push(...data.items)
      } else {
        items.value = data.items
      }
      total.value = data.total
      page.value = data.page
    } finally {
      loading.value = false
    }
  }

  function setMailbox(mb: string | null) {
    mailbox.value = mb
    page.value = 1
    items.value = []
    fetchMails()
  }

  async function loadMore() {
    if (loading.value) return
    if (items.value.length >= total.value) return
    page.value++
    await fetchMails(page.value, true)
  }

  async function fetchCounts() {
    try {
      const res = await fetch(`${API}/mails/counts`)
      if (res.ok) counts.value = await res.json()
    } catch { /* ignore */ }
  }

  return { items, total, page, limit, loading, mailbox, counts, totalPages, fetchMails, setMailbox, loadMore, fetchCounts }
})

export const useMailDetailStore = defineStore('mailDetail', () => {
  const mail = ref<MailDetail | null>(null)
  const loading = ref(false)

  async function fetchMail(id: number) {
    loading.value = true
    try {
      const res = await fetch(`${API}/mails/${id}`)
      if (!res.ok) throw new Error('Mail not found')
      mail.value = await res.json()
    } finally {
      loading.value = false
    }
  }

  /** Sync the mail list item's status after actions change. */
  function syncListStatus() {
    if (!mail.value) return
    const mailStore = useMailStore()
    const listItem = mailStore.items.find(item => item.id === mail.value!.id)
    if (!listItem) return
    const hasOpen = mail.value.actions.some(a => a.status === 'open')
    if (!mail.value.ai_summary) {
      listItem.status = 'new'
    } else if (hasOpen) {
      listItem.status = 'pending'
    } else {
      listItem.status = 'done'
    }
  }

  async function closeAction(actionId: number) {
    const res = await fetch(`${API}/actions/${actionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'closed' }),
    })
    if (res.ok && mail.value) {
      const updated = await res.json()
      const idx = mail.value.actions.findIndex((a) => a.id === actionId)
      if (idx !== -1) mail.value.actions[idx] = updated
      syncListStatus()
    }
  }

  async function reopenAction(actionId: number) {
    const res = await fetch(`${API}/actions/${actionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    })
    if (res.ok && mail.value) {
      const updated = await res.json()
      const idx = mail.value.actions.findIndex((a) => a.id === actionId)
      if (idx !== -1) mail.value.actions[idx] = updated
      syncListStatus()
    }
  }

  async function regenerateSummary(model?: string, hostKey?: string) {
    if (!mail.value) return
    const mailId = mail.value.id
    const res = await fetch(`${API}/ollama/summarize/${mailId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, hostKey }),
    })
    if (res.ok) {
      mail.value = await res.json()
      syncListStatus()
    } else {
      const err = await res.json()
      throw new Error(err.error || 'Summarization failed')
    }
  }

  return { mail, loading, fetchMail, closeAction, reopenAction, regenerateSummary }
})
