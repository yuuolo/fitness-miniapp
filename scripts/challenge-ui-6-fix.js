// 修：check.js 的后端模块白名单加 challenge；挑战页面 require 路径改 3 层
const fs = require('fs')

const ROOT = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp'
const done = []

function edit(rel, fn, label) {
  const p = ROOT + '/' + rel
  let raw = fs.readFileSync(p, 'utf8')
  const CRLF = raw.includes('\r\n')
  let t = raw.replace(/\r\n/g, '\n')
  const before = t
  t = fn(t)
  if (t !== before) {
    fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
    done.push(label)
  } else {
    console.log('  [!] 无变化：' + label)
  }
}

// 1. check.js 白名单
edit('scripts/check.js', t => {
  const from = "const MODULES = ['system', 'member', 'booking', 'entry', 'admin', 'fitness', 'moment', 'competition']"
  const to = "const MODULES = ['system', 'member', 'booking', 'entry', 'admin', 'fitness', 'moment', 'competition', 'challenge']"
  return t.includes(from) ? t.replace(from, to) : t
}, 'check.js 白名单加 challenge')

// 2. require 路径：pages/challenges/*/*.js → ../../../utils
for (const rel of [
  'miniprogram/pages/challenges/list/list.js',
  'miniprogram/pages/challenges/new/new.js',
  'miniprogram/pages/challenges/detail/detail.js'
]) {
  edit(rel, t => t.split("require('../../utils/").join("require('../../../utils/"), 'require 路径：' + rel.split('/').slice(-2).join('/'))
}

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const rel of ['miniprogram/pages/challenges/list/list.js', 'miniprogram/pages/challenges/new/new.js', 'miniprogram/pages/challenges/detail/detail.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', ROOT + '/' + rel])
}
console.log('  ✓ 语法通过')
