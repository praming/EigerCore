import io, sys

PY = r"C:\Users\Praming\.workbuddy\binaries\python\versions\3.13.12\python.exe"

files = {
    r"D:\wwwroot\workbuddy\python-nav\web\src\stores\workbench.ts": [
        # --- Repl 1: add TranslateSize interface + size field in TranslatePrefs ---
        (
"""/** 翻译颜色（自定义配色；accent 必填，bg/fg 留空则跟随主题） */
export interface TranslateColors {
  accent: string // 主色（按钮/高亮），默认 #f59e0b
  bg: string // 背景色（空=跟随主题）
  fg: string // 文字色（空=跟随主题）
}
/** 翻译偏好（DeepSeek 经后端代理） */
export interface TranslatePrefs {
  apiKey: string // DeepSeek API Key（设置页填写，存 localStorage；前端带给后端代理，不写死在前端代码）
  model: TranslateModel // 默认 deepseek-chat（快·省）；reasoner=R1 推理更强但慢且贵
  from: TranslateLang // 源语言（auto=自动识别）
  to: TranslateLang // 目标语言
  tm: boolean // 是否启用翻译记忆（命中本地历史译文，免去重复调用）
  colors?: TranslateColors // 自定义配色（主色/背景/文字；留空项跟随主题）
}""",
"""/** 翻译颜色（自定义配色；accent 必填，bg/fg 留空则跟随主题） */
export interface TranslateColors {
  accent: string // 主色（按钮/高亮），默认 #f59e0b
  bg: string // 背景色（空=跟随主题）
  fg: string // 文字色（空=跟随主题）
}
/** 翻译弹窗尺寸（视口百分比；vw=宽，vh=高；范围 30–95） */
export interface TranslateSize {
  vw: number // 宽度（视口宽度的百分比，30–95）
  vh: number // 高度（视口高度的百分比，30–95）
}
/** 翻译偏好（DeepSeek 经后端代理） */
export interface TranslatePrefs {
  apiKey: string // DeepSeek API Key（设置页填写，存 localStorage；前端带给后端代理，不写死在前端代码）
  model: TranslateModel // 默认 deepseek-chat（快·省）；reasoner=R1 推理更强但慢且贵
  from: TranslateLang // 源语言（auto=自动识别）
  to: TranslateLang // 目标语言
  tm: boolean // 是否启用翻译记忆（命中本地历史译文，免去重复调用）
  colors?: TranslateColors // 自定义配色（主色/背景/文字；留空项跟随主题）
  size?: TranslateSize // 弹窗尺寸（视口百分比；缺省回退 40×60）
}"""
        ),
        # --- Repl 2: defaultPrefs.translate add size ---
        (
"    translate: { apiKey: '', model: 'deepseek-flash', from: 'zh', to: 'en', tm: true, colors: { accent: '#f59e0b', bg: '', fg: '' } },",
"    translate: { apiKey: '', model: 'deepseek-flash', from: 'zh', to: 'en', tm: true, colors: { accent: '#f59e0b', bg: '', fg: '' }, size: { vw: 40, vh: 60 } },"
        ),
        # --- Repl 3: normalizeState add size clamping ---
        (
"""      base.prefs.translate = { apiKey, model, from, to, tm, colors: { accent, bg, fg } }
    }""",
"""      // 弹窗尺寸：vw/vh 收敛为 30–95 的数值，缺省回退 40×60
      const clampPct = (v: unknown, d: number) => {
        const n = typeof v === 'number' && isFinite(v)
          ? v
          : (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)) ? Number(v) : d)
        return Math.min(95, Math.max(30, n))
      }
      const s = (t.size && typeof t.size === 'object' ? t.size : {}) as Record<string, unknown>
      const size = { vw: clampPct(s.vw, 40), vh: clampPct(s.vh, 60) }
      base.prefs.translate = { apiKey, model, from, to, tm, colors: { accent, bg, fg }, size }
    }"""
        ),
    ],
    r"D:\wwwroot\workbuddy\python-nav\web\src\components\workbench\TranslateTool.vue": [
        # --- Repl A: script additions (size computeds + sentence sync) ---
        (
"""function resetAllColors() {
  wb.updatePref('translate', { colors: { ...DEFAULT_COLORS } })
}
</script>""",
"""function resetAllColors() {
  wb.updatePref('translate', { colors: { ...DEFAULT_COLORS } })
}

// 弹窗尺寸（视口百分比）：范围 30–95
const sizeVw = computed<number>({
  get: () => wb.prefs.translate.size?.vw ?? 40,
  set: (v: number) => {
    const cur = wb.prefs.translate.size || { vw: 40, vh: 60 }
    wb.updatePref('translate', { size: { ...cur, vw: v } })
  },
})
const sizeVh = computed<number>({
  get: () => wb.prefs.translate.size?.vh ?? 60,
  set: (v: number) => {
    const cur = wb.prefs.translate.size || { vw: 40, vh: 60 }
    wb.updatePref('translate', { size: { ...cur, vh: v } })
  },
})

// 按句分段（中英文标点 / 换行切分，用于选中原文↔译文同步高亮）
const SENT_RE = /[。！？!?\\n]/g
function splitSents(s: string): string[] {
  if (!s) return []
  SENT_RE.lastIndex = 0
  const out: string[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = SENT_RE.exec(s)) !== null) {
    const end = m.index + 1
    const body = s.slice(last, end).trim()
    if (body) out.push(body)
    last = end
  }
  const tail = s.slice(last).trim()
  if (tail) out.push(tail)
  return out
}
const textareaEl = ref<HTMLTextAreaElement | null>(null)
const srcSents = computed(() => splitSents(text.value))
const dstSents = computed(() => splitSents(result.value))
// 选中原文时高亮的句索引（与译文按序对应）；悬浮译文时浮出原文提示
const selSrcIdx = ref<number[]>([])
const hoverDstIdx = ref<number>(-1)
function onTextSelect() {
  const el = textareaEl.value
  if (!el) return
  const s = el.selectionStart
  const e = el.selectionEnd
  if (s == null || e == null || s === e) { selSrcIdx.value = []; return }
  const raw = text.value
  const ranges: { start: number; end: number }[] = []
  SENT_RE.lastIndex = 0
  let last = 0
  let m: RegExpExecArray | null
  while ((m = SENT_RE.exec(raw)) !== null) {
    const end = m.index + 1
    if (raw.slice(last, end).trim()) ranges.push({ start: last, end })
    last = end
  }
  if (raw.slice(last).trim()) ranges.push({ start: last, end: raw.length })
  const hit: number[] = []
  ranges.forEach((r, i) => { if (r.start < e && r.end > s) hit.push(i) })
  selSrcIdx.value = hit
}
</script>"""
        ),
        # --- Repl B: settings panel size sliders ---
        (
"""      <div class="wb-trans__preview" :style="colorVars">
        <span class="sw" style="background: var(--trans-accent); color: var(--trans-accent-fg);">主色</span>
        <span class="sw sw--bg">文字</span>
      </div>
    </div>""",
"""      <div class="wb-trans__preview" :style="colorVars">
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
    </div>"""
        ),
        # --- Repl C: template restructure (left-right layout + sentence highlight) ---
        (
"""    <textarea
      v-model="text"
      class="wb-trans__input wb-input"
      rows="3"
      placeholder="输入要翻译的内容…（关闭窗口也会保留，点「清空」才清除）"
      @keydown.ctrl.enter="doTranslate"
      @keydown.meta.enter="doTranslate"
    ></textarea>

    <!-- 翻译记忆命中提示 -->
    <div v-if="recalled" class="wb-trans__recall" @click="adoptRecall">
      <AppIcon name="history" :size="13" />
      <span>翻译记忆：曾译过此句（{{ langName(recalled.from) }} → {{ langName(recalled.to) }}），点击采用</span>
    </div>

    <div class="wb-trans__bar">
      <button class="wb-trans__go" :disabled="loading || !text.trim()" @click="doTranslate">
        <AppIcon :name="loading ? 'loader' : 'languages'" :size="14" />
        {{ loading ? '翻译中…' : '翻译' }}
      </button>
      <button class="wb-trans__clear" @click="clearAll">
        <AppIcon name="trash-2" :size="13" /> 清空
      </button>
    </div>
    <span class="wb-trans__hint">Ctrl/⌘ + Enter 翻译 · 关闭窗口内容保留</span>

    <div v-if="error" class="wb-trans__err">
      <AppIcon name="alert-triangle" :size="13" /> {{ error }}
    </div>
    <div v-else-if="result" class="wb-trans__out">
      <div class="wb-trans__result">{{ result }}</div>
      <button class="wb-trans__copy" @click="copyResult">
        <AppIcon :name="copied ? 'check' : 'copy'" :size="13" />
        {{ copied ? '已复制' : '复制' }}
      </button>
    </div>
    <div v-else class="wb-trans__empty">翻译结果将显示在这里</div>""",
"""    <!-- 左右两栏：左=输入，右=译文 -->
    <div class="wb-trans__cols">
      <!-- 左栏：输入框 + 翻译记忆 + 操作 -->
      <div class="wb-trans__inputcol">
        <textarea
          ref="textareaEl"
          v-model="text"
          class="wb-trans__input wb-input"
          rows="3"
          placeholder="输入要翻译的内容…（关闭窗口也会保留，点「清空」才清除）"
          @keydown.ctrl.enter="doTranslate"
          @keydown.meta.enter="doTranslate"
          @mouseup="onTextSelect"
          @keyup="onTextSelect"
          @select="onTextSelect"
        ></textarea>

        <!-- 翻译记忆命中提示 -->
        <div v-if="recalled" class="wb-trans__recall" @click="adoptRecall">
          <AppIcon name="history" :size="13" />
          <span>翻译记忆：曾译过此句（{{ langName(recalled.from) }} → {{ langName(recalled.to) }}），点击采用</span>
        </div>

        <div class="wb-trans__bar">
          <button class="wb-trans__go" :disabled="loading || !text.trim()" @click="doTranslate">
            <AppIcon :name="loading ? 'loader' : 'languages'" :size="14" />
            {{ loading ? '翻译中…' : '翻译' }}
          </button>
          <button class="wb-trans__clear" @click="clearAll">
            <AppIcon name="trash-2" :size="13" /> 清空
          </button>
        </div>
        <span class="wb-trans__hint">Ctrl/⌘ + Enter 翻译 · 关闭窗口内容保留</span>
        <p v-if="selSrcIdx.length" class="wb-trans__selnote">已选中 {{ selSrcIdx.length }} 句，右侧同步高亮</p>
      </div>

      <!-- 右栏：译文（按句分段，选中/悬浮时浅色高亮同步） -->
      <div class="wb-trans__outcol">
        <div v-if="error" class="wb-trans__err">
          <AppIcon name="alert-triangle" :size="13" /> {{ error }}
        </div>
        <template v-else-if="result">
          <div class="wb-trans__result">
            <p
              v-for="(seg, i) in dstSents"
              :key="i"
              class="wb-trans__resultseg"
              :class="{ 'is-sel': selSrcIdx.includes(i) }"
              @mouseenter="hoverDstIdx = i"
              @mouseleave="hoverDstIdx = -1"
            >{{ seg }}</p>
          </div>
          <button class="wb-trans__copy" @click="copyResult">
            <AppIcon :name="copied ? 'check' : 'copy'" :size="13" />
            {{ copied ? '已复制' : '复制' }}
          </button>
        </template>
        <div v-else class="wb-trans__empty">翻译结果将显示在这里</div>

        <!-- 悬浮某句译文时，浮出对应原文提示 -->
        <transition name="wb-fade">
          <div v-if="hoverDstIdx >= 0 && srcSents[hoverDstIdx]" class="wb-trans__hintseg">
            <span class="wb-trans__hintseg__tag">原文</span>{{ srcSents[hoverDstIdx] }}
          </div>
        </transition>
      </div>
    </div>"""
        ),
    ],
    r"D:\wwwroot\workbuddy\python-nav\web\src\components\workbench\ToolsCard.vue": [
        # --- Repl 1: add transPopStyle computed ---
        (
"const showTransSettings = ref(false)",
"""const showTransSettings = ref(false)
// 翻译弹窗尺寸（视口百分比）：来自设置，覆盖 CSS 默认最小宽高
const transPopStyle = computed<Record<string, string>>(() => {
  const s = wb.prefs.translate.size || { vw: 40, vh: 60 }
  return { minWidth: s.vw + 'vw', minHeight: s.vh + 'vh' }
})"""
        ),
        # --- Repl 2: apply inline style on translate popup ---
        (
'        <div class="wb-pop" :class="{ \'wb-pop--translate\': active === \'translate\' }">',
'        <div class="wb-pop" :class="{ \'wb-pop--translate\': active === \'translate\' }" :style="active === \'translate\' ? transPopStyle : null">'
        ),
    ],
    r"D:\wwwroot\workbuddy\python-nav\app\static\src\input.css": [
        # --- Repl 1: update translate popup comment ---
        (
"/* 翻译弹窗：加大尺寸，最小宽高均为屏幕 50% */",
"/* 翻译弹窗：尺寸改由设置（视口百分比）控制，此处为兜底最小宽高 */"
        ),
        # --- Repl 2: container-type on .wb-trans ---
        (
""".wb-trans { display: flex; flex-direction: column; gap: .5rem; height: 100%;
  --trans-accent: hsl(var(--a));
  --trans-accent-fg: hsl(var(--bc));
  --trans-bg: transparent;
  --trans-fg: hsl(var(--bc));
}""",
""".wb-trans { display: flex; flex-direction: column; gap: .5rem; height: 100%;
  container-type: inline-size;
  --trans-accent: hsl(var(--a));
  --trans-accent-fg: hsl(var(--bc));
  --trans-bg: transparent;
  --trans-fg: hsl(var(--bc));
}"""
        ),
        # --- Repl 3: rewrite .wb-trans__result + add segment rules ---
        (
""".wb-trans__out { display: flex; flex-direction: column; gap: .3rem; flex: 1 1 auto; min-height: 0; }
.wb-trans__result { min-height: 0; overflow: auto; flex: 1 1 auto; max-height: none; padding: .55rem .6rem; border-radius: .55rem; background: color-mix(in srgb, var(--trans-fg) 5%, transparent); color: var(--trans-fg); font-size: .9rem; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }""",
""".wb-trans__out { display: flex; flex-direction: column; gap: .3rem; flex: 1 1 auto; min-height: 0; }
.wb-trans__result { display: flex; flex-direction: column; gap: .25rem; min-height: 0; overflow: auto; flex: 1 1 auto; padding: .55rem .6rem; border-radius: .55rem; background: color-mix(in srgb, var(--trans-fg) 5%, transparent); color: var(--trans-fg); font-size: .9rem; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
.wb-trans__resultseg { margin: 0; padding: .25rem .4rem; border-radius: .4rem; transition: background .18s ease; cursor: default; }
.wb-trans__resultseg.is-sel { background: color-mix(in srgb, var(--trans-accent) 16%, transparent); box-shadow: inset 2px 0 0 var(--trans-accent); }
.wb-trans__resultseg:hover { background: color-mix(in srgb, var(--trans-fg) 9%, transparent); }"""
        ),
        # --- Repl 4: append layout / hint / size rules after preview sw--bg ---
        (
".wb-trans__preview .sw--bg { background: var(--trans-bg); color: var(--trans-fg); }",
""".wb-trans__preview .sw--bg { background: var(--trans-bg); color: var(--trans-fg); }

/* 左右两栏：输入左 / 译文右（窄弹窗自动堆叠） */
.wb-trans__cols { display: flex; gap: .7rem; flex: 1 1 auto; min-height: 0; }
.wb-trans__inputcol { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: .5rem; }
.wb-trans__outcol { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: .4rem; position: relative; }
.wb-trans__inputcol .wb-trans__input { flex: 1 1 auto; }
.wb-trans__selnote { color: color-mix(in srgb, var(--trans-accent) 85%, transparent); font-size: .68rem; margin: 0; }
.wb-trans__hintseg { position: absolute; left: .4rem; right: .4rem; bottom: 2.4rem; z-index: 5; display: flex; gap: .4rem; align-items: flex-start; padding: .4rem .5rem; border-radius: .5rem; background: hsl(var(--b2) / .97); border: 1px solid color-mix(in srgb, var(--trans-accent) 45%, transparent); color: var(--trans-fg); font-size: .78rem; line-height: 1.45; box-shadow: 0 4px 14px hsl(var(--bc) / .14); }
.wb-trans__hintseg__tag { flex: none; font-size: .64rem; font-weight: 700; color: var(--trans-accent-fg); background: var(--trans-accent); padding: .05rem .3rem; border-radius: .35rem; }
/* 弹窗尺寸滑块 */
.wb-row--range { gap: .5rem; }
.wb-row--range input[type="range"] { flex: 1 1 auto; accent-color: hsl(var(--a)); }
.wb-trans__sizenum { flex: none; min-width: 3rem; text-align: right; font-variant-numeric: tabular-nums; font-size: .76rem; color: hsl(var(--bc) / .7); }
/* 窄弹窗：左右两栏堆叠为上下 */
@container (max-width: 620px) {
  .wb-trans__cols { flex-direction: column; }
}
.wb-fade-enter-active, .wb-fade-leave-active { transition: opacity .18s ease; }
.wb-fade-enter-from, .wb-fade-leave-to { opacity: 0; }"""
        ),
    ],
}

def patch_file(path, repls):
    raw = open(path, 'rb').read()
    has_crlf = b'\r\n' in raw
    text = raw.decode('utf-8')
    if has_crlf:
        text = text.replace('\r\n', '\n')
    for i, (old, new) in enumerate(repls):
        cnt = text.count(old)
        if cnt != 1:
            raise SystemExit(f"[{path}] replacement #{i} matched {cnt} times (expected 1)")
        text = text.replace(old, new, 1)
    out = text
    if has_crlf:
        out = out.replace('\n', '\r\n')
    open(path, 'wb').write(out.encode('utf-8'))
    print(f"OK  {path}  ({len(repls)} replacements, crlf={has_crlf})")

for p, repls in files.items():
    patch_file(p, repls)

print("ALL DONE")
