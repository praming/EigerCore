// 搜索引擎彩色 logo（favicon / 品牌色标）：按引擎 id 取对应图片 URL。
// baidu/bing/sogou/so 为官方 favicon（ico 存为 png）；google/ddg 为 simpleicons 品牌色 SVG。
// 用显式 import 保证 6 个 logo 全部进入打包产物（避免 glob 漏匹配）。
import baidu from './baidu.png'
import bing from './bing.png'
import sogou from './sogou.png'
import so from './so.png'
import google from './google.svg'
import ddg from './ddg.svg'

const map: Record<string, string> = {
  baidu,
  bing,
  sogou,
  so,
  google,
  ddg,
}

/** 取搜索引擎彩色 logo 的 URL；无则返回 undefined（回退文字名） */
export function searchLogo(id: string): string | undefined {
  return map[id]
}
