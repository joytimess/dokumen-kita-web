import axios, { type AxiosRequestConfig } from 'axios'
export const authMode = import.meta.env.VITE_AUTH_MODE === 'api' ? 'api' : 'prototype'
export function backendOrigin(): string {
  const value = import.meta.env.VITE_API_BASE_URL
  if (!value) throw new Error('Origin API belum dikonfigurasi.')

  const url = new URL(value)

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error('API harus berupa origin HTTP(S) tanpa path atau kredensial.')

  return url.origin
}
export function apiOrigin(): string {
  if (import.meta.env.DEV && import.meta.env.MODE === 'development' &&
    import.meta.env.VITE_DEV_API_PROXY === 'true') return ''
  return backendOrigin()
}
export const http = axios.create({
  withCredentials: true,
  withXSRFToken: true,
  timeout: 15000,
  headers: { Accept: 'application/json' },
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
})
let activeRequests = 0
let sessionIdle: (() => void) | undefined
let googleRedirectPending = false
const redirectCancellation = new axios.CanceledError('Google sign-in is starting.')
http.interceptors.request.use((config) => {
  if (googleRedirectPending) throw redirectCancellation
  activeRequests++
  return config
}, (error) => { throw error }, { synchronous: true })
function requestFinished() {
  if (--activeRequests === 0) {
    sessionIdle?.()
    sessionIdle = undefined
  }
}
http.interceptors.response.use((response) => {
  requestFinished()
  return response
}, (error) => {
  if (error !== redirectCancellation) requestFinished()
  return Promise.reject(error)
})
if (typeof window !== 'undefined') window.addEventListener('pageshow', (event) => {
  if (event.persisted) googleRedirectPending = false
})
export async function navigateAfterSessionRequests(navigate: () => void) {
  if (googleRedirectPending) return
  googleRedirectPending = true
  try {
    // Stateful API responses can all set the session cookie, even GET /me.
    if (activeRequests) await new Promise<void>((resolve) => { sessionIdle = resolve })
    navigate()
  } catch (error) {
    googleRedirectPending = false
    throw error
  }
}
export async function csrf() {
  await http.get(`${apiOrigin()}/sanctum/csrf-cookie`)
}
export async function mutation<T>(
  path: string,
  payload: unknown,
  method: 'post' | 'patch' | 'put' = 'post',
  config?: AxiosRequestConfig,
): Promise<T> {
  await csrf()
  try {
    return (await http[method]<T>(`${apiOrigin()}${path}`, payload, config)).data
  } catch (error) {
    if (!axios.isAxiosError(error) || error.response?.status !== 419) throw error
    await csrf()
    return (await http[method]<T>(`${apiOrigin()}${path}`, payload, config)).data
  }
}
