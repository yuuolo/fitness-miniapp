// 校验 wxml 结构健康度：重复 class 属性、重复 id、未闭合标签的粗略检查
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

const files = walk(MP, []).filter(f => f.endsWith('.wxml'))
let problems = 0

console.log('=== 1. 重复属性（同一个标签里出现两次）===')
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8')
  // 逐个标签检查
  for (const m of text.matchAll(/<([a-zA-Z-]+)([^>]*)>/g)) {
    const tag = m[1]
    const attrs = m[2]
    for (const attr of ['class', 'id', 'style']) {
      const hits = [...attrs.matchAll(new RegExp('\\b' + attr + '="', 'g'))].length
      if (hits > 1) {
        console.log('  ✗ ' + path.relative(MP, f) + ' <' + tag + '> 里 ' + attr + ' 出现 ' + hits + ' 次')
        console.log('      ' + m[0].slice(0, 120))
        problems++
      }
    }
  }
}
console.log(problems ? '' : '  无 ✓')

console.log('\n=== 2. {{ }} 是否成对 ===')
let braceProblems = 0
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8')
  const open = (text.match(/\{\{/g) || []).length
  const close = (text.match(/\}\}/g) || []).length
  if (open !== close) {
    console.log('  ✗ ' + path.relative(MP, f) + '  {{ ' + open + ' / }} ' + close)
    braceProblems++
  }
}
console.log(braceProblems ? '' : '  全部成对 ✓')

console.log('\n=== 3. wx:elif / wx:else 之前是否有 wx:if（粗略）===')
let chainProblems = 0
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (/wx:elif|wx:else/.test(line)) {
      // 往前找最近的含 wx:if 或 wx:elif 的行
      let found = false
      for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
        if (/wx:if|wx:elif/.test(lines[j])) { found = true; break }
        if (/<\/?(view|block|text|scroll-view)/.test(lines[j]) && !/wx:/.test(lines[j])) break
      }
      if (!found) {
        console.log('  ? ' + path.relative(MP, f) + ':' + (i + 1) + '  ' + line.trim().slice(0, 90))
        chainProblems++
      }
    }
  })
}
console.log(chainProblems ? '  以上需要人工确认' : '  无问题 ✓')

console.log('\n=== 4. 内联 style 残留 ===')
let inline = 0
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8')
  inline += (text.match(/style="/g) || []).length
}
console.log(inline ? '  ' + inline + ' 处' : '  无 ✓')

console.log('')
console.log(problems + braceProblems ? '有问题' : '结构检查通过')
process.exit(problems + braceProblems ? 1 : 0)
