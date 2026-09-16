/**
 * 番茄钟状态（跨弹窗 / 跨刷新持续运行）。
 *
 * 关键需求：
 * - 关闭番茄钟弹窗后本次计时**继续走表**，除非手动暂停；
 * - 刷新页面后依据 startedAt 真实推算剩余时间，不丢秒；
 * - 状态落到独立 localStorage 键（不污染 wb_state_v1、不触发服务端逐秒同步）。
 *
 * 显示依赖 nowTick（每秒 +1）以驱动 computed 重算——effectiveRemain 用 nowTick
 * 而非 Date.now()，否则 computed 不会随秒刷新（Date.now 非响应式）。
 *
 * 状态条逻辑（head 状态条 + 大标题右侧）：
 * - lifecycle='idle'：从未启动 或 已重置 → 状态条**不显示**
 * - lifecycle='running'：计时中 → 状态条显示剩余时间（彩色「5:30」）
 * - lifecycle='paused'：手动暂停（remain>0）→ 状态条显示「⏸ 5:30」+「点我继续」
 * - lifecycle='finished'：时间到 → 状态条「⏰ 时间到」3 秒后自动转 idle（隐）
 */
import { computed, reactive, ref } from 'vue'

const KEY = 'wb_pomo_v1'
const DEFAULT_TOTAL = 25 * 60
const FINISHED_HOLD_MS = 3000 // finished 徽标保留 3s 后转 idle

interface PomoState {
  running: boolean
  paused: boolean // 手动暂停（区别于 idle：idle 为从未启动 / 已重置，paused 为启动后暂停）
  remain: number
  total: number
  startedAt: number | null
  finished: boolean // 时间到后短暂为 true，3s 后自动清除（→ idle）
}

function load(): PomoState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const o = JSON.parse(raw)
      const total = Number.isFinite(o.total) ? o.total : DEFAULT_TOTAL
      const remain = Number.isFinite(o.remain) ? o.remain : total
      return {
        running: !!o.running,
        paused: !!o.paused,
        remain,
        total,
        startedAt: o.startedAt ? Number(o.startedAt) : null,
        finished: false,
      }
    }
  } catch {
    /* 忽略损坏数据，回落默认 */
  }
  return { running: false, paused: false, remain: DEFAULT_TOTAL, total: DEFAULT_TOTAL, startedAt: null, finished: false }
}

// 模块级单例：跨组件 / 弹窗 / 刷新持续存在
const state = reactive<PomoState>(load())
const nowTick = ref(Date.now())

function persist() {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ running: state.running, paused: state.paused, remain: state.remain, total: state.total, startedAt: state.startedAt }),
    )
  } catch {
    /* 配额异常忽略 */
  }
}

/** 真实剩余秒：运行中以 startedAt 推算，确保关闭弹窗 / 刷新后仍在真实计时。
 *  注意：elapsed 必须用真实墙钟 Date.now() 计算，不能复用 nowTick——
 *  nowTick 是 setInterval 每秒刷新的响应式触发源，可能比 startedAt 晚至多 1 秒，
 *  若用它算 elapsed 会得到负值，使 remain 越界成 >total，导致 paused 状态误判为 idle（状态条消失）。
 *  这里读一下 nowTick.value 仅为了建立响应式依赖（让 remainStr 每秒重算），实际秒差走 Date.now()。 */
function effectiveRemain(): number {
  void nowTick.value // 建立响应式依赖：每秒驱动 computed 重算
  if (state.running && state.startedAt != null) {
    const elapsed = Math.floor((Date.now() - state.startedAt) / 1000)
    return Math.max(0, state.remain - elapsed)
  }
  return state.remain
}

function fmt(s: number): string {
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${m}:${ss < 10 ? '0' : ''}${ss}`
}

const remainStr = computed(() => fmt(effectiveRemain()))
const running = computed(() => state.running)
const progress = computed(() => {
  const total = state.total || DEFAULT_TOTAL
  const r = effectiveRemain()
  return Math.max(0, Math.min(100, ((total - r) / total) * 100))
})

/**
 * 派生生命周期：决定徽标显示。
 * - finished > running > paused > idle（finished 优先以便显示「时间到」）
 */
export type PomoLifecycle = 'idle' | 'running' | 'paused' | 'finished'
const lifecycle = computed<PomoLifecycle>(() => {
  if (state.finished) return 'finished'
  if (state.running) return 'running'
  // paused 用显式标志：手动暂停后即使仍在满时长（remain==total）也归为 paused，
  // 避免「启动后立即暂停」被误判成 idle 而让状态条消失。
  if (state.paused) return 'paused'
  return 'idle'
})

let timer: number | undefined
function ensureTimer() {
  if (timer != null) return
  timer = window.setInterval(() => {
    nowTick.value = Date.now()
    if (state.running && state.startedAt != null && effectiveRemain() <= 0) finish()
  }, 1000)
}
function clearTimer() {
  if (timer != null) {
    clearInterval(timer)
    timer = undefined
  }
}

function tryBeep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g)
    g.connect(ctx.destination)
    o.type = 'sine'
    o.frequency.value = 880
    g.gain.setValueAtTime(0.001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    o.start()
    o.stop(ctx.currentTime + 0.62)
  } catch {
    /* 无音频环境忽略 */
  }
}

let finishedTimer: number | undefined
function finish() {
  state.running = false
  state.paused = false
  state.remain = 0
  state.startedAt = null
  state.finished = true
  persist()
  tryBeep()
  // 几秒后转回 idle（隐徽标）
  if (finishedTimer != null) clearTimeout(finishedTimer)
  finishedTimer = window.setTimeout(() => {
    // 转 idle：归还满时长，避免下次 start 时 remain=0 触发逻辑混淆
    state.finished = false
    state.paused = false
    state.remain = state.total || DEFAULT_TOTAL
    finishedTimer = undefined
    persist()
  }, FINISHED_HOLD_MS)
}

function start() {
  if (finishedTimer != null) {
    clearTimeout(finishedTimer)
    finishedTimer = undefined
  }
  state.finished = false
  state.paused = false
  if (state.remain <= 0) state.remain = state.total || DEFAULT_TOTAL
  state.running = true
  state.startedAt = Date.now()
  ensureTimer()
  persist()
}
function startWith(min: number) {
  if (finishedTimer != null) {
    clearTimeout(finishedTimer)
    finishedTimer = undefined
  }
  state.total = min * 60
  state.remain = state.total
  state.running = true
  state.startedAt = Date.now()
  state.finished = false
  state.paused = false
  ensureTimer()
  persist()
}
function pause() {
  if (!state.running) return
  state.remain = effectiveRemain()
  state.running = false
  state.paused = true
  state.startedAt = null
  persist()
}
function reset() {
  if (finishedTimer != null) {
    clearTimeout(finishedTimer)
    finishedTimer = undefined
  }
  state.running = false
  state.paused = false
  state.startedAt = null
  state.remain = state.total || DEFAULT_TOTAL
  state.finished = false
  persist()
}
function toggle() {
  state.running ? pause() : start()
}

// 页面刚加载时若处于 running，启动计时器继续走表
if (state.running) ensureTimer()

// 返回 reactive 包装：模板里 `pomo.running` / `pomo.remainStr` 等嵌套 ref 才能正确自解包并跟踪响应式
// （plain 对象里的 ref 在 v-if 等指令表达式中不会被自动解包，会导致徽标永不隐藏）。
export function usePomodoro() {
  return reactive({
    state,
    running,
    remainStr,
    progress,
    lifecycle,
    start,
    pause,
    reset,
    startWith,
    toggle,
    effectiveRemain,
  })
}
