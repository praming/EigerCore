<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import WbSelect from '../WbSelect.vue'
import WbSwitch from '../WbSwitch.vue'
import AppModal from '../AppModal.vue'
import { useWorkbenchStore, TRANSLATE_DIRS, TRANSLATE_MODELS, type TranslateModel, type TranslateLang } from '@/stores/workbench'
import { apiPost } from '@/api/request'

const wb = useWorkbenchStore()
const props = defineProps<{ iid: string }>()
const tcfg = computed(() => (wb.instConfig(props.iid) || {}).translate || {})

// 输入框 / 结果：绑定 store 的草稿与上次译文（关闭弹窗后保留，仅清空按钮可清）
const text = computed<string>({
  get: () => wb.translateDraft,
  set: (v: string) => { wb.translateDraft = v },
})
const result = computed<string>({
  get: () => wb.translateLast,
  set: (v: string | undefined) => { wb.translateLast = v ?? '' },
})

// 瞬时 UI 状态（无需跨弹窗保留）
const error = ref('')
const loading = ref(false)
const copied = ref(false)

// 方向：从 store 的 from/to 推导，切换时写回两者
const dir = computed<string>({
  get() {
    const { from, to } = tcfg.value
    const hit = TRANSLATE_DIRS.find((d) => d.from === from && d.to === to)
    return hit ? hit.value : 'zh-en'
  },
  set(v: string) {
    const d = TRANSLATE_DIRS.find((x) => x.value === v)
    if (d) wb.patchInst(props.iid, { translate: { ...tcfg.value,  from: d.from, to: d.to  } })
  },
})

// 设置面板（弹窗右上角齿轮控制）：API Key + 模型 + 翻译记忆开关
const apiKey = computed({
  get: () => tcfg.value.apiKey || '',
  set: (v: string) => wb.patchInst(props.iid, { translate: { ...tcfg.value,  apiKey: v.trim()  } }),
})
const model = computed<string>({
  get: () => tcfg.value.model,
  set: (v: string) => wb.patchInst(props.iid, { translate: { ...tcfg.value,  model: v as TranslateModel  } }),
})
const modelOpts = TRANSLATE_MODELS.map((m) => ({ value: m.value, label: m.label }))
const tmEnabled = computed<boolean>({
  get: () => tcfg.value.tm !== false,
  set: (v: boolean) => wb.patchInst(props.iid, { translate: { ...tcfg.value,  tm: v  } }),
})

const LANG_NAMES: Record<string, string> = {
  auto: '自动检测', zh: '中文', en: '英文', ja: '日文', ko: '韩文',
  de: '德文', fr: '法文', es: '西班牙文', ru: '俄文',
}
function langName(l: string): string {
  return LANG_NAMES[l] || l
}

interface TranslateResp {
  ok: boolean
  text?: string
  error?: string
  model?: string
}

// 翻译记忆命中：与当前输入完全一致的历史译文（且不同于当前结果）
const recalled = computed(() => {
  if (!tmEnabled.value || loading.value) return null
  const src = text.value.trim()
  if (!src) return null
  const hit = wb.tmFind(src)
  if (!hit || hit.dst === result.value) return null
  return hit
})

