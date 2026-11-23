// 允许「待判决」阶段继续补传视频（双方已交齐后仍可追加，最多 9 段）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/challenge.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = `  if (!['accepted', 'waiting_referee'].includes(c.status)) {
    fail('现在不是交视频的阶段（' + (STATUS_NAMES[c.status] || c.status) + '）')
  }`

const to = `  // 待判决（双方都已交齐）时也允许继续补传，方便补齐多段视频
  if (!['accepted', 'waiting_referee', 'ready'].includes(c.status)) {
    fail('现在不是交视频的阶段（' + (STATUS_NAMES[c.status] || c.status) + '）')
  }`

if (!t.includes(from)) {
  console.log('⚠ 未匹配状态判断')
  process.exit(1)
}
t = t.replace(from, to)

// 已在待判决时不要重置裁判截止时间
const from2 = `  if (counts >= 2) {
    await query(
      "update challenges set status = 'ready', judge_by = $2 where id = $1",
      [c._id, now + JUDGE_MS]
    )
    const ready = await loadChallenge(c._id)
    notifyJudgeReady(ready).catch(() => {})
  }
  return detailById(c._id, me)`
const to2 = `  if (counts >= 2) {
    if (c.status === 'ready') {
      // 已经是待判决：只补视频，不重置裁判倒计时
      await query("update challenges set status = 'ready' where id = $1", [c._id])
    } else {
      await query(
        "update challenges set status = 'ready', judge_by = $2 where id = $1",
        [c._id, now + JUDGE_MS]
      )
      const ready = await loadChallenge(c._id)
      notifyJudgeReady(ready).catch(() => {})
    }
  }
  return detailById(c._id, me)`

if (!t.includes(from2)) {
  console.log('⚠ 未匹配 ready 逻辑')
  process.exit(1)
}
t = t.replace(from2, to2)

// 前端可上传标记也要覆盖 ready
t = t.replace(
  `    canSubmitVideo: ['accepted', 'waiting_referee'].includes(c.status) &&`,
  `    canSubmitVideo: ['accepted', 'waiting_referee', 'ready'].includes(c.status) &&`
)
t = t.replace(
  `    canProxyVideo: ['accepted', 'waiting_referee'].includes(c.status) &&`,
  `    canProxyVideo: ['accepted', 'waiting_referee', 'ready'].includes(c.status) &&`
)

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 待判决阶段允许补传视频')
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')
