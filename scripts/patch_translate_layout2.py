# -*- coding: utf-8 -*-
import io, sys

FILES = [
    r"D:\wwwroot\workbuddy\python-nav\web\src\components\workbench\TranslateTool.vue",
    r"D:\wwwroot\workbuddy\python-nav\app\static\src\input.css",
    r"D:\wwwroot\workbuddy\python-nav\web\src\components\workbench\ToolsCard.vue",
]

def read_norm(path):
    with io.open(path, "r", encoding="utf-8", newline="") as f:
        raw = f.read()
    has_crlf = "\r\n" in raw
    return raw.replace("\r\n", "\n"), has_crlf

def write_back(path, data, has_crlf):
    if has_crlf:
        data = data.replace("\n", "\r\n")
    with io.open(path, "w", encoding="utf-8", newline="") as f:
        f.write(data)

def patch(path, old, new, label):
    data, has = read_norm(path)
    if old not in data:
        raise SystemExit(f"[FAIL] {label}: old block not found in {path}")
    data = data.replace(old, new, 1)
    write_back(path, data, has)
    print(f"[OK] {label}")

# ============ 1) TranslateTool.vue ============
TP = FILES[0]

# --- script additions before </script> ---
old_script = """const sizeVh = computed<number>({
  get: () => wb.prefs.translate.size?.vh ?? 60,
  set: (v: number) => {
    const cur = wb.prefs.translate.size || { vw: 40, vh: 60 }
    wb.updatePref('translate', { size: { ...cur, vh: v } })
  },
})

</script>"""
new_script = """const sizeVh = computed<number>({
  get: () => wb.prefs.translate.size?.vh ?? 60,
  set: (v: number) => {
    const cur = wb.prefs.translate.size || { vw: 40, vh: 60 }
    wb.updatePref('translate', { size: { ...cur, vh: v } })
  },
})

// 翻译模式下拉（4 种：中文↔英文、自动检测→中/英）；复用 store 的 TRANSLATE_DIRS
const modeOpts = TRANSLATE_DIRS.map((d) => ({ value: d.value, label: d.label }))

// 字符计数（用于底部工具行展示）
const srcCount = computed(() => (text.value || '').length)
const dstCount = computed(() => (result.value || '').length)

// 底部工具行的「翻译设置」按钮 → 通知父组件切换设置面板显隐
const emit = defineEmits<{ 'update:showSettings': [value: boolean] }>()

</script>"""
patch(TP, old_script, new_script, "TranslateTool: script additions")

# --- template restructure ---
old_tpl = """    <!-- 方向切换 + 一键交换 -->
    <div class="wb-trans__dirs">
      <button
        v-for="d in TRANSLATE_DIRS"
        :key="d.value"
        type="button"
        class="wb-trans__dir"
        :class="{ 'is-active': dir === d.value }"
        @click="dir = d.value"
      >
        {{ d.label }}
      </button>
      <button
        type="button"
        class="wb-trans__swap"
        title="交换源语言 / 目标语言（并把上次译文回填输入框）"
        @click="swapLang"
      >
        <AppIcon name="arrow-left-right" :size="15" />
      </button>
    </div>

    <!-- 左右两栏：左=输入，右=译文（两栏等高、输入框撑满卡片） -->
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
    </div>
  </div>
</template>"""
new_tpl = """    <!-- 正文区域：左=输入，右=译文（撑满剩余高度，无论是否有文字） -->
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
      <div class="wb-trans__foot-right">
        <span class="wb-trans__count">中文输入 <b>{{ srcCount }}</b> 字</span>
        <span class="wb-trans__count">译文 <b>{{ dstCount }}</b> 字</span>
        <button class="wb-trans__gearbtn" :class="{ 'is-on': showSettings }" @click="emit('update:showSettings', !showSettings)" title="翻译设置">
          <AppIcon name="settings-2" :size="14" /> 设置
        </button>
      </div>
    </div>
  </div>
</template>"""
patch(TP, old_tpl, new_tpl, "TranslateTool: template restructure")

# ============ 2) input.css ============
CSS = FILES[1]

