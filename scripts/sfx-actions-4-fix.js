// 修两处：post.js 的 require 层级、competition-entry 的音效接入
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const done = []

function edit(rel, fn, label) {
  const p = MP + '/' + rel
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

// post.js 在 pages/moments/post/ → 需要 3 级
edit('pages/moments/post/post.js', t => {
  return t.replace(
    "const sfx = require('../../utils/sfx')",
    "const sfx = require('../../../utils/sfx')"
  )
}, 'post.js require 层级修正')

// competition-entry：已录入是 showModal，不是 toast
edit('pages/staff/competition-entry/competition-entry.js', t => {
  if (!t.includes("utils/sfx")) {
    t = t.replace(
      "const api = require('../../../utils/api')",
      "const api = require('../../../utils/api')\nconst sfx = require('../../../utils/sfx')"
    )
  }
  if (t.includes('sfx.playSave')) return t
  return t.replace(
    `      const best = r.myBest
      wx.showModal({`,
    `      const best = r.myBest
      sfx.playSave()
      wx.showModal({`
  )
}, '竞赛录入：保存音效')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['pages/moments/post/post.js', 'pages/staff/competition-entry/competition-entry.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', MP + '/' + f])
  console.log('  ✓ 语法 ' + f)
}
