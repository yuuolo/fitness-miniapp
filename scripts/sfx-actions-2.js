// sfx.js 扩展：保存 / 点赞 / 删除
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/utils/sfx.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

t = t.replace(
  `const SOURCES = {
  runAway: '/assets/sfx/run-away.wav',
  appear: '/assets/sfx/appear.wav'
}`,
  `const SOURCES = {
  // 欢迎栏小人
  runAway: '/assets/sfx/run-away.wav',
  appear: '/assets/sfx/appear.wav',
  // 操作反馈
  save: '/assets/sfx/save.wav',
  like: '/assets/sfx/like.wav',
  delete: '/assets/sfx/delete.wav'
}`
)

t = t.replace(
  `module.exports = {
  playRunAway: () => play('runAway'),
  playAppear: () => play('appear'),
  play
}`,
  `module.exports = {
  // 欢迎栏小人
  playRunAway: () => play('runAway'),
  playAppear: () => play('appear'),
  // 操作反馈：保存成功 / 点赞 / 删除确认
  playSave: () => play('save'),
  playLike: () => play('like'),
  playDelete: () => play('delete'),
  play
}`
)

fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ sfx.js 已扩展')
require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
