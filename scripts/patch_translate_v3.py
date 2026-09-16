# -*- coding: utf-8 -*-
"""CRLF-safe patches for translate layout v3:
- Remove top gear in ToolsCard; drop showTransSettings wiring.
- TranslateTool: inline settings -> separate AppModal page; footer one row.
- input.css: fix body height fill + footer one-row layout.
"""
import io, sys

def load(p):
    s = io.open(p, 'r', encoding='utf-8', newline='').read()
    crlf = '\r\n' in s
    return s.replace('\r\n', '\n'), crlf

def save(p, s, crlf):
    if crlf:
        s = s.replace('\n', '\r\n')
    io.open(p, 'w', encoding='utf-8', newline='').write(s)

def patch(path, replacements):
    s, crlf = load(path)
    for i, (old, new, label) in enumerate(replacements):
        if old not in s:
            print(f"[FAIL] {path} :: {label} (old not found)")
            sys.exit(1)
        cnt = s.count(old)
        if cnt != 1:
            print(f"[WARN] {path} :: {label} matched {cnt} times (expected 1)")
        s = s.replace(old, new, 1)
        print(f"[OK]   {path} :: {label}")
    save(path, s, crlf)

BASE = r'D:\wwwroot\workbuddy\python-nav'

# ---------- ToolsCard.vue ----------
tools = f'{BASE}\\web\\src\\components\\workbench\\ToolsCard.vue'
patch(tools, [
    # 1) remove the showTransSettings ref + its comment
    (
        "// 翻译工具：弹窗右上角齿轮展开设置面板\nconst showTransSettings = ref(false)\n"
        "// 翻译弹窗尺寸（视口百分比）：来自设置，覆盖 CSS 默认最小宽高\n",
        "// 翻译弹窗尺寸（视口百分比）：来自设置，覆盖 CSS 默认最小宽高\n",
        "tools: remove showTransSettings ref",
    ),
    # 2) remove the top-right gear button block
    (
        "            <button\n"
        "              v-if=\"active === 'translate'\"\n"
        "              class=\"wb-cell__btn wb-pop__gear\"\n"
        "              :class=\"{ 'is-on': showTransSettings }\"\n"
        "              type=\"button\"\n"
        "              @click=\"showTransSettings = !showTransSettings\"\n"
        "              title=\"翻译设置\"\n"
        "              aria-label=\"翻译设置\"\n"
        "            ><AppIcon name=\"settings-2\" :size=\"14\" /></button>\n"
        "            <button class=\"wb-cell__btn\" @click=\"closeTool\" aria-label=\"关闭\"><AppIcon name=\"x\" :size=\"14\" /></button>\n",
        "            <button class=\"wb-cell__btn\" @click=\"closeTool\" aria-label=\"关闭\"><AppIcon name=\"x\" :size=\"14\" /></button>\n",
        "tools: remove top gear button",
    ),
    # 3) closeTool no longer resets showTransSettings
    (
        "  // 注意：关闭番茄钟弹窗**不再**自动暂停——计时由 usePomodoro 单例在后台持续走表\n"
        "  showTransSettings.value = false\n"
        "  active.value = null\n",
        "  // 注意：关闭番茄钟弹窗**不再**自动暂停——计时由 usePomodoro 单例在后台持续走表\n"
        "  active.value = null\n",
        "tools: closeTool drop showTransSettings",
    ),
    # 4) TranslateTool no longer receives show-settings
    (
        '              <TranslateTool v-model:show-settings="showTransSettings" />\n',
        '              <TranslateTool />\n',
        "tools: TranslateTool no v-model",
    ),
])

