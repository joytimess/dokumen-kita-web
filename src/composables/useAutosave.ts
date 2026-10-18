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
  const currentSnapshot = ref(JSON.stringify(initial))
  const savedSnapshot = ref(currentSnapshot.value)
  const saving = ref(false)
  const error = ref('')
  const savedAt = ref<number | null>(null)
  const dirty = computed(() => currentSnapshot.value !== savedSnapshot.value)
  let timer: ReturnType<typeof setTimeout> | undefined
  let saveRequest: Promise<boolean> | undefined
  let disposed = false
  let halted = false
  let changeRevision = 0
  function change(value: T) {
    if (disposed || halted) return
    const next = JSON.stringify(value)
    if (next === currentSnapshot.value) return
    changeRevision++
    currentSnapshot.value = next
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
    if (saveRequest) return saveRequest
    if (!dirty.value) return Promise.resolve(true)
    saveRequest = savePendingChanges()
    return saveRequest
  }

  async function savePendingChanges(): Promise<boolean> {
    saving.value = true
    try {
      while (dirty.value && !disposed && !halted) {
        const snapshot = currentSnapshot.value
        const revisionAtSave = changeRevision
        const normalized = await save(JSON.parse(snapshot) as T)
        if (disposed) return false
        savedSnapshot.value = snapshot
        const latest = revisionAtSave === changeRevision
        if (normalized && latest) {
          currentSnapshot.value = JSON.stringify(normalized)
          savedSnapshot.value = currentSnapshot.value
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
      saveRequest = undefined
    }
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
