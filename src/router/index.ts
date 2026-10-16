import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { authMode } from '../services/http'
import { rememberInvitation, pendingInvitation, clearInvitation } from '../utils/invitation'
import { afterAuthentication } from '../utils/authRedirect'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: () => import('../views/LandingView.vue'),
      meta: { title: 'Dari draft sampai sepakat' },
    },
    {
      path: '/',
      component: () => import('../layouts/WorkspaceLayout.vue'),
      meta: { workspace: true },
      children: [
        {
          path: '/dashboard',
          component: () => import('../views/workspace/DocumentsView.vue'),
          meta: { title: 'Ringkasan' },
        },
        {
          path: '/documents',
          component: () => import('../views/workspace/DocumentsView.vue'),
          meta: { title: 'Dokumen Saya' },
        },
        {
          path: '/documents/:documentGuid([0-9a-fA-F-]{36})',
          component: () => import('../views/workspace/DocumentDetailView.vue'),
          meta: { title: 'Detail dokumen' },
        },
        {
          path: '/documents/:documentGuid([0-9a-fA-F-]{36})/edit',
          component: () => import('../views/workspace/DocumentEditorView.vue'),
          meta: { title: 'Penyusunan draft' },
        },
        {
          path: '/documents/:documentGuid([0-9a-fA-F-]{36})/versions/:versionGuid/view',
          component: () => import('../views/workspace/DocumentViewerView.vue'),
          meta: { title: 'Baca dokumen' },
        },
        {
          path: '/signature-assets',
          component: () => import('../views/workspace/SignatureAssetsView.vue'),
          meta: { title: 'Tanda Tangan Saya' },
        },
        {
          path: '/invitations/claim',
          component: () => import('../views/workspace/InvitationClaimView.vue'),
          meta: { title: 'Undangan dokumen', invitation: true },
        },
      ],
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
router.beforeEach(async (to) => {
  if (to.meta.invitation && to.query.token) {
    const valid = rememberInvitation(to.query.token)
    if (!valid) clearInvitation()
    return { path: '/invitations/claim', query: valid ? {} : { error: 'invalid' }, replace: true }
  }
  if (authMode !== 'api') return
  const common = ['/login', '/register'].includes(to.path)
  if (!to.meta.workspace && !common) return
  const auth = useAuthStore()
  await auth.restore()
  if (auth.sessionError) return
  if (!auth.user && to.meta.workspace) return { path: '/login', query: { redirect: to.fullPath } }
  if (auth.user && to.meta.invitation && !auth.user.email_verified)
    return afterAuthentication(false, '/invitations/claim')
  if (auth.user && common)
    return afterAuthentication(
      auth.user.email_verified,
      pendingInvitation() ? '/invitations/claim' : to.query.redirect,
    )
})
router.afterEach((to) => {
  document.title = `${String(to.meta.title)} · Dokumen Kita`
})

export default router
