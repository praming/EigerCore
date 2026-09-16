files = {
    r"D:\wwwroot\workbuddy\python-nav\web\src\components\workbench\TranslateTool.vue": [
        # --- Repl A: remove sentence-sync script block (keep sizeVw/sizeVh) ---
        (
"""// 按句分段（中英文标点 / 换行切分，用于选中原文↔译文同步高亮）
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
</script>""",
"""</script>"""
        ),
        # --- Repl C: revert template to simple side-by-side (no sync highlight) ---
        (
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
    </div>""",
"""    <!-- 左右两栏：左=输入，右=译文（两栏等高、输入框撑满卡片） -->
    <div class="wb-trans__cols">
      <!-- 左栏：输入框 + 翻译记忆 + 操作 -->
      <div class="wb-trans__inputcol">
        <textarea
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
      </div>

      <!-- 右栏：译文 -->
      <div class="wb-trans__outcol">
        <div v-if="error" class="wb-trans__err">
          <AppIcon name="alert-triangle" :size="13" /> {{ error }}
        </div>
        <template v-else-if="result">
          <div class="wb-trans__result">{{ result }}</div>
          <button class="wb-trans__copy" @click="copyResult">
            <AppIcon :name="copied ? 'check' : 'copy'" :size="13" />
            {{ copied ? '已复制' : '复制' }}
          </button>
        </template>
        <div v-else class="wb-trans__empty">翻译结果将显示在这里</div>
      </div>
    </div>"""
        ),
    ],
    r"D:\wwwroot\workbuddy\python-nav\app\static\src\input.css": [
        # --- Repl 3: revert .wb-trans__result to block, drop segment rules ---
        (
""".wb-trans__out { display: flex; flex-direction: column; gap: .3rem; flex: 1 1 auto; min-height: 0; }
.wb-trans__result { display: flex; flex-direction: column; gap: .25rem; min-height: 0; overflow: auto; flex: 1 1 auto; padding: .55rem .6rem; border-radius: .55rem; background: color-mix(in srgb, var(--trans-fg) 5%, transparent); color: var(--trans-fg); font-size: .9rem; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
.wb-trans__resultseg { margin: 0; padding: .25rem .4rem; border-radius: .4rem; transition: background .18s ease; cursor: default; }
.wb-trans__resultseg.is-sel { background: color-mix(in srgb, var(--trans-accent) 16%, transparent); box-shadow: inset 2px 0 0 var(--trans-accent); }
.wb-trans__resultseg:hover { background: color-mix(in srgb, var(--trans-fg) 9%, transparent); }""",
""".wb-trans__out { display: flex; flex-direction: column; gap: .3rem; flex: 1 1 auto; min-height: 0; }
.wb-trans__result { min-height: 0; overflow: auto; flex: 1 1 auto; max-height: none; padding: .55rem .6rem; border-radius: .55rem; background: color-mix(in srgb, var(--trans-fg) 5%, transparent); color: var(--trans-fg); font-size: .9rem; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }"""
        ),
        # --- Repl 4: drop selnote/hintseg/fade; keep cols + size slider; ensure equal-height fill ---
        (
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
.wb-fade-enter-from, .wb-fade-leave-to { opacity: 0; }""",
""".wb-trans__preview .sw--bg { background: var(--trans-bg); color: var(--trans-fg); }

/* 左右两栏：输入左 / 译文右（两栏等高、靠输入框撑满卡片；窄弹窗自动堆叠） */
.wb-trans__cols { display: flex; gap: .7rem; flex: 1 1 auto; min-height: 0; align-items: stretch; }
.wb-trans__inputcol { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: .5rem; }
.wb-trans__outcol { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: .4rem; }
.wb-trans__inputcol .wb-trans__input { flex: 1 1 auto; min-height: 7rem; }
/* 弹窗尺寸滑块 */
.wb-row--range { gap: .5rem; }
.wb-row--range input[type="range"] { flex: 1 1 auto; accent-color: hsl(var(--a)); }
.wb-trans__sizenum { flex: none; min-width: 3rem; text-align: right; font-variant-numeric: tabular-nums; font-size: .76rem; color: hsl(var(--bc) / .7); }
/* 窄弹窗：左右两栏堆叠为上下 */
@container (max-width: 620px) {
  .wb-trans__cols { flex-direction: column; }
}"""
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
