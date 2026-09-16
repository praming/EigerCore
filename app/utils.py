"""
utils.py —— 通用辅助函数（无 Flask 依赖，可单独导入）
==================================================
- 颜色转换：hex → HSL 三元组（供自定义配色注入 CSS 变量）
- SVG 净化：上传的 SVG 图标去脚本 / 事件处理器，防 XSS
"""

import re


def _parse_hex(hex_color):
    """解析 #rgb / #rrggbb 为 (r,g,b) 0~255。非法返回 None。"""
    if not hex_color:
        return None
    h = str(hex_color).strip().lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    if len(h) != 6:
        return None
    try:
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return None


def hex_to_hsl(hex_color):
    """把 #rrggbb 转为 'H S% L%'（HSL 通道，供 hsl(var(--p)) 使用）。失败回退靛蓝。"""
    rgb = _parse_hex(hex_color)
    if rgb is None:
        return '245 75% 58%'
    r, g, b = [c / 255 for c in rgb]
    mx, mn = max(r, g, b), min(r, g, b)
    d = mx - mn
    l = (mx + mn) / 2
    if d == 0:
        h_deg = 0.0
        s = 0.0
    else:
        s = d / (2 - mx - mn) if l > 0.5 else d / (mx + mn)
        if mx == r:
            h_deg = ((g - b) / d) % 6
        elif mx == g:
            h_deg = (b - r) / d + 2
        else:
            h_deg = (r - g) / d + 4
        h_deg *= 60
        if h_deg < 0:
            h_deg += 360
    return f"{round(h_deg)} {round(s * 100)}% {round(l * 100)}%"


def relative_luminance(hex_color):
    """计算相对亮度（0~1），用于决定主色上的文字用黑还是白。"""
    rgb = _parse_hex(hex_color)
    if rgb is None:
        return 1.0
    r, g, b = [c / 255 for c in rgb]

    def lin(c):
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def on_color(hex_color):
    """返回主色之上的文字颜色（HSL 三元组字符串）：暗底用白，亮底用近黑。"""
    lum = relative_luminance(hex_color)
    return '0 0% 100%' if lum < 0.5 else '0 0% 12%'


def sanitize_svg(text):
    """净化 SVG 文本：移除 <script>、<foreignObject>、事件处理器(on*) 与 javascript: 伪协议。
    上传的 SVG 直接内嵌到页面，必须去掉可执行内容，否则存在 XSS 风险。"""
    if not text:
        return ''
    text = re.sub(r'<script[\s\S]*?</script>', '', text, flags=re.IGNORECASE)
    text = re.sub(r'<foreignObject[\s\S]*?</foreignObject>', '', text, flags=re.IGNORECASE)
    # 删除所有 on* 事件处理器属性（onclick / onload / onmouseover ...）
    text = re.sub(r'\s+on\w+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)', '', text, flags=re.IGNORECASE)
    # 把 javascript: 伪协议替换为 #（仅处理 href / src）
    text = re.sub(r'(href|src)\s*=\s*("javascript:[^"]*"|\'javascript:[^\']*\')',
                  r'\1="#"', text, flags=re.IGNORECASE)
    return text
