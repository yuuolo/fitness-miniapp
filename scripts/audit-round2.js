// 第二轮自查：清点剩余问题
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
const wxml = files.filter(f => f.endsWith('.wxml'))
const pages = JSON.parse(fs.readFileSync(path.join(MP, 'app.json'), 'utf8')).pages

console.log('=== 1. 内联 style（应尽量用类）===')
for (const f of wxml) {
  const text = fs.readFileSync(f, 'utf8')
  const ms = [...text.matchAll(/style="([^"]*)"/g)]
  if (ms.length) {
    console.log('  ' + path.relative(MP, f))
    ms.forEach(m => console.log('      style="' + m[1] + '"'))
  }
}

console.log('\n=== 2. 空状态文案是否统一（.empty vs 手写 muted）===')
for (const f of wxml) {
  const text = fs.readFileSync(f, 'utf8')
  if (/class="empty"/.test(text)) continue
  const handwritten = [...text.matchAll(/class="muted"[^>]*>([^<]*没有[^<]*|还没有[^<]*)</g)]
  if (handwritten.length) {
    console.log('  ' + path.relative(MP, f) + ' -> ' + handwritten.map(h => h[1].trim()).join(' / '))
  }
}

console.log('\n=== 3. 各页面的 section-title 使用情况（标题层级是否一致）===')
for (const p of pages) {
  const f = path.join(MP, p + '.wxml')
  if (!fs.existsSync(f)) continue
  const text = fs.readFileSync(f, 'utf8')
  const cards = (text.match(/class="card/g) || []).length
  const titles = (text.match(/class="[^"]*section-title/g) || []).length
  const listItems = (text.match(/class="list-item/g) || []).length
  console.log('  ' + p.padEnd(46) + 'card=' + String(cards).padStart(2) +
    '  section-title=' + String(titles).padStart(2) + '  list-item=' + String(listItems).padStart(2))
}

console.log('\n=== 4. 页面自身 wxss 行数（越小说明越依赖全局样式，越统一）===')
for (const p of pages) {
  const f = path.join(MP, p + '.wxss')
  const lines = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(l => l.trim()).length : 0
  console.log('  ' + String(lines).padStart(3) + ' 行  ' + p)
}
