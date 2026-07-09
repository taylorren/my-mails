<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMailDetailStore } from '@/stores/mails'
import { User } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const store = useMailDetailStore()

const mailId = computed(() => Number(route.params.id))

onMounted(() => {
  store.fetchMail(mailId.value)
})

function goBack() {
  router.push({ name: 'mail-list' })
}

function formatDate(d: string | null): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toList(addrs: string | null): { name: string; email: string }[] {
  if (!addrs) return []
  try {
    return JSON.parse(addrs)
  } catch {
    return []
  }
}
</script>

<template>
  <div class="max-w-4xl mx-auto p-6">
    <!-- Back button -->
    <button
      class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition"
      @click="goBack"
    >
      ← Back to list
    </button>

    <div v-if="store.loading" class="text-muted-foreground py-12 text-center">
      Loading...
    </div>

    <template v-else-if="store.mail">
      <!-- Mail header -->
      <div class="mb-6 p-4 rounded-lg bg-card border">
        <h1 class="text-xl font-bold mb-3">{{ store.mail.subject || '(no subject)' }}</h1>
        <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <span class="text-muted-foreground">From:</span>
          <span>{{ store.mail.from_name }} &lt;{{ store.mail.from_email }}&gt;</span>

          <span class="text-muted-foreground">To:</span>
          <span>{{ toList(store.mail.to_json).map(a => a.name || a.email).join(', ') || '-' }}</span>

          <span class="text-muted-foreground">Date:</span>
          <span>{{ formatDate(store.mail.date) }}</span>

          <span class="text-muted-foreground">Mailbox:</span>
          <span class="text-xs px-1.5 py-0.5 rounded bg-muted inline-block w-fit">{{ store.mail.mailbox }}</span>
        </div>
      </div>

      <!-- Mail body -->
      <div class="mb-8 p-4 rounded-lg bg-card border prose prose-sm max-w-none" v-html="store.mail.body_html || store.mail.body_text?.replace(/\n/g, '<br>') || '<em>No content</em>'">
      </div>

      <!-- Actions section -->
      <div class="border-t pt-6">
        <h2 class="text-lg font-semibold mb-4">Follow-up Actions</h2>

        <div v-if="store.mail.actions.length === 0" class="text-muted-foreground text-sm">
          No actions tracked yet.
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="action in store.mail.actions"
            :key="action.id"
            class="flex items-start gap-3 p-3 rounded-lg border"
            :class="action.status === 'closed' ? 'opacity-60 bg-muted/50' : 'bg-card'"
          >
            <div class="flex-1">
              <div class="text-sm font-medium">{{ action.summary }}</div>
              <div class="text-xs text-muted-foreground mt-1 flex gap-3">
                <span v-if="action.action_by"><User class="w-3 h-3 inline" /> {{ action.action_by }}</span>
                <span>{{ formatDate(action.created_at) }}</span>
                <span
                  class="px-1.5 py-0.5 rounded text-xs font-medium"
                  :class="action.status === 'open'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-200 text-gray-600'"
                >
                  {{ action.status }}
                </span>
              </div>
            </div>
            <button
              v-if="action.status === 'open'"
              class="shrink-0 px-3 py-1 text-xs rounded border hover:bg-muted transition"
              @click="store.closeAction(action.id)"
            >
              Close
            </button>
            <button
              v-else
              class="shrink-0 px-3 py-1 text-xs rounded border hover:bg-muted transition"
              @click="store.reopenAction(action.id)"
            >
              Re-open
            </button>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="text-destructive py-12 text-center">
      Mail not found.
    </div>
  </div>
</template>
