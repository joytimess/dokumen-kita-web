<script setup lang="ts" generic="T extends string | number">
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'

type SelectOption<T> = { label: string; value: T }

const props = defineProps<{
  modelValue: T
  options: SelectOption<T>[]
  ariaLabel: string
  disabled?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: T]
  change: [value: T]
}>()

const root = ref<HTMLDivElement | null>(null)
const details = ref<HTMLDetailsElement | null>(null)
const trigger = ref<HTMLElement | null>(null)
const open = ref(false)
const activeIndex = ref(-1)
const listboxId = `select-${useId()}`
const selectedIndex = computed(() => props.options.findIndex((option) => option.value === props.modelValue))
const selectedLabel = computed(() => props.options[selectedIndex.value]?.label ?? '')

function optionId(index: number) {
  return `${listboxId}-option-${index}`
}

function show() {
  if (props.disabled) return
  open.value = true
  if (details.value) details.value.open = true
  activeIndex.value = selectedIndex.value < 0 ? 0 : selectedIndex.value
}

function close() {
  open.value = false
  activeIndex.value = selectedIndex.value
}

function finishClose() {
  if (!open.value && details.value) details.value.open = false
}

function toggle(event: MouseEvent) {
  event.preventDefault()
  if (props.disabled) return
  if (open.value) close()
  else show()
}

function moveActive(direction: number) {
  if (!props.options.length) return
  const index = activeIndex.value < 0 ? 0 : activeIndex.value
  activeIndex.value = (index + direction + props.options.length) % props.options.length
}

function choose(value: T) {
  if (value !== props.modelValue) {
    emit('update:modelValue', value)
    emit('change', value)
  }
  close()
  trigger.value?.focus()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!open.value) show()
    else moveActive(event.key === 'ArrowDown' ? 1 : -1)
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    if (!open.value) show()
    activeIndex.value = event.key === 'Home' ? 0 : props.options.length - 1
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (!open.value) show()
    else {
      const option = props.options[activeIndex.value]
      if (option) choose(option.value)
    }
  } else if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    close()
  } else if (event.key === 'Tab') close()
}

function onOutsidePointerdown(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) close()
}

onMounted(() => document.addEventListener('pointerdown', onOutsidePointerdown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutsidePointerdown))
</script>

<template>
  <div ref="root" class="select-control">
    <details ref="details">
      <summary
        ref="trigger"
        role="combobox"
        class="select-control-trigger"
        :aria-label="ariaLabel"
        aria-haspopup="listbox"
        :aria-expanded="open"
        :aria-controls="open ? listboxId : undefined"
        :aria-activedescendant="open && activeIndex >= 0 ? optionId(activeIndex) : undefined"
        :aria-disabled="disabled || undefined"
        @click="toggle"
        @keydown="onKeydown"
      >
        <span class="select-control-value">{{ selectedLabel }}</span>
        <span class="select-control-chevron material-symbols-outlined" aria-hidden="true">expand_more</span>
      </summary>
      <Transition name="select-dropdown" @after-leave="finishClose">
        <ul v-if="open" :id="listboxId" class="select-control-options" role="listbox" :aria-label="ariaLabel">
          <li
            v-for="(option, index) in options"
            :id="optionId(index)"
            :key="`${typeof option.value}:${option.value}`"
            role="option"
            :aria-selected="option.value === modelValue"
            :class="{
              'select-control-option-active': activeIndex === index,
              'select-control-option-selected': option.value === modelValue,
            }"
            @pointermove="activeIndex = index"
            @click.stop="choose(option.value)"
          >
            {{ option.label }}
          </li>
        </ul>
      </Transition>
    </details>
  </div>
</template>