# --- block 1: dirs -> body/input(go) ---
old_css1 = """}.wb-trans__dirs { display: flex; gap: .3rem; flex-wrap: wrap; }
.wb-trans__dir { flex: 1; min-width: 0; padding: .3rem .35rem; border-radius: .5rem; border: 1px solid color-mix(in srgb, var(--trans-fg) 12%, transparent); background: color-mix(in srgb, var(--trans-fg) 4%, transparent); color: color-mix(in srgb, var(--trans-fg) 70%, transparent); font-size: .76rem; cursor: pointer; transition: all .18s ease; white-space: nowrap; }
.wb-trans__dir:hover { border-color: color-mix(in srgb, var(--trans-accent) 50%, transparent); color: var(--trans-fg); }
.wb-trans__dir.is-active { background: color-mix(in srgb, var(--trans-accent) 16%, transparent); border-color: var(--trans-accent); color: var(--trans-accent); font-weight: 600; }
.wb-trans__input { width: 100%; resize: vertical; border-radius: .55rem; padding: .5rem .6rem; flex: 1 1 auto; min-height: 7rem; font-size: .88rem; line-height: 1.5; background: color-mix(in srgb, var(--trans-fg) 4%, transparent); color: var(--trans-fg); }
.wb-trans__bar { display: flex; align-items: center; gap: .6rem; }
.wb-trans__go { flex: 1 1 auto; display: inline-flex; align-items: center; justify-content: center; gap: .3rem; padding: .45rem .8rem; border-radius: .55rem; border: none; background: var(--trans-accent); color: var(--trans-accent-fg); font-weight: 600; font-size: .82rem; cursor: pointer; transition: opacity .18s ease; }
.wb-trans__go:disabled { opacity: .45; cursor: not-allowed; }
.wb-trans__hint { color: color-mix(in srgb, var(--trans-fg) 45%, transparent); font-size: .68rem; }"""
new_css1 = """}
/* 正文区域：左右两栏撑满剩余高度 */
.wb-trans__body { flex: 1 1 auto; min-height: 0; display: flex; }
.wb-trans__input { width: 100%; resize: none; border-radius: .6rem; padding: .6rem .7rem; flex: 1 1 auto; min-height: 0; font-size: .9rem; line-height: 1.6; background: color-mix(in srgb, var(--trans-fg) 4%, transparent); color: var(--trans-fg); border: 1px solid color-mix(in srgb, var(--trans-fg) 14%, transparent); outline: none; transition: border-color .18s ease, box-shadow .18s ease; }
.wb-trans__input::placeholder { color: color-mix(in srgb, var(--trans-fg) 40%, transparent); }
.wb-trans__input:focus { border-color: color-mix(in srgb, var(--trans-accent) 55%, transparent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--trans-accent) 14%, transparent); }
.wb-trans__go { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; gap: .3rem; padding: .45rem .9rem; border-radius: .55rem; border: none; background: var(--trans-accent); color: var(--trans-accent-fg); font-weight: 600; font-size: .82rem; cursor: pointer; transition: opacity .18s ease; }
.wb-trans__go:disabled { opacity: .45; cursor: not-allowed; }"""
patch(CSS, old_css1, new_css1, "input.css: body/input/go")

# --- block 2: swap button restyle ---
old_css2 = """.wb-trans__swap { flex: 0 0 auto; width: 2rem; height: 2rem; display: inline-flex; align-items: center; justify-content: center; border-radius: .5rem; border: 1px solid color-mix(in srgb, var(--trans-fg) 14%, transparent); background: color-mix(in srgb, var(--trans-fg) 4%, transparent); color: color-mix(in srgb, var(--trans-fg) 70%, transparent); cursor: pointer; transition: all .18s ease; }
.wb-trans__swap:hover { border-color: color-mix(in srgb, var(--trans-accent) 50%, transparent); color: var(--trans-accent); transform: rotate(180deg); }"""
new_css2 = """.wb-trans__swap { flex: 0 0 auto; display: inline-flex; align-items: center; gap: .25rem; padding: .42rem .6rem; border-radius: .5rem; border: 1px solid color-mix(in srgb, var(--trans-fg) 14%, transparent); background: color-mix(in srgb, var(--trans-fg) 4%, transparent); color: color-mix(in srgb, var(--trans-fg) 75%, transparent); font-size: .78rem; cursor: pointer; transition: all .18s ease; white-space: nowrap; }
.wb-trans__swap:hover { border-color: color-mix(in srgb, var(--trans-accent) 50%, transparent); color: var(--trans-fg); }"""
patch(CSS, old_css2, new_css2, "input.css: swap button")