# ---------- TranslateTool.vue ----------
tt = f'{BASE}\\web\\src\\components\\workbench\\TranslateTool.vue'
patch(tt, [
    # A) import AppModal
    (
        "import WbSwitch from '../WbSwitch.vue'\n"
        "import { useWorkbenchStore, TRANSLATE_DIRS, TRANSLATE_MODELS, type TranslateModel, type TranslateLang } from '@/stores/workbench'\n",
        "import WbSwitch from '../WbSwitch.vue'\n"
        "import AppModal from '../AppModal.vue'\n"
        "import { useWorkbenchStore, TRANSLATE_DIRS, TRANSLATE_MODELS, type TranslateModel, type TranslateLang } from '@/stores/workbench'\n",
        "tt: import AppModal",
    ),
    # B) drop props
    (
        "const props = defineProps<{ showSettings: boolean }>()\n"
        "const wb = useWorkbenchStore()\n",
        "const wb = useWorkbenchStore()\n",
        "tt: drop props",
    ),
    # C) emit -> settingsOpen
    (
        "// 底部工具行的「翻译设置」按钮 → 通知父组件切换设置面板显隐\n"
        "const emit = defineEmits<{ 'update:showSettings': [value: boolean] }>()\n"
        "\n</script>\n",
        "// 底部工具行的「翻译设置」按钮 → 打开独立设置弹窗（AppModal）\n"
        "const settingsOpen = ref(false)\n"
        "\n</script>\n",
        "tt: emit -> settingsOpen",
    ),
    # D) replace inline settings panel with AppModal settings page
    (
        "    <!-- 设置面板：由弹窗右上角齿轮展开（API Key + 模型 + 翻译记忆） -->\n"
        "    <div v-if=\"showSettings\" class=\"wb-trans__settings\">\n"
        "      <div class=\"wb-row\">\n"
        "        <label>DeepSeek API Key</label>\n"
        "        <input\n"
        "          class=\"wb-input\"\n"
        "          type=\"password\"\n"
        "          v-model=\"apiKey\"\n"
        "          placeholder=\"sk-...（platform.deepseek.com 申请）\"\n"
        "          autocomplete=\"off\"\n"
        "        />\n"
        "      </div>\n"
        "      <p class=\"wb-muted\" style=\"font-size:.74rem;margin:.3rem 0 0\">\n"
        "        经后端代理调用 DeepSeek（OpenAI 兼容接口），Key 仅存本地、不写前端代码；免费额度足够个人使用，申请见\n"
        "        <a href=\"https://platform.deepseek.com\" target=\"_blank\" rel=\"noopener\">platform.deepseek.com</a>。\n"
        "      </p>\n"
        "      <div class=\"wb-row\" style=\"margin-top:.55rem\">\n"
        "        <label>模型</label>\n"
        "        <WbSelect :options=\"modelOpts\" v-model=\"model\" />\n"
        "      </div>\n"
        "      <p class=\"wb-muted\" style=\"font-size:.74rem;margin:.3rem 0 0\">\n"
        "        deepseek-chat：通用、快、便宜；deepseek-reasoner（R1）：推理更强、更慢、更贵，适合复杂贸易条款。\n"
        "      </p>\n"
        "      <div class=\"wb-row wb-row--switch\" style=\"margin-top:.55rem\">\n"
        "        <label>翻译记忆</label>\n"
        "        <WbSwitch v-model=\"tmEnabled\" />\n"
        "      </div>\n"
        "      <p class=\"wb-muted\" style=\"font-size:.74rem;margin:.3rem 0 0\">\n"
        "        开启后，译过的句子会存入本地（含反向索引，支持中英互译召回），重复句直接采用、免去重复调用。\n"
        "      </p>\n"
        "      <button class=\"wb-trans__clearmem\" @click=\"clearMemory\">清空翻译记忆</button>\n"
        "\n"
        "      <div class=\"wb-trans__sec\">自定义配色</div>\n"
        "      <div class=\"wb-row\">\n"
        "        <label>主色</label>\n"
        "        <input type=\"color\" class=\"wb-color\" :value=\"colors.accent\" @input=\"patchColor('accent', ($event.target as HTMLInputElement).value)\" />\n"
        "        <input class=\"wb-input wb-color__hex\" :value=\"colors.accent\" @input=\"patchColor('accent', ($event.target as HTMLInputElement).value)\" maxlength=\"7\" />\n"
        "      </div>\n"
        "      <div class=\"wb-row wb-row--switch\">\n"
        "        <label>背景跟随主题</label>\n"
        "        <WbSwitch :model-value=\"colors.bg === ''\" @update:model-value=\"(v: boolean) => onFollow('bg', v)\" />\n"
        "      </div>\n"
        "      <div class=\"wb-row\" v-if=\"colors.bg !== ''\">\n"
        "        <label>背景色</label>\n"
        "        <input type=\"color\" class=\"wb-color\" :value=\"colors.bg\" @input=\"patchColor('bg', ($event.target as HTMLInputElement).value)\" />\n"
        "        <input class=\"wb-input wb-color__hex\" :value=\"colors.bg\" @input=\"patchColor('bg', ($event.target as HTMLInputElement).value)\" maxlength=\"7\" />\n"
        "      </div>\n"
        "      <div class=\"wb-row wb-row--switch\">\n"
        "        <label>文字跟随主题</label>\n"
        "        <WbSwitch :model-value=\"colors.fg === ''\" @update:model-value=\"(v: boolean) => onFollow('fg', v)\" />\n"
        "      </div>\n"
        "      <div class=\"wb-row\" v-if=\"colors.fg !== ''\">\n"
        "        <label>文字色</label>\n"
        "        <input type=\"color\" class=\"wb-color\" :value=\"colors.fg\" @input=\"patchColor('fg', ($event.target as HTMLInputElement).value)\" />\n"
        "        <input class=\"wb-input wb-color__hex\" :value=\"colors.fg\" @input=\"patchColor('fg', ($event.target as HTMLInputElement).value)\" maxlength=\"7\" />\n"
        "      </div>\n"
        "      <button class=\"wb-trans__clearmem\" @click=\"resetAllColors\">重置配色</button>\n"
        "      <div class=\"wb-trans__preview\" :style=\"colorVars\">\n"
        "        <span class=\"sw\" style=\"background: var(--trans-accent); color: var(--trans-accent-fg);\">主色</span>\n"
        "        <span class=\"sw sw--bg\">文字</span>\n"
        "      </div>\n"
        "\n"
        "      <div class=\"wb-trans__sec\">弹窗尺寸</div>\n"
        "      <div class=\"wb-row wb-row--range\">\n"
        "        <label>宽度</label>\n"
        "        <input type=\"range\" min=\"30\" max=\"95\" step=\"1\" :value=\"sizeVw\" @input=\"sizeVw = Number(($event.target as HTMLInputElement).value)\" />\n"
        "        <span class=\"wb-trans__sizenum\">{{ sizeVw }}vw</span>\n"
        "      </div>\n"
        "      <div class=\"wb-row wb-row--range\">\n"
        "        <label>高度</label>\n"
        "        <input type=\"range\" min=\"30\" max=\"95\" step=\"1\" :value=\"sizeVh\" @input=\"sizeVh = Number(($event.target as HTMLInputElement).value)\" />\n"
        "        <span class=\"wb-trans__sizenum\">{{ sizeVh }}vh</span>\n"
        "      </div>\n"
        "      <p class=\"wb-muted\" style=\"font-size:.74rem;margin:.3rem 0 0\">\n"
        "        以视口百分比设置弹窗最小宽高（30%–95%），设置即时生效、随账户持久化。\n"
        "      </p>\n"
        "    </div>\n",
        "    <!-- 设置页面：点击底部「设置」打开独立弹窗（AppModal），避免内联面板视觉混乱 -->\n"
        "    <AppModal :open=\"settingsOpen\" @close=\"settingsOpen = false\">\n"
        "      <div class=\"wb-trans__settings wb-trans__settings--modal\" :style=\"colorVars\">\n"
        "        <div class=\"wb-trans__sethead\">\n"
        "          <span class=\"wb-trans__settitle\">翻译设置</span>\n"
        "          <button class=\"wb-cell__btn\" type=\"button\" @click=\"settingsOpen = false\" aria-label=\"关闭\"><AppIcon name=\"x\" :size=\"14\" /></button>\n"
        "        </div>\n"
        "        <div class=\"wb-row\">\n"
        "          <label>DeepSeek API Key</label>\n"
        "          <input\n"
        "            class=\"wb-input\"\n"
        "            type=\"password\"\n"
        "            v-model=\"apiKey\"\n"
        "            placeholder=\"sk-...（platform.deepseek.com 申请）\"\n"
        "            autocomplete=\"off\"\n"
        "          />\n"
        "        </div>\n"
        "        <p class=\"wb-muted\" style=\"font-size:.74rem;margin:.3rem 0 0\">\n"
        "          经后端代理调用 DeepSeek（OpenAI 兼容接口），Key 仅存本地、不写前端代码；免费额度足够个人使用，申请见\n"
        "          <a href=\"https://platform.deepseek.com\" target=\"_blank\" rel=\"noopener\">platform.deepseek.com</a>。\n"
        "        </p>\n"
        "        <div class=\"wb-row\" style=\"margin-top:.55rem\">\n"
        "          <label>模型</label>\n"
        "          <WbSelect :options=\"modelOpts\" v-model=\"model\" />\n"
        "        </div>\n"
        "        <p class=\"wb-muted\" style=\"font-size:.74rem;margin:.3rem 0 0\">\n"
        "          deepseek-chat：通用、快、便宜；deepseek-reasoner（R1）：推理更强、更慢、更贵，适合复杂贸易条款。\n"
        "        </p>\n"
        "        <div class=\"wb-row wb-row--switch\" style=\"margin-top:.55rem\">\n"
        "          <label>翻译记忆</label>\n"
        "          <WbSwitch v-model=\"tmEnabled\" />\n"
        "        </div>\n"
        "        <p class=\"wb-muted\" style=\"font-size:.74rem;margin:.3rem 0 0\">\n"
        "          开启后，译过的句子会存入本地（含反向索引，支持中英互译召回），重复句直接采用、免去重复调用。\n"
        "        </p>\n"
        "        <button class=\"wb-trans__clearmem\" @click=\"clearMemory\">清空翻译记忆</button>\n"
        "\n"
        "        <div class=\"wb-trans__sec\">自定义配色</div>\n"
        "        <div class=\"wb-row\">\n"
        "          <label>主色</label>\n"
        "          <input type=\"color\" class=\"wb-color\" :value=\"colors.accent\" @input=\"patchColor('accent', ($event.target as HTMLInputElement).value)\" />\n"
        "          <input class=\"wb-input wb-color__hex\" :value=\"colors.accent\" @input=\"patchColor('accent', ($event.target as HTMLInputElement).value)\" maxlength=\"7\" />\n"
        "        </div>\n"
        "        <div class=\"wb-row wb-row--switch\">\n"
        "          <label>背景跟随主题</label>\n"
        "          <WbSwitch :model-value=\"colors.bg === ''\" @update:model-value=\"(v: boolean) => onFollow('bg', v)\" />\n"
        "        </div>\n"
        "        <div class=\"wb-row\" v-if=\"colors.bg !== ''\">\n"
        "          <label>背景色</label>\n"
        "          <input type=\"color\" class=\"wb-color\" :value=\"colors.bg\" @input=\"patchColor('bg', ($event.target as HTMLInputElement).value)\" />\n"
        "          <input class=\"wb-input wb-color__hex\" :value=\"colors.bg\" @input=\"patchColor('bg', ($event.target as HTMLInputElement).value)\" maxlength=\"7\" />\n"
        "        </div>\n"
        "        <div class=\"wb-row wb-row--switch\">\n"
        "          <label>文字跟随主题</label>\n"
        "          <WbSwitch :model-value=\"colors.fg === ''\" @update:model-value=\"(v: boolean) => onFollow('fg', v)\" />\n"
        "        </div>\n"
        "        <div class=\"wb-row\" v-if=\"colors.fg !== ''\">\n"
        "          <label>文字色</label>\n"
        "          <input type=\"color\" class=\"wb-color\" :value=\"colors.fg\" @input=\"patchColor('fg', ($event.target as HTMLInputElement).value)\" />\n"
        "          <input class=\"wb-input wb-color__hex\" :value=\"colors.fg\" @input=\"patchColor('fg', ($event.target as HTMLInputElement).value)\" maxlength=\"7\" />\n"
        "        </div>\n"
        "        <button class=\"wb-trans__clearmem\" @click=\"resetAllColors\">重置配色</button>\n"
        "        <div class=\"wb-trans__preview\" :style=\"colorVars\">\n"
        "          <span class=\"sw\" style=\"background: var(--trans-accent); color: var(--trans-accent-fg);\">主色</span>\n"
        "          <span class=\"sw sw--bg\">文字</span>\n"
        "        </div>\n"
        "\n"
        "        <div class=\"wb-trans__sec\">弹窗尺寸</div>\n"
        "        <div class=\"wb-row wb-row--range\">\n"
        "          <label>宽度</label>\n"
        "          <input type=\"range\" min=\"30\" max=\"95\" step=\"1\" :value=\"sizeVw\" @input=\"sizeVw = Number(($event.target as HTMLInputElement).value)\" />\n"
        "          <span class=\"wb-trans__sizenum\">{{ sizeVw }}vw</span>\n"
        "        </div>\n"
        "        <div class=\"wb-row wb-row--range\">\n"
        "          <label>高度</label>\n"
        "          <input type=\"range\" min=\"30\" max=\"95\" step=\"1\" :value=\"sizeVh\" @input=\"sizeVh = Number(($event.target as HTMLInputElement).value)\" />\n"
        "          <span class=\"wb-trans__sizenum\">{{ sizeVh }}vh</span>\n"
        "        </div>\n"
        "        <p class=\"wb-muted\" style=\"font-size:.74rem;margin:.3rem 0 0\">\n"
        "          以视口百分比设置弹窗最小宽高（30%–95%），设置即时生效、随账户持久化。\n"
        "        </p>\n"
        "      </div>\n"
        "    </AppModal>\n",
        "tt: inline settings -> AppModal page",
    ),
    # E) footer settings button opens modal (no emit)
    (
        "        <button class=\"wb-trans__gearbtn\" :class=\"{ 'is-on': showSettings }\" @click=\"emit('update:showSettings', !showSettings)\" title=\"翻译设置\">\n"
        "          <AppIcon name=\"settings-2\" :size=\"14\" /> 设置\n"
        "        </button>\n",
        "        <button class=\"wb-trans__gearbtn\" @click=\"settingsOpen = true\" title=\"翻译设置\">\n"
        "          <AppIcon name=\"settings-2\" :size=\"14\" /> 设置\n"
        "        </button>\n",
        "tt: footer settings -> open modal",
    ),
    # F) add flexible spacer between left & right groups in footer
    (
        "      <div class=\"wb-trans__foot-left\">\n"
        "        <WbSelect class=\"wb-trans__mode\" :options=\"modeOpts\" v-model=\"dir\" />\n",
        "      <div class=\"wb-trans__foot-left\">\n"
        "        <WbSelect class=\"wb-trans__mode\" :options=\"modeOpts\" v-model=\"dir\" />\n",
        "tt: (no-op marker skipped)",
    ),
])

