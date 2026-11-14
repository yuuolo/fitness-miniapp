// 自我分析：统计界面样式现状，找出色彩与结构问题
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

const files = walk(MP, [])
const wxssFiles = files.filter(f => f.endsWith('.wxss'))
const wxmlFiles = files.filter(f => f.endsWith('.wxml'))

// 1. 所有颜色值统计
const colorCount = new Map()
for (const f of wxssFiles) {
  const text = fs.readFileSync(f, 'utf8')
  for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    const c = m[0].toLowerCase()
    colorCount.set(c, (colorCount.get(c) || 0) + 1)
  }
  for (const m of text.matchAll(/rgba?\([^)]+\)/g)) {
    const c = m[0].replace(/\s+/g, '')
    colorCount.set(c, (colorCount.get(c) || 0) + 1)
  }
}
const sorted = [...colorCount.entries()].sort((a, b) => b[1] - a[1])
console.log('=== 界面里用到的颜色（共 ' + sorted.length + ' 种）===')
for (const [c, n] of sorted) console.log('  ' + c.padEnd(26) + n + ' 处')

// 2. CSS 变量使用情况
let varUses = 0
for (const f of wxssFiles) {
  const text = fs.readFileSync(f, 'utf8')
  varUses += (text.match(/var\(--/g) || []).length
}
console.log('\n=== 设计变量 ===')
console.log('  CSS 变量使用次数: ' + varUses + (varUses === 0 ? '  ← 完全没有统一定义，全靠硬编码' : ''))

// 3. 圆角/间距碎片
const radii = new Map()
const fontSizes = new Map()
for (const f of wxssFiles) {
  const text = fs.readFileSync(f, 'utf8')
  for (const m of text.matchAll(/border-radius:\s*([^;]+);/g)) {
    const v = m[1].trim(); radii.set(v, (radii.get(v) || 0) + 1)
  }
  for (const m of text.matchAll(/font-size:\s*([^;]+);/g)) {
    const v = m[1].trim(); fontSizes.set(v, (fontSizes.get(v) || 0) + 1)
  }
}
console.log('\n=== 圆角取值（' + radii.size + ' 种）===')
console.log('  ' + [...radii.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => v + '(' + n + ')').join('  '))
console.log('\n=== 字号取值（' + fontSizes.size + ' 种）===')
console.log('  ' + [...fontSizes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([v, n]) => v + '(' + n + ')').join('  '))

// 4. 页面自定义样式规模（哪些页面样式最多 = 重复度最高）
console.log('\n=== 各页面样式文件规模 ===')
const sizes = wxssFiles.map(f => ({
  file: path.relative(MP, f),
  lines: fs.readFileSync(f, 'utf8').split('\n').length
})).sort((a, b) => b.lines - a.lines)
for (const s of sizes.slice(0, 10)) console.log('  ' + String(s.lines).padStart(4) + ' 行  ' + s.file)

// 5. 内联 style 的使用（应该尽量少）
let inlineStyles = 0
const inlineSamples = []
for (const f of wxmlFiles) {
  const text = fs.readFileSync(f, 'utf8')
  const ms = [...text.matchAll(/style="([^"]*)"/g)]
  inlineStyles += ms.length
  if (ms.length) inlineSamples.push(path.relative(MP, f) + ' (' + ms.length + ')')
}
console.log('\n=== 内联 style ===')
console.log('  共 ' + inlineStyles + ' 处：' + inlineSamples.join(', '))

// 6. 公共组件类使用次数（判断哪些该统一样式）
const classUse = new Map()
for (const f of wxmlFiles) {
  const text = fs.readFileSync(f, 'utf8')
  for (const m of text.matchAll(/class="([^"{}]+)"/g)) {
    for (const c of m[1].split(/\s+/).filter(Boolean)) {
      classUse.set(c, (classUse.get(c) || 0) + 1)
    }
  }
}
console.log('\n=== 复用最多的类（前 20）===')
console.log('  ' + [...classUse.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
  .map(([c, n]) => c + '(' + n + ')').join('  '))
