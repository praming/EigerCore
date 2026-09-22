<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from '../AppIcon.vue'

const props = defineProps<{ modelValue: string }>() // "HH:MM"
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const open = ref(false)
const triggerEl = ref<HTMLElement | null>(null)
const popStyle = ref<Record<string, string>>({})
function place() {
  const t = triggerEl.value
  if (!t) return
  const r = t.getBoundingClientRect()
  const w = 220
  let left = r.left
  if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8)
  popStyle.value = { top: r.bottom + 6 + 'px', left: left + 'px' }
}
function toggle() {
  open.value = !open.value
  if (open.value) place()
}

function parse(s: string): { h: number; m: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s || '').trim())
  if (m) return { h: Math.min(23, Math.max(0, +m[1])), m: Math.min(59, Math.max(0, +m[2])) }
  const now = new Date()
  return { h: now.getHours(), m: now.getMinutes() }
}
const parsed = parse(props.modelValue)
const hour = ref(parsed.h)
const minute = ref(parsed.m)

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

const hours = Array.from({ length: 24 }, (_, i) => i)
const minutes = Array.from({ length: 60 }, (_, i) => i)

const triggerLabel = computed(() => `${pad(hour.value)}:${pad(minute.value)}`)

const hourBody = ref<HTMLElement | null>(null)
const minuteBody = ref<HTMLElement | null>(null)
function scrollSelIntoView() {
  nextTick(() => {
    hourBody.value?.querySelector('.is-sel')?.scrollIntoView({ block: 'center' })
    minuteBody.value?.querySelector('.is-sel')?.scrollIntoView({ block: 'center' })
  })
}

function pick(h: number, m: number) {
  hour.value = h
  minute.value = m
  emit('update:modelValue', `${pad(h)}:${pad(m)}`)
  open.value = false
}

function onDocClick(e: MouseEvent) {
  const el = rootEl.value
  if (el && !el.contains(e.target as Node)) open.value = false
}
function onScroll() {
  if (open.value) open.value = false
}
const rootEl = ref<HTMLElement | null>(null)
watch(open, (v) => {
  if (v) {
    scrollSelIntoView()
    document.addEventListener('click', onDocClick)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
  } else {
    document.removeEventListener('click', onDocClick)
    window.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('resize', onScroll)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', onScroll)
})
</script>

<template>
  <div ref="rootEl" class="wb-time">
    <button
      ref="triggerEl"
      type="button"
      class="wb-time__trigger"
      :class="{ 'is-empty': !modelValue }"
      @click.stop="toggle"
    >
      <AppIcon name="clock" :size="16" />
      <span>{{ triggerLabel }}</span>
    </button>

    <Teleport to="body">
      <div v-if="open" class="wb-time__pop" :style="popStyle" @click.stop>
        <div class="wb-time__cols">
          <div class="wb-time__col">
            <div class="wb-time__col-head">时</div>
            <div ref="hourBody" class="wb-time__col-body">
              <button
                v-for="h in hours"
                :key="'h' + h"
                type="button"
                class="wb-time__cell"
                :class="{ 'is-sel': h === hour }"
                @click="pick(h, minute)"
              >{{ pad(h) }}</button>
            </div>
          </div>
          <div class="wb-time__col">
            <div class="wb-time__col-head">分</div>
            <div ref="minuteBody" class="wb-time__col-body">
              <button
                v-for="m in minutes"
                :key="'m' + m"
                type="button"
                class="wb-time__cell"
                :class="{ 'is-sel': m === minute }"
                @click="pick(hour, m)"
              >{{ pad(m) }}</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
