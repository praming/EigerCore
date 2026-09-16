// 实时热搜各平台彩色 logo（PNG，从 uapis 热榜页抓回的官方图标，离线资源）。
// 文件以平台 src（即 uapis type slug）命名（weibo.png / zhihu-daily.png / douyin.png ...）。
const mods = import.meta.glob('./*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

/** 返回平台彩色 logo 的 URL（PNG）；无对应资源时返回 undefined */
export function hotlistLogo(key: string): string | undefined {
  return mods['./' + key + '.png']
}
