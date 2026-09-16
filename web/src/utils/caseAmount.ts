// 金额转中文大写（人民币），例如 1234.56 → 壹仟贰佰叁拾肆元伍角陆分

const CN_DIGIT = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
const CN_INT_UNIT = ['', '拾', '佰', '仟']
const CN_GROUP_UNIT = ['', '万', '亿', '兆']

function chunkReverse(s: string): string[] {
  const rev = s.split('').reverse().join('')
  const groups = rev.match(/.{1,4}/g) || []
  return groups.map((g) => g.split('').reverse().join(''))
}

function intToCn(s: string): string {
  if (/^0+$/.test(s)) return ''
  const n = s.length
  let out = ''
  for (let i = 0; i < n; i++) {
    const d = Number(s[i])
    const pos = n - i - 1
    if (d === 0) {
      if (i < n - 1 && out[out.length - 1] !== '零') out += '零'
    } else {
      out += CN_DIGIT[d] + CN_INT_UNIT[pos]
    }
  }
  return out.replace(/零+$/, '')
}

export function caseAmount(money: number | string): string {
  const num = typeof money === 'string' ? Number(money) : money
  if (num === null || num === undefined || Number.isNaN(num)) return '请输入有效数字'
  const neg = num < 0
  const abs = Math.abs(num)
  const fixed = abs.toFixed(2)
  const dot = fixed.indexOf('.')
  const intPart = fixed.slice(0, dot)
  const decPart = fixed.slice(dot + 1)

  const groups = chunkReverse(intPart)
  let intCn = ''
  groups.forEach((g, idx) => {
    const seg = intToCn(g)
    if (seg) {
      intCn = seg + CN_GROUP_UNIT[idx] + intCn
    } else if (idx > 0 && intCn && intCn[0] !== '零') {
      intCn = '零' + intCn
    }
  })
  if (!intCn) intCn = '零'

  const jiao = Number(decPart[0])
  const fen = Number(decPart[1])
  let decCn = ''
  if (jiao === 0 && fen === 0) decCn = '整'
  else {
    if (jiao > 0) decCn += CN_DIGIT[jiao] + '角'
    if (fen > 0) decCn += (jiao === 0 ? '零' : '') + CN_DIGIT[fen] + '分'
  }

  let result = (neg ? '负' : '') + intCn + '元' + decCn
  // 清理：连续的零合并为一个；整数位为「零」且后接「元」时删除该零（如 0.07 → 零元零柒分）
  result = result.replace(/零+/g, '零')
  result = result.replace(/^零(?=元)/, '零')
  return result
}
