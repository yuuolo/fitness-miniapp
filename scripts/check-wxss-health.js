// 检查所有 wxss 语法健康度（括号平衡、变量引用是否都有定义）
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

const wxss = walk(MP, []).filter(f => f.endsWith('.wxss'))
const appCss = fs.readFileSync(path.join(MP, 'app.wxss'), 'utf8')

// 1. 变量定义
const defined = new Set([...appCss.matchAll(/--([\w-]+)\s*:/g)].map(m => m[1]))
console.log('=== 定义的设计变量（' + defined.size + ' 个）===')
console.log('  ' + [...defined].join('  '))

// 2. 变量引用是否都有定义
const missing = new Map()
for (const f of wxss) {
  const text = fs.readFileSync(f, 'utf8')
  for (const m of text.matchAll(/var\(--([\w-]+)/g)) {
    if (!defined.has(m[1])) {
      const arr = missing.get(m[1]) || []
      arr.push(path.relative(MP, f))
      missing.set(m[1], arr)
    }
  }
}
console.log('\n=== 未定义的变量引用 ===')
if (missing.size) {
  for (const [v, files] of missing) console.log('  ✗ --' + v + '  用在 ' + [...new Set(files)].join(', '))
} else {
  console.log('  无 ✓')
}

// 3. 括号平衡
console.log('\n=== 括号平衡 ===')
let bad = 0
for (const f of wxss) {
  const text = fs.readFileSync(f, 'utf8')
  const open = (text.match(/\{/g) || []).length
  const close = (text.match(/\}/g) || []).length
  if (open !== close) {
    console.log('  ✗ ' + path.relative(MP, f) + '  { ' + open + ' / } ' + close)
    bad++
  }
}
console.log(bad ? '  ' + bad + ' 个文件括号不平衡' : '  全部平衡 ✓')

// 4. 是否还有写死的旧色值
console.log('\n=== 硬编码颜色（应只剩 #fff / #000 与 app.wxss 的变量定义）===')
const leftovers = []
for (const f of wxss) {
  const rel = path.relative(MP, f)
  if (rel.endsWith('app.wxss')) continue
  const text = fs.readFileSync(f, 'utf8')
  for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    const c = m[0].toLowerCase()
    if (c === '#fff' || c === '#ffffff' || c === '#000' || c === '#000000') continue
    leftovers.push(rel + ': ' + c)
  }
}
console.log(leftovers.length ? '  ' + leftovers.join('\n  ') : '  无 ✓')
process.exit(missing.size || bad || leftovers.length ? 1 : 0)
