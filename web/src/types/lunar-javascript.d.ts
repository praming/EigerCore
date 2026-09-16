// lunar-javascript 没有自带 d.ts，给我们用的字段做局部声明。
// 字段如有遗漏，运行时会回退到 undefined（运行时类型通过 lunarRich 兜底）。
declare module 'lunar-javascript' {
  export class Solar {
    static fromDate(d: Date): Solar
    static fromYmd(y: number, m: number, d: number): Solar
    static fromJulianDay(jd: number): Solar
    getYear(): number
    getMonth(): number
    getDay(): number
    getHour(): number
    getMinute(): number
    getSecond(): number
    getLunar(): Lunar
    getXingZuo(): string
    getJulianDay(): number
    nextDay(days: number): Solar
    toString(): string
    toYmd(): string
  }
  interface LunarJieQi {
    getName(): string
    getSolar(): Solar
  }
  export class Lunar {
    static fromSolar(solar: Solar): Lunar
    static fromYmd(y: number, m: number, d: number): Lunar
    getSolar(): Solar
    getYear(): number
    getMonth(): number
    getDay(): number
    getYearInChinese(): string
    getYearInGanZhi(): string
    getYearShengXiao(): string
    getYearWuXing(): string
    getYearNaYin(): string
    getMonthInChinese(): string
    getMonthInGanZhi(): string
    getMonthShengXiao(): string
    getMonthWuXing(): string
    getMonthNaYin(): string
    getDayInChinese(): string
    getDayInGanZhi(): string
    getDayShengXiao(): string
    getDayWuXing(): string
    getDayNaYin(): string
    getJieQi(): string
    getJieQiTable(): Array<{ name: string; solar: Solar }>
    getPrevJie(): string
    getNextJie(): string
    getPrevJieQi(): LunarJieQi | null
    getNextJieQi(): LunarJieQi | null
    getCurrentJie(): string | null
    getCurrentJieQi(): LunarJieQi | null
    getFestivals(): string[]
    getOtherFestivals(): string[]
    getDayYi(): string[]
    getDayJi(): string[]
    getPengZuGan(): string
    getPengZuZhi(): string
    getDayPositionTai(): string
    getDayPositionTaiSui(): string
    getDayPositionTaiSuiDesc(): string
    getDayPositionFu(): string
    getDayPositionFuDesc(): string
    getDayPositionCai(): string
    getDayPositionCaiDesc(): string
    getDayPositionXi(): string
    getDayPositionXiDesc(): string
    getDayPositionYangGui(): string
    getDayPositionYangGuiDesc(): string
    getDayPositionYinGui(): string
    getDayPositionYinGuiDesc(): string
    getDayChong(): string
    getDayChongDesc(): string
    getDayChongGanTie(): string
    getDaySha(): string
    getLiuYao(): string
    getXiu(): string
    getXiuLuck(): string
    getMonthShen(): string
    getDayJiShen(): string[]
    getDayXiongSha(): string[]
    getTime(): string
    getWeekInChinese(): string
    getEightChar(): EightChar
    getBaZiNaYin(): string[]
    getSeason(): string
  }
  export class EightChar {
    getYear(): string
    getMonth(): string
    getDay(): string
    getTime(): string
  }
}
