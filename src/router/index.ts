import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: () => import('../views/LandingView.vue'),
      meta: { title: 'Dari draft sampai sepakat' },
    },
    {
      path: '/login',
      component: () => import('../views/auth/LoginView.vue'),
      meta: { title: 'Masuk' },
    },
    {
      path: '/register',
      component: () => import('../views/auth/RegisterView.vue'),
      meta: { title: 'Buat akun' },
    },
    {
      path: '/forgot-password',
      component: () => import('../views/auth/ForgotPasswordView.vue'),
      meta: { title: 'Lupa kata sandi' },
    },
    {
      path: '/:pathMatch(.*)*',
      component: () => import('../views/NotFoundView.vue'),
      meta: { title: 'Halaman tidak ditemukan' },
    },
  ],
  scrollBehavior(to, _from, saved) {
    return saved || (to.hash ? { el: to.hash, top: 100 } : { top: 0 })
  },
})
router.afterEach((to) => {
  document.title = `${String(to.meta.title)} · Dokumen Kita`
})

export default router
