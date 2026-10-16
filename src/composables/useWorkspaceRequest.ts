import { onUnmounted, ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { workspaceError } from '../services/workspace.errors'
import { notify } from '../services/feedback'
export function useWorkspaceRequest() {
  const auth = useAuthStore()
  const error = ref('')
  const fields = ref<Record<string, string>>({})
  const busy = ref(false)
  let blockedUntil = 0
  let active = true
  onUnmounted(() => {
    active = false
  })
  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    if (busy.value || Date.now() < blockedUntil) return
    const identity = auth.user?.guid
    busy.value = true
    error.value = ''
    fields.value = {}
    try {
      const result = await action()
      return active && auth.user?.guid === identity ? result : undefined
    } catch (cause) {
      if (active && auth.user?.guid === identity) {
        const feedback = workspaceError(cause)
        error.value = feedback.message
        if (feedback.retryAt) {
          blockedUntil = feedback.retryAt
          error.value += ` Coba lagi dalam ${Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000))} detik.`
        }
        notify.error(error.value)
        fields.value = feedback.fields
        if (feedback.status === 401) auth.user = null
      }
    } finally {
      if (active) busy.value = false
    }
  }
  return { busy, error, fields, run }
}
