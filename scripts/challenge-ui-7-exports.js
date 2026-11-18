// module.exports 只暴露 action，常量不导出（避免被统计成 action）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/challenge.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = `module.exports = {
  createChallenge,
  pickReferee,
  respondChallenge,
  refereeRespond,
  submitChallengeVideo,
  judgeChallenge,
  challengeList,
  challengeDetail,
  challengeSummary,
  refereeOptions,
  // 供测试/内部使用
  STATUS_NAMES,
  RESULT_NAMES,
  ACCEPT_MS,
  VIDEO_MS,
  JUDGE_MS,
  REJUDGE_MS,
  MAX_ACTIVE
}`
const to = `module.exports = {
  createChallenge,
  pickReferee,
  respondChallenge,
  refereeRespond,
  submitChallengeVideo,
  judgeChallenge,
  challengeList,
  challengeDetail,
  challengeSummary,
  refereeOptions
}`

if (!t.includes(from)) {
  console.log('⚠ 未匹配导出块')
  process.exit(1)
}
t = t.replace(from, to)
fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 只导出 10 个 action')
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')
