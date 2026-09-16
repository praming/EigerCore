<script setup lang="ts">
import { computed, ref } from 'vue'
import WbCard from '../WbCard.vue'
import AppModal from '../AppModal.vue'
import AppIcon from '../AppIcon.vue'
import { useWorkbenchStore } from '@/stores/workbench'
import { solarToLunar } from '@/utils/lunar'
import { getDayInfo } from '@/utils/festivals'
import { wanliOf, hijriOf, type WanliDayInfo } from '@/utils/lunarRich'

const wb = useWorkbenchStore()
const props = defineProps<{ iid: string }>()
const cfg = computed(() => wb.instConfig(props.iid) || {})
const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth()) // 0-based
const weekdays = ['一', '二', '三', '四', '五', '六', '日']

interface Cell {
  day: number | null
  isToday: boolean
  lunar: string
  term: string | null
  festival: string | null
  isHoliday: boolean
  isWorkday: boolean
  isWeekend: boolean
}

function prevMonth() {
  if (month.value === 0) {
    month.value = 11
    year.value--
  } else month.value--
}
function nextMonth() {
  if (month.value === 11) {
    month.value = 0
    year.value++
  } else month.value++
}
function goToToday() {
  year.value = now.getFullYear()
  month.value = now.getMonth()
}

const cells = computed<Cell[]>(() => {
  const first = new Date(year.value, month.value, 1)
  const startDay = (first.getDay() + 6) % 7 // 周一=0
  const daysInMonth = new Date(year.value, month.value + 1, 0).getDate()
  const arr: Cell[] = []
  for (let i = 0; i < startDay; i++) arr.push({ day: null, isToday: false, lunar: '', term: null, festival: null, isHoliday: false, isWorkday: false, isWeekend: false })
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === now.getDate() && month.value === now.getMonth() && year.value === now.getFullYear()
    let lunar = ''
    let term: string | null = null
    if (cfg.value.showLunar) {
      const l = solarToLunar(year.value, month.value + 1, d)
      term = l.term
      lunar = term || (l.day === 1 ? l.monthText + '月' : l.dayText)
    }
    const info = getDayInfo(year.value, month.value + 1, d)
    const dow = new Date(year.value, month.value, d).getDay() // 0=日 6=六
    arr.push({
      day: d,
      isToday,
      lunar,
      term,
      festival: info.festival,
      isHoliday: info.isHoliday,
      isWorkday: info.isWorkday,
      isWeekend: dow === 0 || dow === 6,
    })
  }
  return arr
})

function sub(c: Cell): string {
  if (c.festival) return c.festival
  if (cfg.value.showLunar) return c.lunar
  return ''
}

// 日历网格间距（设置里可调），同时作用于星期头与日期网格以保持对齐
const calGridStyle = computed(() => ({
  rowGap: cfg.value.rowGap + 'px',
  columnGap: cfg.value.colGap + 'px',
}))

// 点击日期 → 弹出该日万年历单日详情（编辑态不弹窗，避免拖拽布局时误触）
const detail = ref<WanliDayInfo | null>(null)
function openDetail(c: Cell) {
  if (wb.editMode || c.day === null) return
  detail.value = wanliOf(year.value, month.value + 1, c.day)
}
function closeDetail() {
  detail.value = null
}
</script>

