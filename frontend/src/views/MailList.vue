<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useMailStore, useMailDetailStore } from '@/stores/mails'
import type { MailListItem } from '@/stores/mails'

const router = useRouter()
const route = useRoute()
const store = useMailStore()
const detail = useMailDetailStore()
const scanning = ref(false)
const models = ref<{ name: string; hostKey: string; hostLabel: string }[]>([])
const selectedHost = ref('lan')
const selectedModel = ref('')

const hostsList = computed(() => {
  const seen = new Map<string, { key: string; label: string }>()
  for (const m of models.value) {
    if (!seen.has(m.hostKey)) seen.set(m.hostKey, { key: m.hostKey, label: m.hostLabel })
  }
  return [...seen.values()]
})

const filteredModels = computed(() =>
  models.value.filter(m => m.hostKey === selectedHost.value)
)

function selectHost(key: string) {
  selectedHost.value = key
  const first = filteredModels.value[0]
  if (first) selectedModel.value = first.name
}
const regenerating = ref(false)
const splitRatio = ref(0.6) // top section ratio (summary/actions)
const dragging = ref(false)
const detailEl = ref<HTMLElement | null>(null)
const showBody = ref(false) // mail body collapsed by default
const listEl = ref<HTMLElement | null>(null)

function onListScroll() {
  if (!listEl.value) return
  const { scrollTop, scrollHeight, clientHeight } = listEl.value
  if (scrollHeight - scrollTop - clientHeight < 100) {
    store.loadMore()
  }
}

