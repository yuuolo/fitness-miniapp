// 找出「wxml 里用了、但全局和页面样式都没定义」的类 —— 这类元素会完全没有样式
const fs = require('fs')
const path = require('path')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out) }
    else out.push(p)
  }
  return out
}

function classesInCss(css) {
  const set = new Set()
  // 只取选择器部分
  for (const m of css.matchAll(/([^{}]+)\{/g)) {
    const sel = m[1]
    if (sel.includes('%') || sel.trim().startsWith('@')) continue
    for (const c of sel.matchAll(/\.([\w-]+)/g)) set.add(c[1])
  }
  return set
}

const appCss = fs.readFileSync(path.join(MP, 'app.wxss'), 'utf8')
const appClasses = classesInCss(appCss)
// 自定义 tabBar 的类也算全局可用的组件样式（独立作用域，这里单独跳过）
const tabBarClasses = classesInCss(fs.readFileSync(path.join(MP, 'custom-tab-bar/index.wxss'), 'utf8'))

const files = walk(MP, [])
const pages = JSON.parse(fs.readFileSync(path.join(MP, 'app.json'), 'utf8')).pages

console.log('=== 使用了但没有样式定义的类 ===')
let total = 0
for (const page of pages) {
  const wxml = path.join(MP, page + '.wxml')
  if (!fs.existsSync(wxml)) continue
  const text = fs.readFileSync(wxml, 'utf8')
  const wxss = path.join(MP, page + '.wxss')
  const pageClasses = fs.existsSync(wxss) ? classesInCss(fs.readFileSync(wxss, 'utf8')) : new Set()

  const used = new Set()
  for (const m of text.matchAll(/class="([^"]+)"/g)) {
    // 去掉 {{ }} 表达式，只保留静态类名
    const raw = m[1].replace(/\{\{[^}]*\}\}/g, ' ')
    for (const c of raw.split(/\s+/)) if (c) used.add(c)
  }
  // 条件里出现的类名（'on' 这类）也当作使用
  for (const m of text.matchAll(/'([\w-]+)'/g)) used.add(m[1])

  const missing = [...used].filter(c =>
    !appClasses.has(c) && !pageClasses.has(c) && !tabBarClasses.has(c)
  )
  // 过滤掉语义化/一次性类名太常见的误报
  const real = missing.filter(c => c.length > 1 && !/^\d/.test(c))
  if (real.length) {
    console.log('  ' + page)
    console.log('     缺: ' + real.join(', '))
    total += real.length
  }
}
console.log('\n合计 ' + total + ' 个未定义类')

// 顺便列出没有 wxss 的页面
console.log('\n=== 没有独立 wxss 的页面（完全依赖全局样式）===')
for (const page of pages) {
  if (!fs.existsSync(path.join(MP, page + '.wxss'))) console.log('  ' + page)
}
