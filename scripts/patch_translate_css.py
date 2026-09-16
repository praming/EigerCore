# -*- coding: utf-8 -*-
import io

CSS = r"D:\wwwroot\workbuddy\python-nav\app\static\src\input.css"

def read_norm(path):
    with io.open(path, "r", encoding="utf-8", newline="") as f:
        raw = f.read()
    return raw.replace("\r\n", "\n"), "\r\n" in raw

def write_back(path, data, has):
    if has:
        data = data.replace("\n", "\r\n")
    with io.open(path, "w", encoding="utf-8", newline="") as f:
        f.write(data)

def patch(path, old, new, label):
    data, has = read_norm(path)
    if old not in data:
        raise SystemExit(f"[FAIL] {label}: old block not found")
    data = data.replace(old, new, 1)
    write_back(path, data, has)
    print(f"[OK] {label}")

# --- block 1: dirs -> body/input(go) ---
old_css1 = """}
.wb-trans__dirs { display: flex; gap: .3rem; flex-wrap: wrap; }
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

print("CSS PATCHES DONE")