function scrollToTop() {
  listEl.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

function onDragStart(e: MouseEvent) {
  dragging.value = true
  e.preventDefault()
}

function onDragMove(e: MouseEvent) {
  if (!dragging.value || !detailEl.value) return
  const rect = detailEl.value.getBoundingClientRect()
  const y = e.clientY - rect.top
  const ratio = Math.min(0.7, Math.max(0.2, y / rect.height))
  splitRatio.value = ratio
}

function onDragEnd() {
  dragging.value = false
}

onMounted(async () => {
  store.fetchCounts()
  store.fetchMails()
  const mailId = route.params.id
  if (mailId) detail.fetchMail(Number(mailId))
  // Fetch available models
  try {
    const res = await fetch('/api/ollama/models')
    const data = await res.json()
    models.value = data.models
    if (data.models.length > 0) {
      const firstHost = hostsList.value[0]
      if (firstHost) {
        selectedHost.value = firstHost.key
        const firstModel = data.models.find((m: any) => m.hostKey === firstHost.key)
        if (firstModel) selectedModel.value = firstModel.name
      }
    }
  } catch { /* Ollama not available */ }
})

async function triggerScan() {
  scanning.value = true
  try {
    const res = await fetch('/api/scan', { method: 'POST' })
    const data = await res.json()
    store.fetchCounts()
    store.fetchMails()
    alert(`Scan done. ${data.total} new, ${data.totalSkipped} skipped.`)
  } catch (e) {
    alert('Scan failed: ' + e)
  } finally {
    scanning.value = false
  }
}

function selectMail(mail: MailListItem) {
  showBody.value = false
  detail.fetchMail(mail.id)
  router.replace({ name: 'mail-detail', params: { id: mail.id } })
}

function formatDate(d: string | null): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function relativeDays(d: string | null): string {
  if (!d) return ''
  const now = Date.now()
  const then = new Date(d).getTime()
  const days = Math.floor((now - then) / (1000 * 60 * 60 * 24))
  if (days < 1) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days}天前`
  if (days < 30) return `${Math.floor(days / 7)}周前`
  if (days < 365) return `${Math.floor(days / 30)}月前`
  return `${Math.floor(days / 365)}年前`
}

function isStale(mail: { is_stale: number }): boolean {
  return mail.is_stale === 1
}

function statusMark(status: string): string {
  if (status === 'new') return 'O'
  if (status === 'pending') return '?'
  return '✓'
}

function statusTitle(status: string): string {
  if (status === 'new') return '待 AI 处理'
  if (status === 'pending') return '有未关闭的跟进事项'
  return '已完成'
}

function statusColor(status: string): string {
  if (status === 'new') return 'bg-gray-400'
  if (status === 'pending') return 'bg-amber-500'
  return 'bg-emerald-500'
}

function toList(addrs: string | null): { name: string; email: string }[] {
  if (!addrs) return []
  try { return JSON.parse(addrs) } catch { return [] }
}

function mailBodyHtml(): string {
  const mail = detail.mail
  if (!mail) return ''
  if (mail.body_html) return mail.body_html
  if (mail.body_text) return mail.body_text.replace(/\n/g, '<br>')
  return '<em class="text-muted-foreground">无内容</em>'
}

async function regenerate() {
  regenerating.value = true
  try {
    const model = models.value.find(m => m.name === selectedModel.value)
    await detail.regenerateSummary(selectedModel.value || undefined, model?.hostKey)
  } catch (e) {
    alert('生成失败: ' + e)
  } finally {
    regenerating.value = false
  }
}

const folders = [
  { key: 'INBOX', label: '收件箱', icon: '📥', count: () => store.counts.inbox },
  { key: 'Sent', label: '已发送', icon: '📤', count: () => store.counts.sent },
]
</script>

<template>
  <div class="flex h-screen">
    <!-- Col 1: Folders -->
    <aside class="w-52 shrink-0 border-r bg-card flex flex-col">
      <div class="p-4 border-b">
        <h1 class="text-lg font-bold tracking-tight">📬 Mails</h1>
      </div>
      <nav class="flex-1 p-3 space-y-1">
        <button
          v-for="f in folders" :key="f.key"
          class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition text-left"
          :class="store.mailbox === f.key ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-foreground'"
          @click="store.setMailbox(f.key)"
        >
          <span>{{ f.icon }}</span><span class="flex-1">{{ f.label }}</span>
          <span class="text-xs text-muted-foreground tabular-nums">{{ f.count() }}</span>
        </button>
      </nav>
      <div class="p-3 border-t">
        <button
          class="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
          :disabled="scanning" @click="triggerScan"
        >{{ scanning ? '扫描中...' : '🔄 扫描邮件' }}</button>
      </div>
    </aside>

    <!-- Col 2: Mail list -->
    <section class="w-80 shrink-0 border-r flex flex-col bg-card/50">
      <div class="px-4 py-3 border-b">
        <h2 class="text-sm font-medium text-muted-foreground">
          {{ folders.find(f => f.key === store.mailbox)?.label }}
          <span class="ml-1 text-xs">({{ store.total }})</span>
        </h2>
      </div>
      <div
        class="flex-1 overflow-auto"
        @scroll="onListScroll"
        ref="listEl"
      >
        <div v-if="store.loading && store.items.length === 0" class="text-muted-foreground py-12 text-center text-sm">加载中...</div>
        <div v-else-if="store.items.length === 0" class="text-muted-foreground py-12 text-center text-sm">暂无邮件</div>
        <div v-else class="divide-y">
          <div
            v-for="mail in store.items" :key="mail.id"
            class="flex items-stretch hover:bg-muted cursor-pointer transition"
            :class="[
              detail.mail?.id === mail.id ? 'bg-primary/5 border-l-2 border-l-primary' : '',
              isStale(mail) ? 'bg-amber-50/80' : ''
            ]"
            @click="selectMail(mail)"
          >
            <div class="flex-1 min-w-0 px-4 py-3">
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-medium truncate">{{ mail.from_name || mail.from_email || '未知' }}</span>
            </div>
            <div class="text-xs truncate mt-0.5">{{ mail.subject || '(无主题)' }}</div>
            <div class="text-[10px] text-muted-foreground mt-1 flex items-center gap-1.5">
              <span>{{ formatDate(mail.date) }}</span>
              <span
                v-if="isStale(mail)"
                class="text-amber-600 font-medium"
              >逾期 · 待处理</span>
              <span v-else class="text-muted-foreground/60">{{ relativeDays(mail.date) }}</span>
            </div>
            </div>
            <div
              class="shrink-0 w-7 text-white flex items-center justify-center"
              :class="statusColor(mail.status)"
              :title="statusTitle(mail.status)"
            >
              <span class="text-xs font-bold">{{ statusMark(mail.status) }}</span>
            </div>
          </div>
        </div>
        <div v-if="store.loading && store.items.length > 0" class="text-center py-3 text-xs text-muted-foreground">加载更多...</div>
        <button
          v-if="store.items.length > 10"
          class="sticky bottom-0 mx-auto mb-1 block text-[10px] px-3 py-1 rounded-full bg-white border shadow-sm hover:bg-muted transition"
          @click="scrollToTop"
        >↑ 回到顶部</button>
      </div>
    </section>

    <!-- Col 3: Mail detail -->
    <main
      ref="detailEl"
      class="flex-1 flex flex-col min-w-0"
      :class="{ 'select-none': dragging }"
      @mousemove="onDragMove"
      @mouseup="onDragEnd"
      @mouseleave="onDragEnd"
    >
      <div v-if="detail.loading" class="flex-1 flex items-center justify-center text-muted-foreground text-sm">加载中...</div>

      <template v-else-if="detail.mail">
        <!-- Top: summary + actions -->
        <div class="overflow-auto bg-gradient-to-br from-slate-50 via-indigo-50/30 to-sky-50/40" :style="{ height: `${splitRatio * 100}%` }">
          <!-- Toolbar -->
          <div class="px-4 pt-3 pb-2 flex items-center justify-between gap-2">
            <button
              class="text-[11px] px-2.5 py-1 rounded-lg border bg-white hover:bg-muted transition shadow-sm"
              @click="showBody = !showBody"
            >{{ showBody ? '📩 收起邮件' : '📩 展开邮件' }}</button>
            <div class="flex items-center gap-1" v-if="models.length > 0">
              <select v-model="selectedHost"
                class="text-[11px] border rounded-lg px-2 py-1 bg-white shadow-sm"
                @change="selectHost(($event.target as HTMLSelectElement).value)">
                <option v-for="h in hostsList" :key="h.key" :value="h.key">{{ h.label }}</option>
              </select>
              <select v-model="selectedModel"
                class="text-[11px] border rounded-lg px-2 py-1 bg-white shadow-sm max-w-[150px]">
                <option v-for="m in filteredModels" :key="m.name" :value="m.name">{{ m.name }}</option>
              </select>
              <button
                class="text-[11px] px-3 py-1 rounded-lg font-medium bg-indigo-500 text-white hover:bg-indigo-600 transition disabled:opacity-50 shadow-sm"
                :disabled="regenerating" @click="regenerate"
              >{{ regenerating ? '...' : '✨ 重新生成' }}</button>
            </div>
          </div>

          <!-- AI Summary -->
          <div class="px-4 pb-4">
            <h3 class="text-[11px] font-semibold text-indigo-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span class="w-5 h-5 rounded-md bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">🤖</span>
              AI 摘要
            </h3>
            <div v-if="regenerating" class="flex items-center gap-2 text-xs text-indigo-500 italic py-6 bg-white/60 rounded-xl border border-dashed border-indigo-200 justify-center">
              <span class="inline-block w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></span>
              AI 正在分析邮件...
            </div>
            <div v-else-if="detail.mail.ai_summary"
              class="relative bg-white rounded-xl border border-indigo-100 p-4 text-sm leading-relaxed shadow-sm">
              <div class="absolute -top-2 left-4 text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 font-medium">摘要</div>
              {{ detail.mail.ai_summary }}
            </div>
            <div v-else class="text-xs text-muted-foreground italic py-6 bg-white/60 rounded-xl border border-dashed border-gray-200 text-center">
              尚未生成摘要。
              <button v-if="models.length > 0" class="underline text-indigo-500 hover:text-indigo-700 font-medium" @click="regenerate">点击生成</button>
            </div>
          </div>

          <!-- Actions -->
          <div class="px-4 pb-4">
            <h3 class="text-[11px] font-semibold text-amber-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span class="w-5 h-5 rounded-md bg-amber-100 text-amber-600 flex items-center justify-center text-xs">📋</span>
              跟进事项
              <span v-if="detail.mail.actions.length > 0" class="text-[10px] font-normal text-muted-foreground ml-auto">{{ detail.mail.actions.filter(a => a.status === 'open').length }} 进行中</span>
            </h3>
            <div v-if="detail.mail.actions.length === 0" class="text-xs text-muted-foreground italic py-6 bg-white/60 rounded-xl border border-dashed border-gray-200 text-center">暂无跟进事项</div>
            <div v-else class="space-y-2">
              <div v-for="(action, idx) in detail.mail.actions" :key="action.id"
                class="group flex items-start gap-3 p-3 rounded-xl bg-white shadow-sm border transition-all hover:shadow-md"
                :class="action.status === 'open' ? 'border-emerald-200' : 'border-gray-200 opacity-60'">
                <span class="text-xs text-muted-foreground mt-0.5 font-mono tabular-nums">{{ idx + 1 }}</span>
                <div class="flex-1 min-w-0">
                  <div class="text-sm leading-snug" :class="action.status === 'closed' ? 'line-through text-muted-foreground' : ''">{{ action.summary }}</div>
                  <div class="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-2">
                    <span v-if="action.action_by" class="inline-flex items-center gap-1">👤 {{ action.action_by }}</span>
                    <span>{{ formatDate(action.created_at) }}</span>
                  </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <span class="text-[10px] px-2 py-0.5 rounded-full font-medium"
                    :class="action.status === 'open' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'">
                    {{ action.status === 'open' ? '进行中' : '已关闭' }}
                  </span>
                  <button v-if="action.status === 'open'"
                    class="opacity-0 group-hover:opacity-100 text-[10px] px-2 py-1 rounded-lg font-medium bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 transition-all"
                    @click="detail.closeAction(action.id)">✓ 关闭</button>
                  <button v-else
                    class="opacity-0 group-hover:opacity-100 text-[10px] px-2 py-1 rounded-lg font-medium bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 transition-all"
                    @click="detail.reopenAction(action.id)">↻ 重开</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Draggable splitter -->
        <div
          class="h-2 shrink-0 cursor-row-resize flex items-center justify-center group bg-muted/30 hover:bg-indigo-100 transition-colors"
          :class="{ 'bg-indigo-100': dragging }"
          @mousedown="onDragStart"
        >
          <div class="w-8 h-1 rounded-full bg-muted-foreground/30 group-hover:bg-indigo-400 transition-colors"
            :class="{ 'bg-indigo-400': dragging }"></div>
        </div>

        <!-- Bottom: mail (collapsed by default) -->
        <div v-if="showBody" class="overflow-auto border-t bg-white" :style="{ height: `${(1 - splitRatio) * 100}%` }">
          <div class="p-4">
            <h2 class="text-sm font-bold mb-2">{{ detail.mail.subject || '(无主题)' }}</h2>
            <div class="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mb-3">
              <span>{{ detail.mail.from_name }} &lt;{{ detail.mail.from_email }}&gt;</span>
              <span>→ {{ toList(detail.mail.to_json).map(a => a.name || a.email).join(', ') || '-' }}</span>
              <span>{{ formatDate(detail.mail.date) }}</span>
            </div>
            <div class="prose prose-sm max-w-none text-sm" v-html="mailBodyHtml()"></div>
          </div>
        </div>
      </template>

      <div v-else class="flex-1 flex items-center justify-center text-muted-foreground text-sm">选择一封邮件查看详情</div>
    </main>
  </div>
</template>
