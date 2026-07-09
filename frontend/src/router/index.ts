import { createRouter, createWebHistory } from 'vue-router'
import MailList from '@/views/MailList.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'mail-list',
      component: MailList,
    },
    {
      path: '/mail/:id',
      name: 'mail-detail',
      component: MailList,
    },
  ],
})

export default router
