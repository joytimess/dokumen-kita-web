import { workspaceDestination } from './authRedirect'

const key = 'dokumen-kita.google-login-summary.v1'

export function googleLoginDestination(destination: unknown) {
  const target = workspaceDestination(destination)
  try {
    const marker = crypto.randomUUID()
    const url = new URL(target, window.location.origin)
    url.searchParams.set('login_summary', marker)
    sessionStorage.setItem(key, marker)
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return target
  }
}

export function consumeGoogleLoginSummary(marker: unknown) {
  try {
    const pending = sessionStorage.getItem(key)
    sessionStorage.removeItem(key)
    return typeof marker === 'string' && !!pending && marker === pending
  } catch {
    return false
  }
}

export function clearGoogleLoginSummary() {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // Login still works when browser storage is unavailable.
  }
}
