const key = 'dokumen-kita.pending-invitation.v1'
let pending = ''
export function rememberInvitation(token: unknown) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false
  pending = token
  try {
    sessionStorage.setItem(key, token)
  } catch {
    /* Continue in memory. */
  }
  return true
}
export function pendingInvitation() {
  if (pending) return pending
  try {
    const value = sessionStorage.getItem(key)
    if (value && /^[a-f0-9]{64}$/.test(value)) pending = value
  } catch {
    /* Continue in memory. */
  }
  return pending
}
export function clearInvitation() {
  pending = ''
  try {
    sessionStorage.removeItem(key)
  } catch {
    /* Optional storage. */
  }
}
