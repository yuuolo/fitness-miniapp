// 修复：员工端会员详情页白屏（pages/staff/member/member）
// 原因：删掉入场记录功能后 memberDetail 只返回 { member }，
// 但页面还在 res.entries.map(...)，undefined.map 抛错 → 整页不渲染
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const log = []

function edit(rel, fn) {
  const p = MP + '/' + rel
  let raw = fs.readFileSync(p, 'utf8')
  const CRLF = raw.includes('\r\n')
  let t = raw.replace(/\r\n/g, '\n')
  const before = t
  t = fn(t)
  if (t !== before) {
    fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
    log.push(rel)
  }
}

// ---------- js：去掉 entries ----------
edit('pages/staff/member/member.js', t => {
  // data 里的 entries
  t = t.replace(/\n\s*entries: \[\],/, '')
  // load 里的 entries 赋值（连带前一行逗号处理）
  t = t.replace(
    /,\n\s*entries: res\.entries\.map\(e => Object\.assign\(e, \{ time: fmt\.dateTime\(e\.createdAt\) \}\)\)/,
    ''
  )
  t = t.replace(
    /\n\s*entries: res\.entries\.map\(e => Object\.assign\(e, \{ time: fmt\.dateTime\(e\.createdAt\) \}\)\)/,
    ''
  )
  return t
})

// ---------- wxml：删掉「最近入场」整块 ----------
edit('pages/staff/member/member.wxml', t => {
  t = t.replace(
    /\n\s*<view class="section-title">最近入场<\/view>\n\s*<view class="card">\n\s*<view wx:if="\{\{!entries\.length\}\}" class="muted">没有入场记录<\/view>\n\s*<view wx:for="\{\{entries\}\}"[^>]*>[\s\S]*?<\/view>\n\s*<\/view>\n/,
    '\n'
  )
  return t
})

console.log(log.length ? log.map(x => '  ✓ 已修 ' + x).join('\n') : '  ⚠ 没有改动，检查匹配')

// 校验
for (const f of ['pages/staff/member/member.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', MP + '/' + f])
  console.log('  ✓ 语法 ' + f)
}

// 复查残留
const js = fs.readFileSync(MP + '/pages/staff/member/member.js', 'utf8')
const wxml = fs.readFileSync(MP + '/pages/staff/member/member.wxml', 'utf8')
console.log('  js 里 entries 残留：' + (js.match(/entries/g) || []).length + ' 处')
console.log('  wxml 里 entries 残留：' + (wxml.match(/entries/g) || []).length + ' 处')
