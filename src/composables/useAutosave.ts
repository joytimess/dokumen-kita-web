import { computed, ref } from 'vue'

// One queue belongs to one loaded version/account. Disposing never reuses it.
export function createAutosave<T>(
  initial: T,
  save: (snapshot: T) => Promise<T | void>,
  options: {
    delay?: number
    onSaved?: (value: T, latest: boolean) => void
    onError?: (error: unknown) => boolean | void
  } = {},
) {
  const current = ref(JSON.stringify(initial))
  const baseline = ref(current.value)
  const saving = ref(false)
  const error = ref('')
  const savedAt = ref<number | null>(null)
  const dirty = computed(() => current.value !== baseline.value)
  let timer: ReturnType<typeof setTimeout> | undefined
  let request: Promise<boolean> | undefined
  let disposed = false
  let halted = false
  let revision = 0
  function change(value: T) {
    if (disposed || halted) return
    const next = JSON.stringify(value)
    if (next === current.value) return
    revision++
    current.value = next
    error.value = ''
    clearTimeout(timer)
    if (dirty.value)
      timer = setTimeout(() => {
        void flush()
      }, options.delay ?? 1000)
  }
  function flush(): Promise<boolean> {
    clearTimeout(timer)
    if (disposed || halted) return Promise.resolve(!dirty.value)
    if (request) return request
    if (!dirty.value) return Promise.resolve(true)
    request = (async () => {
      saving.value = true
      try {
        while (dirty.value && !disposed && !halted) {
          const snapshot = current.value
          const sentRevision = revision
          const normalized = await save(JSON.parse(snapshot) as T)
          if (disposed) return false
          baseline.value = snapshot
          const latest = sentRevision === revision
          if (normalized && latest) {
            current.value = JSON.stringify(normalized)
            baseline.value = current.value
          }
          savedAt.value = Date.now()
          error.value = ''
          options.onSaved?.(normalized ?? (JSON.parse(snapshot) as T), latest)
        }
        return !dirty.value
      } catch (cause) {
        if (!disposed) {
          halted = options.onError?.(cause) === true
          error.value = 'Gagal menyimpan. Perubahan tetap ada di halaman ini.'
          clearTimeout(timer)
        }
        return false
      } finally {
        saving.value = false
        request = undefined
      }
    })()
    return request
  }
  return {
    dirty,
    saving,
    error,
    savedAt,
    change,
    flush,
    stop() {
      halted = true
      clearTimeout(timer)
    },
    dispose() {
      disposed = true
      halted = true
      clearTimeout(timer)
    },
  }
}
