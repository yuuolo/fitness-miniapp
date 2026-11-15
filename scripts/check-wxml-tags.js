// 检查 WXML 标签是否配对（编译失败的常见原因）
const fs = require('fs')
const path = require('path')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const VOID = new Set(['image', 'input', 'icon', 'progress', 'switch', 'slider', 'textarea',
  'audio', 'video', 'camera', 'live-player', 'live-pusher', 'map', 'canvas', 'web-view',
  'ad', 'official-account', 'open-data', 'cover-image', 'radio', 'checkbox'])

const files = []
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) walk(path.join(d, e.name))
    else if (e.name.endsWith('.wxml')) files.push(path.join(d, e.name))
  }
}
walk(MP)

let bad = 0
for (const f of files) {
  const rel = path.relative(MP, f).replace(/\\/g, '/')
  const src = fs.readFileSync(f, 'utf8')
  // 去掉注释
  const text = src.replace(/<!--[\s\S]*?-->/g, '')
  const stack = []
  const re = /<(\/?)([a-zA-Z0-9-]+)([^>]*?)(\/?)>/g
  let m
  const errs = []
  while ((m = re.exec(text)) !== null) {
    const closing = m[1] === '/'
    const tag = m[2]
    const selfClose = m[4] === '/'
    if (selfClose || VOID.has(tag)) continue
    if (!closing) {
      stack.push(tag)
    } else {
      const top = stack.pop()
      if (top !== tag) errs.push('闭合不匹配: </' + tag + '> 但栈顶是 ' + (top || '(空)'))
    }
  }
  if (stack.length) errs.push('未闭合: ' + stack.join(' > '))
  if (errs.length) {
    console.log('  ✗ ' + rel)
    errs.slice(0, 3).forEach(e => console.log('      ' + e))
    bad++
  }
}
console.log(bad ? '\n共 ' + bad + ' 个 WXML 有问题' : '\nWXML 标签全部配对 ✓')