async function doTranslate() {
  const src = text.value.trim()
  if (!src) {
    error.value = '请输入要翻译的内容'
    return
  }
  loading.value = true
  error.value = ''
  result.value = ''
  try {
    const cfg = tcfg.value
    const res = await apiPost<TranslateResp>('/api/translate', {
      text: src,
      from: cfg.from,
      to: cfg.to,
      model: cfg.model,
      apiKey: cfg.apiKey,
    })
    if (res && res.ok && res.text != null) {
      result.value = res.text
      if (cfg.tm !== false) wb.tmAdd(src, cfg.from, cfg.to, res.text)
    } else {
      error.value = (res && res.error) || '翻译失败，请稍后重试'
    }
  } catch (e: any) {
    error.value = e?.message || '翻译失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

async function copyResult() {
  if (!result.value) return
  try {
    await navigator.clipboard.writeText(result.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    /* 忽略 */
  }
}

// 清空：仅清空按钮可清输入框与结果（关闭弹窗不丢）
function clearAll() {
  wb.clearTranslate()
  error.value = ''
}

// 一键交换源/目标语：翻转方向并把上次译文回填输入框，已配 Key 则立即翻回
function swapLang() {
  const cfg = tcfg.value
  let nf: TranslateLang = cfg.to
  let nt: TranslateLang = cfg.from
  if (cfg.from === 'auto') {
    nf = cfg.to
    nt = cfg.to === 'zh' ? 'en' : 'zh'
  } else if (cfg.to === 'auto') {
    nt = cfg.from
    nf = cfg.from === 'zh' ? 'en' : 'zh'
  }
  wb.patchInst(props.iid, { translate: { ...tcfg.value,  from: nf, to: nt  } })
  const last = (wb.translateLast || '').trim()
  if (last) {
    wb.translateDraft = last
    if ((cfg.apiKey || '').trim()) doTranslate()
  }
}

// 采用翻译记忆中的历史译文（不发起请求）
function adoptRecall() {
  const hit = recalled.value
  if (hit) result.value = hit.dst
}

function clearMemory() {
  wb.tmClear()
}

// 自定义配色：主色 + 背景/文字（留空=跟随主题）
const DEFAULT_COLORS = { accent: '#f59e0b', bg: '', fg: '' }
const colors = computed(() => {
  const c = tcfg.value.colors
  return { ...DEFAULT_COLORS, ...(c || {}) }
})
function readableText(hex: string): string {
  const m = hex.replace('#', '')
  if (m.length !== 6) return '#ffffff'
  const r = parseInt(m.slice(0, 2), 16)
  const g = parseInt(m.slice(2, 4), 16)
  const b = parseInt(m.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#1f2937' : '#ffffff'
}
const colorVars = computed<Record<string, string>>(() => {
  const c = colors.value
  const s: Record<string, string> = {}
  if (c.accent) {
    s['--trans-accent'] = c.accent
    s['--trans-accent-fg'] = readableText(c.accent)
  }
  if (c.bg) s['--trans-bg'] = c.bg
  if (c.fg) s['--trans-fg'] = c.fg
  return s
})
function patchColor(key: 'accent' | 'bg' | 'fg', val: string) {
  const next = { ...colors.value, [key]: val }
  wb.patchInst(props.iid, { translate: { ...tcfg.value,  colors: next  } })
}
function onFollow(key: 'bg' | 'fg', follow: boolean) {
  patchColor(key, follow ? '' : (key === 'bg' ? '#1f2937' : '#111827'))
}
function resetAllColors() {
  wb.patchInst(props.iid, { translate: { ...tcfg.value,  colors: { ...DEFAULT_COLORS }  } })
}

// 弹窗尺寸（视口百分比）：范围 30–95
const sizeVw = computed<number>({
  get: () => tcfg.value.size?.vw ?? 40,
  set: (v: number) => {
    const cur = tcfg.value.size || { vw: 40, vh: 60 }
    wb.patchInst(props.iid, { translate: { ...tcfg.value,  size: { ...cur, vw: v }  } })
  },
})
const sizeVh = computed<number>({
  get: () => tcfg.value.size?.vh ?? 60,
  set: (v: number) => {
    const cur = tcfg.value.size || { vw: 40, vh: 60 }
    wb.patchInst(props.iid, { translate: { ...tcfg.value,  size: { ...cur, vh: v }  } })
  },
})

// 翻译模式下拉（4 种：中文↔英文、自动检测→中/英）；复用 store 的 TRANSLATE_DIRS
const modeOpts = TRANSLATE_DIRS.map((d) => ({ value: d.value, label: d.label }))

// 字符计数（用于底部工具行展示）
const srcCount = computed(() => (text.value || '').length)
const dstCount = computed(() => (result.value || '').length)

// 底部工具行的「翻译设置」按钮 → 打开独立设置弹窗（AppModal）
const settingsOpen = ref(false)

</script>

<template>
  <div class="wb-trans" :style="colorVars">
    <!-- 设置页面：点击底部「设置」打开独立弹窗（AppModal），避免内联面板视觉混乱 -->
    <AppModal :open="settingsOpen" @close="settingsOpen = false">
      <div class="wb-trans__settings wb-trans__settings--modal" :style="colorVars">
        <div class="wb-trans__sethead">
          <span class="wb-trans__settitle">翻译设置</span>
          <button class="wb-cell__btn" type="button" @click="settingsOpen = false" aria-label="关闭"><AppIcon name="x" :size="14" /></button>
        </div>
        <div class="wb-row">
          <label>DeepSeek API Key</label>
          <input
            class="wb-input"
            type="password"
            v-model="apiKey"
            placeholder="sk-...（platform.deepseek.com 申请）"
            autocomplete="off"
          />
        </div>
        <p class="wb-muted" style="font-size:.74rem;margin:.3rem 0 0">
          经后端代理调用 DeepSeek（OpenAI 兼容接口），Key 仅存本地、不写前端代码；免费额度足够个人使用，申请见
          <a href="https://platform.deepseek.com" target="_blank" rel="noopener">platform.deepseek.com</a>。
        </p>
        <div class="wb-row" style="margin-top:.55rem">
          <label>模型</label>
          <WbSelect :options="modelOpts" v-model="model" />
        </div>
        <p class="wb-muted" style="font-size:.74rem;margin:.3rem 0 0">
          deepseek-chat：通用、快、便宜；deepseek-reasoner（R1）：推理更强、更慢、更贵，适合复杂贸易条款。
        </p>
        <div class="wb-row wb-row--switch" style="margin-top:.55rem">
          <label>翻译记忆</label>
          <WbSwitch v-model="tmEnabled" />
        </div>
        <p class="wb-muted" style="font-size:.74rem;margin:.3rem 0 0">
          开启后，译过的句子会存入本地（含反向索引，支持中英互译召回），重复句直接采用、免去重复调用。
        </p>
        <button class="wb-trans__clearmem" @click="clearMemory">清空翻译记忆</button>

        <div class="wb-trans__sec">自定义配色</div>
        <div class="wb-row">
          <label>主色</label>
          <input type="color" class="wb-color" :value="colors.accent" @input="patchColor('accent', ($event.target as HTMLInputElement).value)" />
          <input class="wb-input wb-color__hex" :value="colors.accent" @input="patchColor('accent', ($event.target as HTMLInputElement).value)" maxlength="7" />
        </div>
        <div class="wb-row wb-row--switch">
          <label>背景跟随主题</label>
          <WbSwitch :model-value="colors.bg === ''" @update:model-value="(v: boolean) => onFollow('bg', v)" />
        </div>
        <div class="wb-row" v-if="colors.bg !== ''">
          <label>背景色</label>
          <input type="color" class="wb-color" :value="colors.bg" @input="patchColor('bg', ($event.target as HTMLInputElement).value)" />
          <input class="wb-input wb-color__hex" :value="colors.bg" @input="patchColor('bg', ($event.target as HTMLInputElement).value)" maxlength="7" />
        </div>
        <div class="wb-row wb-row--switch">
          <label>文字跟随主题</label>
          <WbSwitch :model-value="colors.fg === ''" @update:model-value="(v: boolean) => onFollow('fg', v)" />
        </div>
        <div class="wb-row" v-if="colors.fg !== ''">
          <label>文字色</label>
          <input type="color" class="wb-color" :value="colors.fg" @input="patchColor('fg', ($event.target as HTMLInputElement).value)" />
          <input class="wb-input wb-color__hex" :value="colors.fg" @input="patchColor('fg', ($event.target as HTMLInputElement).value)" maxlength="7" />
        </div>
        <button class="wb-trans__clearmem" @click="resetAllColors">重置配色</button>
        <div class="wb-trans__preview" :style="colorVars">
          <span class="sw" style="background: var(--trans-accent); color: var(--trans-accent-fg);">主色</span>
          <span class="sw sw--bg">文字</span>
        </div>

        <div class="wb-trans__sec">弹窗尺寸</div>
        <div class="wb-row wb-row--range">
          <label>宽度</label>
          <input type="range" min="30" max="95" step="1" :value="sizeVw" @input="sizeVw = Number(($event.target as HTMLInputElement).value)" />
          <span class="wb-trans__sizenum">{{ sizeVw }}vw</span>
        </div>
        <div class="wb-row wb-row--range">
          <label>高度</label>
          <input type="range" min="30" max="95" step="1" :value="sizeVh" @input="sizeVh = Number(($event.target as HTMLInputElement).value)" />
          <span class="wb-trans__sizenum">{{ sizeVh }}vh</span>
        </div>
        <p class="wb-muted" style="font-size:.74rem;margin:.3rem 0 0">
          以视口百分比设置弹窗最小宽高（30%–95%），设置即时生效、随账户持久化。
        </p>
      </div>
    </AppModal>

    <!-- 正文区域：左=输入，右=译文（撑满剩余高度，无论是否有文字） -->
    <div class="wb-trans__body">
      <div class="wb-trans__cols">
        <!-- 左栏：输入框 + 翻译记忆提示 -->
        <div class="wb-trans__inputcol">
          <div v-if="recalled" class="wb-trans__recall" @click="adoptRecall">
            <AppIcon name="history" :size="13" />
            <span>翻译记忆：曾译过此句（{{ langName(recalled.from) }} → {{ langName(recalled.to) }}），点击采用</span>
          </div>
          <textarea
            v-model="text"
            class="wb-trans__input wb-input"
            rows="6"
            placeholder="输入要翻译的内容…（关闭窗口也会保留，点「清空」才清除）"
            @keydown.ctrl.enter="doTranslate"
            @keydown.meta.enter="doTranslate"
          ></textarea>
        </div>

        <!-- 右栏：译文（始终显示圆角浅灰底） -->
        <div class="wb-trans__outcol">
          <div v-if="error" class="wb-trans__err">
            <AppIcon name="alert-triangle" :size="13" /> {{ error }}
          </div>
          <div class="wb-trans__out">
            <div v-if="result" class="wb-trans__result">{{ result }}</div>
            <div v-else class="wb-trans__empty">翻译结果将显示在这里</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 分隔线：正文与底部工具行 -->
    <hr class="wb-trans__rule" />

    <!-- 底部工具行：左=模式+操作，右=计数+设置 -->
    <div class="wb-trans__footer">
      <div class="wb-trans__foot-left">
        <WbSelect class="wb-trans__mode" :options="modeOpts" v-model="dir" />
        <button class="wb-trans__go" :disabled="loading || !text.trim()" @click="doTranslate">
          <AppIcon :name="loading ? 'loader' : 'languages'" :size="14" />
          {{ loading ? '翻译中…' : '翻译' }}
        </button>
        <button class="wb-trans__swap" @click="swapLang" title="交换源语言 / 目标语言（并把上次译文回填输入框）">
          <AppIcon name="arrow-left-right" :size="14" /> 交换
        </button>
        <button class="wb-trans__clear" @click="clearAll">
          <AppIcon name="trash-2" :size="13" /> 清空
        </button>
        <button class="wb-trans__fbtn" :disabled="!result" @click="copyResult">
          <AppIcon :name="copied ? 'check' : 'copy'" :size="13" />
          {{ copied ? '已复制' : '复制' }}
        </button>
      </div>
      <div class="wb-trans__foot-spacer"></div>
      <div class="wb-trans__foot-right">
        <span class="wb-trans__count">中文输入 <b>{{ srcCount }}</b> 字</span>
        <span class="wb-trans__count">译文 <b>{{ dstCount }}</b> 字</span>
        <button class="wb-trans__gearbtn" @click="settingsOpen = true" title="翻译设置">
          <AppIcon name="settings-2" :size="14" /> 设置
        </button>
      </div>
    </div>
  </div>
</template>
