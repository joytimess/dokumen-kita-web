import { computed, ref } from 'vue'
export function createReadGate() {
  const pages = ref(0),
    visited = ref(new Set<number>()),
    ended = ref(false),
    failed = ref(false)
  const eligible = computed(
    () => pages.value > 0 && !failed.value && visited.value.size === pages.value && ended.value,
  )
  return {
    eligible,
    visited,
    reset(count = 0) {
      pages.value = count
      visited.value = new Set()
      ended.value = false
      failed.value = false
    },
    visit(page: number) {
      if (page >= 1 && page <= pages.value) visited.value = new Set([...visited.value, page])
    },
    end(page: number) {
      if (page === pages.value && visited.value.size === pages.value && !failed.value)
        ended.value = true
    },
    error() {
      failed.value = true
      visited.value = new Set()
      ended.value = false
    },
    recovered() {
      failed.value = false
    },
  }
}
