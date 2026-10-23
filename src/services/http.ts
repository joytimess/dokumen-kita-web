import axios, { type AxiosRequestConfig } from 'axios'
export const authMode = import.meta.env.VITE_AUTH_MODE === 'api' ? 'api' : 'prototype'
export function apiOrigin(): string {
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
export const http = axios.create({
  withCredentials: true,
  withXSRFToken: true,
  timeout: 15000,
  headers: { Accept: 'application/json' },
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
})
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