# --- block 3: cols block + append footer styles ---
old_css3 = """/* 左右两栏：输入左 / 译文右（两栏等高、靠输入框撑满卡片；窄弹窗自动堆叠） */
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
new_css3 = """/* 左右两栏：输入左 / 译文右（两栏等高、撑满正文；窄弹窗自动堆叠） */
.wb-trans__cols { display: flex; gap: .7rem; flex: 1 1 auto; min-height: 0; align-items: stretch; }
.wb-trans__inputcol { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: .5rem; }
.wb-trans__outcol { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: .4rem; }
.wb-trans__inputcol .wb-trans__input { flex: 1 1 auto; min-height: 0; }
/* 弹窗尺寸滑块 */
.wb-row--range { gap: .5rem; }
.wb-row--range input[type="range"] { flex: 1 1 auto; accent-color: hsl(var(--a)); }
.wb-trans__sizenum { flex: none; min-width: 3rem; text-align: right; font-variant-numeric: tabular-nums; font-size: .76rem; color: hsl(var(--bc) / .7); }
/* 窄弹窗：左右两栏堆叠为上下 */
@container (max-width: 620px) {
  .wb-trans__cols { flex-direction: column; }
}

/* 底部工具行 + 分隔线 */
.wb-trans__rule { border: none; border-top: 1px solid color-mix(in srgb, var(--trans-fg) 12%, transparent); margin: .55rem 0 .45rem; flex: none; }
.wb-trans__footer { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; flex: none; }
.wb-trans__foot-left { display: flex; align-items: center; gap: .4rem; flex-wrap: wrap; }
.wb-trans__foot-right { display: flex; align-items: center; gap: .6rem; margin-left: auto; flex-wrap: wrap; }
.wb-trans__fbtn { flex: 0 0 auto; display: inline-flex; align-items: center; gap: .25rem; padding: .42rem .6rem; border-radius: .5rem; border: 1px solid color-mix(in srgb, var(--trans-fg) 14%, transparent); background: transparent; color: color-mix(in srgb, var(--trans-fg) 75%, transparent); font-size: .78rem; cursor: pointer; transition: all .18s ease; white-space: nowrap; }
.wb-trans__fbtn:hover { border-color: color-mix(in srgb, var(--trans-accent) 50%, transparent); color: var(--trans-fg); }
.wb-trans__fbtn:disabled { opacity: .45; cursor: not-allowed; }
.wb-trans__count { font-size: .72rem; color: color-mix(in srgb, var(--trans-fg) 55%, transparent); font-variant-numeric: tabular-nums; white-space: nowrap; }
.wb-trans__count b { color: var(--trans-fg); font-weight: 600; margin: 0 .12rem; }
.wb-trans__gearbtn { flex: 0 0 auto; display: inline-flex; align-items: center; gap: .25rem; padding: .42rem .6rem; border-radius: .5rem; border: 1px solid color-mix(in srgb, var(--trans-fg) 14%, transparent); background: transparent; color: color-mix(in srgb, var(--trans-fg) 70%, transparent); font-size: .76rem; cursor: pointer; transition: all .18s ease; white-space: nowrap; }
.wb-trans__gearbtn:hover { border-color: color-mix(in srgb, var(--trans-accent) 50%, transparent); color: var(--trans-fg); }
.wb-trans__gearbtn.is-on { border-color: var(--trans-accent); color: var(--trans-accent); background: color-mix(in srgb, var(--trans-accent) 12%, transparent); }
.wb-trans__mode { min-width: 10.5rem; }"""
patch(CSS, old_css3, new_css3, "input.css: cols + footer styles")

# ============ 3) ToolsCard.vue ============
TC = FILES[2]
old_tc = '              <TranslateTool :show-settings="showTransSettings" />'
new_tc = '              <TranslateTool v-model:show-settings="showTransSettings" />'
patch(TC, old_tc, new_tc, "ToolsCard: v-model show-settings")

print("ALL PATCHES APPLIED")
