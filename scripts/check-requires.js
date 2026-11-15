// 检查小程序里所有 require 能否解析（编译失败的常见原因）
const fs = require('fs')
const path = require('path')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'

const files = []
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') walk(path.join(d, e.name))
    } else if (e.name.endsWith('.js')) {
      files.push(path.join(d, e.name))
    }
  }
}
walk(MP)

let bad = 0
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8')
  for (const m of t.matchAll(/require\('([^']+)'\)/g)) {
    const req = m[1]
    if (!req.startsWith('.')) continue
    const target = path.resolve(path.dirname(f), req)
    if (!fs.existsSync(target) && !fs.existsSync(target + '.js')) {
      console.log('  缺失: ' + path.relative(MP, f).replace(/\\/g, '/') + ' → ' + req)
      bad++
    }
  }
}
console.log(bad ? '  共 ' + bad + ' 处缺失' : '  require 全部可解析 ✓')

// 检查 wxml 里的事件处理函数是否存在于对应 js（编译期不报，但运行时炸）
console.log('\n文件数: ' + files.length)