# The spacer insertion needs a distinct anchor; do it as its own patch after foot-left block start.
# Re-open and insert spacer before <div class="wb-trans__foot-right">
s, crlf = load(tt)
anchor = "      </div>\n      <div class=\"wb-trans__foot-right\">\n"
if anchor in s:
    s = s.replace(anchor, "      </div>\n      <div class=\"wb-trans__foot-spacer\"></div>\n      <div class=\"wb-trans__foot-right\">\n", 1)
    save(tt, s, crlf)
    print("[OK]   tt: insert footer spacer")
else:
    print("[FAIL] tt: footer spacer anchor not found")
    sys.exit(1)

# ---------- input.css ----------
css = f'{BASE}\\app\\static\\src\\input.css'
patch(css, [
    # fix body height fill
    (
        ".wb-pop--translate .wb-pop__body { display: flex; }\n",
        ".wb-pop--translate .wb-pop__body { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }\n",
        "css: body flex fill",
    ),
    # footer one row (nowrap) + spacer + controls no-shrink
    (
        ".wb-trans__footer { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; flex: none; }\n"
        ".wb-trans__foot-left { display: flex; align-items: center; gap: .4rem; flex-wrap: wrap; }\n"
        ".wb-trans__foot-right { display: flex; align-items: center; gap: .6rem; margin-left: auto; flex-wrap: wrap; }\n",
        ".wb-trans__footer { display: flex; align-items: center; gap: .5rem; flex-wrap: nowrap; flex: none; overflow-x: auto; }\n"
        ".wb-trans__foot-left { display: flex; align-items: center; gap: .4rem; flex-wrap: nowrap; flex: none; }\n"
        ".wb-trans__foot-spacer { flex: 1 1 auto; min-width: .25rem; }\n"
        ".wb-trans__foot-right { display: flex; align-items: center; gap: .6rem; flex-wrap: nowrap; flex: none; }\n",
        "css: footer one row",
    ),
    # controls fixed (no shrink)
    (
        ".wb-trans__clear { display: inline-flex; align-items: center; gap: .25rem; padding: .45rem .6rem;",
        ".wb-trans__clear { display: inline-flex; flex: 0 0 auto; align-items: center; gap: .25rem; padding: .45rem .6rem;",
        "css: clear no-shrink",
    ),
    (
        ".wb-trans__count { font-size: .72rem; color: color-mix(in srgb, var(--trans-fg) 55%, transparent); font-variant-numeric: tabular-nums; white-space: nowrap; }",
        ".wb-trans__count { flex: 0 0 auto; font-size: .72rem; color: color-mix(in srgb, var(--trans-fg) 55%, transparent); font-variant-numeric: tabular-nums; white-space: nowrap; }",
        "css: count no-shrink",
    ),
    (
        ".wb-trans__mode { min-width: 10.5rem; }",
        ".wb-trans__mode { flex: 0 1 auto; min-width: 8.5rem; }",
        "css: mode flexible",
    ),
    # modal settings page styles
    (
        ".wb-trans__settings { display: flex; flex-direction: column; gap: .15rem; padding: .6rem .7rem; margin-bottom: .35rem; border: 1px solid hsl(var(--bc) / .12); border-radius: .6rem; background: hsl(var(--bc) / .03); }\n",
        ".wb-trans__settings { display: flex; flex-direction: column; gap: .15rem; padding: .6rem .7rem; margin-bottom: .35rem; border: 1px solid hsl(var(--bc) / .12); border-radius: .6rem; background: hsl(var(--bc) / .03); }\n"
        ".wb-trans__settings--modal { border: none; background: transparent; padding: 0; margin-bottom: 0; }\n"
        ".wb-trans__sethead { display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin-bottom: .7rem; }\n"
        ".wb-trans__settitle { font-weight: 700; font-size: 1rem; color: hsl(var(--bc)); }\n",
        "css: modal settings page styles",
    ),
])

print("\nALL PATCHES APPLIED.")
