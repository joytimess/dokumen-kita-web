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
      path: '/email/verify',
      component: () => import('../views/auth/EmailVerificationView.vue'),
      meta: { title: 'Verifikasi email' },
    },
    {
      path: '/email/verified',
      component: () => import('../views/auth/EmailVerificationView.vue'),
      props: { result: true },
      meta: { title: 'Status verifikasi email' },
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
  scrollBehavior(to, from, saved) {
    // Router scroll runs after the new DOM mounts. Reset between pages while it is
    // still transparent; reserve smooth scrolling for anchors within the same page.
    const behavior =
      to.path !== from.path || window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth'
    return saved
      ? { ...saved, behavior }
      : to.hash
        ? { el: to.hash, top: 100, behavior }
        : { top: 0, behavior }
  },
})
router.afterEach((to) => {
  document.title = `${String(to.meta.title)} · Dokumen Kita`
})

export default router
