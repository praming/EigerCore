<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import AppIcon from './AppIcon.vue'
import { searchLogo } from '@/assets/search'

interface Engine {
  id: string
  name: string
  /** 搜索结果页 URL 前缀（查询词 UTF-8 编码拼在后面即可跳转） */
  url: string
  hint: string
}

// 默认搜索引擎集合（可在此增删）。结果页采用各引擎标准搜索 URL。
const ENGINES: Engine[] = [
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=', hint: 'baidu.com' },
  { id: 'bing', name: '必应', url: 'https://www.bing.com/search?q=', hint: 'bing.com' },
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=', hint: 'google.com' },
  { id: 'sogou', name: '搜狗', url: 'https://www.sogou.com/web?query=', hint: 'sogou.com' },
  { id: 'so', name: '360', url: 'https://www.so.com/s?q=', hint: 'so.com' },
  { id: 'ddg', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=', hint: 'duckduckgo.com' },
]

const STORE_KEY = 'wb_search_engine'
const q = ref('')
const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)

const engineId = ref<string>(localStorage.getItem(STORE_KEY) || 'baidu')
const engine = computed<Engine>(
  () => ENGINES.find((e) => e.id === engineId.value) || ENGINES[0],
)

function selectEngine(e: Engine) {
  engineId.value = e.id
  localStorage.setItem(STORE_KEY, e.id)
  open.value = false
  inputEl.value?.focus()
}

function go() {
  const term = q.value.trim()
  if (!term) {
    inputEl.value?.focus()
    return
  }
  const target = engine.value.url + encodeURIComponent(term)
  // 新标签打开对应搜索引擎结果页（用户手势触发，不会被拦截）
  window.open(target, '_blank', 'noopener,noreferrer')
}

function onDocClick(e: MouseEvent) {
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) open.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div ref="rootEl" class="top-search" @keydown="onKey">
    <div class="top-search__engine">
      <button
        type="button"
        class="top-search__trigger"
        :aria-expanded="open"
        title="切换搜索引擎"
        @click="open = !open"
      >
        <img v-if="searchLogo(engine.id)" :src="searchLogo(engine.id)" :alt="engine.name" class="top-search__logo" />
        <span v-else class="top-search__engine-name">{{ engine.name }}</span>
        <AppIcon name="chevron-down" :size="14" />
      </button>
      <div v-if="open" class="top-search__menu" role="listbox">
        <button
          v-for="e in ENGINES"
          :key="e.id"
          type="button"
          class="top-search__item"
          :class="{ 'is-active': e.id === engineId }"
          role="option"
          :aria-selected="e.id === engineId"
          @click="selectEngine(e)"
        >
          <img v-if="searchLogo(e.id)" :src="searchLogo(e.id)" :alt="e.name" class="top-search__logo" />
          <span class="top-search__item-name">{{ e.name }}</span>
          <span class="top-search__item-hint">{{ e.hint }}</span>
        </button>
      </div>
    </div>

    <input
      ref="inputEl"
      v-model="q"
      class="top-search__input"
      type="search"
      :placeholder="'用 ' + engine.name + ' 搜索…'"
      aria-label="网络搜索"
      autocomplete="off"
      @keyup.enter="go"
    />

    <button type="button" class="top-search__go" :aria-label="'搜索'" title="搜索" @click="go">
      <AppIcon name="search" :size="16" />
    </button>
  </div>
</template>
