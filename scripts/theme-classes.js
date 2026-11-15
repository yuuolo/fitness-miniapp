// app.wxss 改造：把深浅两套变量同时绑定到「根节点类名」上，支持手动切换
//   page / .theme-light / .theme-auto → 浅色
//   .theme-dark                      → 深色
//   .theme-auto + 系统深色            → 深色（媒体查询）
const fs = require('fs')

const FILE = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/app.wxss'
let css = fs.readFileSync(FILE, 'utf8')

// ---------- 1. 取出现有变量定义 ----------
const lightMatch = css.match(/:root|page\s*\{([\s\S]*?)\n\}/)
const pageBlock = css.match(/(page\s*\{[\s\S]*?\n\})/)
if (!pageBlock) throw new Error('找不到 page 变量块')

// 只保留变量声明部分（把 background/color/font-size 那几行也留着）
const lightVars = pageBlock[1]

// 取出深色块里的变量
const darkStart = css.indexOf('@media (prefers-color-scheme: dark)')
let darkVars = ''
if (darkStart > 0) {
  const darkBlock = css.slice(darkStart)
  const inner = darkBlock.match(/page\s*\{([\s\S]*?)\n  \}/)
  if (inner) darkVars = inner[1]
}
if (!darkVars) throw new Error('找不到深色变量')

// ---------- 2. 用三组选择器重写 ----------
// 浅色：page 本身 + 显式 light + auto（auto 的深色由媒体查询覆盖）
const LIGHT_BLOCK = `/* 浅色：默认、显式浅色、跟随系统（系统浅色时）共用 */
page,
.theme-light,
.theme-auto {${lightVars}
}
`

const DARK_BLOCK = `
/* 深色：手动切换成深色时用 */
.theme-dark {${darkVars}
}

/* 跟随系统：系统是深色时套用深色变量 */
@media (prefers-color-scheme: dark) {
  .theme-auto {${darkVars}
  }
}
`

// ---------- 3. 拼回：用新块替换原来的 page{...} 与旧媒体查询 ----------
const before = css.slice(0, pageBlock.index)
let rest = css.slice(pageBlock.index + pageBlock[1].length)

// 去掉旧的深色媒体查询
const oldMediaIdx = rest.indexOf('@media (prefers-color-scheme: dark)')
if (oldMediaIdx >= 0) rest = rest.slice(0, oldMediaIdx)

css = before + LIGHT_BLOCK + rest.trimEnd() + '\n' + DARK_BLOCK
fs.writeFileSync(FILE, css)

console.log('app.wxss 已改为类名驱动的主题：')
console.log('  page, .theme-light, .theme-auto  → 浅色变量')
console.log('  .theme-dark                      → 深色变量')
console.log('  @media dark + .theme-auto        → 跟随系统')

// ---------- 4. 语法自检：括号平衡 ----------
const open = (css.match(/\{/g) || []).length
const close = (css.match(/\}/g) || []).length
console.log('括号: { ' + open + ' / } ' + close + (open === close ? ' ✓' : ' ✗ 不平衡'))
