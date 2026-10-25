import { watch } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useNotificationsStore } from '../stores/notifications'
import { clearGoogleLoginSummary, consumeGoogleLoginSummary } from '../utils/googleLoginSummary'
import { authMode } from '../services/http'
import { rememberInvitation, pendingInvitation, clearInvitation } from '../utils/invitation'
import { afterAuthentication } from '../utils/authRedirect'
import { language, setWorkspaceActive, t } from '../services/workspace-language'

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
          path: '/categories',
          component: () => import('../views/workspace/CategoriesView.vue'),
          meta: { title: 'Kategori Dokumen' },
        },
        {
          path: '/history',
          component: () => import('../views/workspace/SigningHistoryView.vue'),
          meta: { title: 'Riwayat Tanda Tangan' },
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
          path: '/profile',
          component: () => import('../views/workspace/ProfileView.vue'),
          meta: { title: 'Profil' },
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
      path: '/email/changed',
      component: () => import('../views/auth/EmailChangedView.vue'),
      meta: { title: 'Perubahan email' },
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
  const oauthReturn = authMode === 'api' && to.query.login_summary !== undefined
    ? { path: to.path, query: { ...to.query, login_summary: undefined }, hash: to.hash, replace: true }
    : undefined
  if (oauthReturn) {
    const loginCompleted = consumeGoogleLoginSummary(to.query.login_summary)
    const auth = useAuthStore()
    await auth.refresh()
    if (loginCompleted && auth.user && !auth.sessionError) useNotificationsStore().queueLoginSummary()
  }
  if (to.path === '/login' && to.query.error) clearGoogleLoginSummary()
  const common = ['/login', '/register'].includes(to.path)
  const token = to.meta.invitation ? to.query.token : common ? to.query.invitation_token : undefined
  if (token !== undefined) {
    const valid = rememberInvitation(token)
    if (!valid) clearInvitation()
    if (common)
      return {
        path: to.path,
        query: {
          ...to.query,
          invitation_token: undefined,
          redirect: valid ? '/invitations/claim' : '/invitations/claim?error=invalid',
        },
        replace: true,
      }
    return { path: '/invitations/claim', query: valid ? {} : { error: 'invalid' }, replace: true }
  }
  if (authMode !== 'api') return
  if (!to.meta.workspace && !common) return oauthReturn
  const auth = useAuthStore()
  await auth.restore()
  if (auth.sessionError) return oauthReturn
  if (!auth.user && to.meta.workspace)
    return { path: '/login', query: { redirect: oauthReturn ? router.resolve(oauthReturn).fullPath : to.fullPath } }
  if (auth.user && to.meta.invitation && !auth.user.email_verified)
    return afterAuthentication(false, '/invitations/claim')
  if (auth.user && common)
    return afterAuthentication(
      auth.user.email_verified,
      pendingInvitation() ? '/invitations/claim' : to.query.redirect,
    )
  return oauthReturn
})
function updateTitle(to = router.currentRoute.value) {
  const inWorkspace = Boolean(to.meta.workspace)
  setWorkspaceActive(inWorkspace)
  document.title = `${t(String(to.meta.title ?? 'Dokumen Kita'))} · Dokumen Kita`
}
router.afterEach((to, _from, failure) => {
  updateTitle(to)
  if (failure || authMode !== 'api') return
  const notifications = useNotificationsStore()
  void notifications.showLoginSummary(() => {
    notifications.centerRequested = true
    if (!router.currentRoute.value.meta.workspace) void router.push('/dashboard')
  })
})
watch(language, () => updateTitle())

export default router
