export function internalDestination(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\s]/.test(value) ||
    [...value].some((character) => character.charCodeAt(0) < 32)
  )
    return '/'
  const url = new URL(value, 'https://frontend.invalid')
  if (url.origin !== 'https://frontend.invalid' || ['/login', '/register'].includes(url.pathname))
    return '/'
  return `${url.pathname}${url.search}${url.hash}`
}
export function workspaceDestination(destination: unknown): string {
  const safe = internalDestination(destination)
  return safe === '/' || safe.split('?')[0] === '/email/verify' ? '/dashboard' : safe
}
export function afterAuthentication(verified: boolean, destination: unknown): string {
  const target = workspaceDestination(destination)
  return verified
    ? target
    : target === '/dashboard'
      ? '/email/verify'
      : `/email/verify?redirect=${encodeURIComponent(target)}`
}
