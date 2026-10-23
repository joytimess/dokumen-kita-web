import { shallowRef } from 'vue'

type Notice = { id: number; message: string; kind: 'info' | 'success' | 'error'; description?: string; action?: () => void; icon?: 'notifications' }
type Confirmation = {
  title: string
  message: string
  action: string
  danger: boolean
  resolve: (accepted: boolean) => void
}

export const notice = shallowRef<Notice | null>(null)
export const confirmation = shallowRef<Confirmation | null>(null)
let noticeTimer: ReturnType<typeof setTimeout> | undefined
let noticeId = 0

function showNotice(message: string, kind: Notice['kind'], details: Pick<Notice, 'description' | 'action' | 'icon'> = {}) {
  if (!message.trim() || (notice.value?.message === message && (notice.value?.kind === kind || kind === 'info'))) return
  notice.value = { id: ++noticeId, message, kind, ...details }
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = null }, kind === 'error' ? 7000 : 5000)
  return notice.value.id
}

export const notify = {
  info: (message: string) => showNotice(message, 'info'),
  success: (message: string) => showNotice(message, 'success'),
  error: (message: string) => showNotice(message, 'error'),
  notification: (message: string, description: string, action: () => void) =>
    showNotice(message, 'info', { description, action, icon: 'notifications' }),
  dismiss: (id?: number) => {
    if (id !== undefined && notice.value?.id !== id) return
    clearTimeout(noticeTimer)
    notice.value = null
  },
}

export function confirmAction(
  message: string,
  options: { title?: string; action?: string; danger?: boolean } = {},
): Promise<boolean> {
  if (confirmation.value) return Promise.resolve(false)
  return new Promise((resolve) => {
    confirmation.value = {
      title: options.title ?? 'Konfirmasi tindakan',
      message,
      action: options.action ?? 'Lanjutkan',
      danger: options.danger ?? false,
      resolve,
    }
  })
}

export function finishConfirmation(accepted: boolean) {
  const request = confirmation.value
  confirmation.value = null
  request?.resolve(accepted)
}
