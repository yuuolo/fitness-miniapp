// 每个会员的动作各自随机：种子用 openid + 日期
const fs = require('fs')

const SERVER = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server'
const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const done = []

function edit(p, fn, label) {
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

// ---------- 1. 服务端：publicMe 带上自己的 openid（会员之间本来就能互相看到 _id） ----------
edit(SERVER + '/lib/member.js', t => {
  if (t.includes('_id: me._id')) return t
  return t.replace(
    `  return {
    nickName: me.nickName,`,
    `  return {
    _id: me._id,
    nickName: me.nickName,`
  )
}, 'publicMe 返回 _id')

// ---------- 2. 前端：种子换成会员自己的 openid ----------
edit(MP + '/pages/index/index.js', t => {
  if (t.includes("poseOfDay(res.me && res.me._id")) return t
  return t.replace(
    `      // 欢迎栏的小人：姿势按「日期」定，一天只换一次
      const fig = heroAnim.poseOfDay('', this.todayStr())`,
    `      // 欢迎栏的小人：每个人的动作各不相同，同一个人一天内固定
      const seed = (res.me && (res.me._id || res.me.phone || res.me.nickName)) || ''
      const fig = heroAnim.poseOfDay(seed, this.todayStr())`
  )
}, '前端种子改用 openid')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', SERVER + '/lib/member.js'])
require('child_process').execFileSync(process.execPath, ['--check', MP + '/pages/index/index.js'])
console.log('  ✓ 语法通过')