<template>
  <WbCard :iid="iid" icon="calendar">
    <template #meta>
      <div class="wb-cal__head">
        <button class="wb-cal__nav wb-cal__today" @click="goToToday" aria-label="回到今天" title="回到今天"><AppIcon name="crosshair" :size="15" /></button>
        <button class="wb-cal__nav" @click="prevMonth" aria-label="上个月"><AppIcon name="chevron-left" :size="15" /></button>
        <span class="wb-cal__ym">{{ year }} 年 {{ month + 1 }} 月</span>
        <button class="wb-cal__nav" @click="nextMonth" aria-label="下个月"><AppIcon name="chevron-right" :size="15" /></button>
      </div>
    </template>
    <div class="wb-cal" :class="{ 'is-autofill': cfg.autoFill }">
      <div class="wb-cal__grid wb-cal__wd" :style="cfg.autoFill ? undefined : calGridStyle">
        <span v-for="w in weekdays" :key="w">{{ w }}</span>
      </div>
      <div class="wb-cal__grid" :style="cfg.autoFill ? undefined : calGridStyle">
        <button
          v-for="(c, i) in cells"
          :key="i"
          type="button"
          class="wb-cal__cell"
          :class="{
            'is-today': c.isToday,
            'is-empty': c.day === null,
            'is-term': !!c.term,
            'is-weekend': c.isWeekend && !c.isWorkday,
            'is-holiday': c.isHoliday,
            'is-workday': c.isWorkday,
            'is-clickable': c.day !== null,
          }"
          :disabled="c.day === null"
          :title="c.day !== null ? year + '年' + (month + 1) + '月' + c.day + '日 · 点击查看详情' : ''"
          @click="c.day !== null && openDetail(c)"
        >
          <template v-if="c.day !== null">
            <span class="wb-cal__day">
              <span class="wb-cal__num">{{ c.day }}</span>
              <span v-if="sub(c)" class="wb-cal__lunar" :class="{ 'is-fest': c.festival }">{{ sub(c) }}</span>
            </span>
            <i v-if="c.isWorkday" class="wb-cal__mark">班</i>
          </template>
        </button>
      </div>
    </div>
  </WbCard>

  <AppModal :open="!!detail" boxClass="wb-wx-modal" @close="closeDetail">
    <div v-if="detail" class="wb-wanli">
      <div class="wb-cal-detail__head">
        <div>
          <div class="wb-cal-detail__title">
            {{ detail.year }} 年 {{ detail.month }} 月 {{ detail.day }} 日 · {{ detail.weekCn }}
          </div>
          <div class="wb-muted wb-cal-detail__sub">
            {{ detail.monthInChinese }}{{ detail.dayInChinese }} · {{ detail.ganzhiYear }}年【{{ detail.zodiac }}年】
          </div>
        </div>
        <button class="wb-cal-detail__close" type="button" title="关闭" @click="closeDetail">
          <AppIcon name="x" :size="18" />
        </button>
      </div>

      <!-- 节气距离条（常驻） -->
      <div class="wb-wanli__info-bar" :class="{ 'is-empty': !detail.jieqi && !detail.nextJieName }">
        <span v-if="detail.jieqi" class="wb-wanli__term-chip">节气 · {{ detail.jieqi }}</span>
        <span v-if="detail.prevJieName && detail.prevJieDays > 0" class="wb-wanli__sub">
          {{ detail.prevJieName }} 第{{ detail.prevJieDays }}天
        </span>
        <span v-if="detail.nextJieName && detail.nextJieDays >= 0" class="wb-wanli__sub">
          （距下一节气「{{ detail.nextJieName }}」还有{{ detail.nextJieDays }}天）
        </span>
      </div>

      <!-- 节日 -->
      <div
        class="wb-wanli__festivals"
        v-if="detail.festivals.length || detail.otherFestivals.length || detail.modHolidays.length"
      >
        <span class="wb-wanli__cat">节日</span>
        <span class="wb-wanli__chip" v-for="(name, i) in detail.festivals" :key="'f' + i">{{ name }}</span>
        <span class="wb-wanli__chip" :data-k="1" v-for="(name, i) in detail.otherFestivals" :key="'o' + i">{{ name }}</span>
        <span class="wb-wanli__chip is-mod" v-for="(name, i) in detail.modHolidays" :key="'m' + i">{{ name }}</span>
      </div>

      <!-- 宜 / 忌 -->
      <div class="wb-wanli__yj" v-if="detail.yi.length || detail.ji.length">
        <div class="wb-yj__row wb-yj__yi" v-if="detail.yi.length">
          <span class="wb-yj__cat">宜</span>
          <span class="wb-yj__list"><em v-for="(s, i) in detail.yi" :key="'yi' + i">{{ s }}</em></span>
        </div>
        <div class="wb-yj__row wb-yj__ji" v-if="detail.ji.length">
          <span class="wb-yj__cat">忌</span>
          <span class="wb-yj__list"><em v-for="(s, i) in detail.ji" :key="'ji' + i">{{ s }}</em></span>
        </div>
      </div>

      <!-- 详细信息 KV -->
      <div class="wb-wanli__detail">
        <div class="wb-wanli__detail-title">详细信息</div>
        <dl class="wb-kv wb-kv--double">
          <dt>生肖</dt><dd>{{ detail.zodiac }}</dd>
          <dt>星座</dt><dd>{{ detail.xingZuo }}</dd>
          <dt>彭祖百忌</dt><dd class="wb-kv__long">{{ detail.pengZuGan }}，{{ detail.pengZuZhi }}</dd>
          <dt>胎神占方</dt><dd>{{ detail.posTai }}</dd>
          <dt>年五行</dt><dd>{{ detail.yearNaYin }}</dd>
          <dt>月五行</dt><dd>{{ detail.monthNaYin }}</dd>
          <dt>日五行</dt><dd>{{ detail.dayNaYin }}</dd>
          <dt>季节</dt><dd>{{ detail.season }}</dd>
          <dt>星宿</dt><dd>{{ detail.xiu }}（{{ detail.xiuLuck }}）</dd>
          <dt>节气</dt>
          <dd v-if="detail.jieqi">{{ detail.jieqi }} 第{{ detail.prevJieDays }}天</dd>
          <dd v-if="detail.jieqi" class="wb-kv__extra">距下一节气「{{ detail.nextJieName }}」还有{{ detail.nextJieDays }}天</dd>
          <dd v-else class="wb-kv__extra">距下一节气「{{ detail.nextJieName }}」还有{{ detail.nextJieDays }}天</dd>
          <dt>儒略日</dt><dd>{{ detail.julianDay.toFixed(1) }}</dd>
          <dt>佛历</dt><dd>{{ detail.year + 543 }}年</dd>
          <dt>伊斯兰历</dt><dd>{{ hijriOf(detail.year, detail.month, detail.day) }}</dd>
          <dt>冲</dt><dd>{{ detail.dayZodiac }}（{{ detail.chongGanTie }}）</dd>
          <dt>煞</dt><dd>{{ detail.sha }}</dd>
          <dt>六曜</dt><dd>{{ detail.liuYao }}</dd>
          <dt>建除</dt><dd>{{ detail.jiShen.join(' ') }}</dd>
        </dl>
        <dl class="wb-kv wb-kv--double wb-kv--edge" v-if="detail.posXi || detail.posFu || detail.posCai || detail.taiSuiDesc">
          <dt>喜神</dt><dd>{{ detail.posXi || '—' }}</dd>
          <dt>福神</dt><dd>{{ detail.posFu || '—' }}</dd>
          <dt>财神</dt><dd>{{ detail.posCai || '—' }}</dd>
          <dt>太岁</dt><dd>{{ detail.taiSuiName || '—' }} {{ detail.taiSuiDesc || '' }}</dd>
        </dl>
      </div>
    </div>
  </AppModal>
</template>

<style scoped>
.wb-cal-detail__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.6rem;
}
.wb-cal-detail__title {
  font-size: 18px;
  font-weight: 700;
}
.wb-cal-detail__sub {
  font-size: 0.8rem;
  margin-top: 2px;
}
.wb-cal-detail__close {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: inherit;
  opacity: 0.55;
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
  outline: none;
  appearance: none;
  transition: opacity 0.2s ease, background 0.2s ease;
}
.wb-cal-detail__close:hover {
  opacity: 1;
  background: rgba(128, 128, 128, 0.15);
}
.wb-cal-detail__close:focus-visible {
  background: rgba(128, 128, 128, 0.2);
}
</style>
