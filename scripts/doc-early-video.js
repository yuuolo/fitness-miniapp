// 文档：更新挑战流程（双方确认即可传视频）+ 订阅说明
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/docs/挑战功能设计方案.md'
let t = fs.readFileSync(p, 'utf8')

// 1. 流程
const oldFlow = `① 发起：选项目 + 比法 + 指定一名教练当主裁判（必选）→ 2 小时内等对方应战
② 裁判接受 / 拒绝；被挑战者可以否决赛判（否决后发起人重选裁判）
③ 被挑战者应战 / 拒绝（超时 2 小时 → 失效）
④ 双方各自上传 1 段视频（教练可代传），应战后 2 小时内必须交齐
⑤ 视频交齐后 2 小时内主裁判判定：谁胜 / 谁负 / 平局，可标记某方视频作弊
⑥ 判定理由对所有会员公开；判定后 3 小时内可改判（留痕）`

const newFlow = `① 发起：选项目 + 比法 + 指定一名教练当主裁判（必选）→ 2 小时内等对方应战
② 裁判接受 / 拒绝；被挑战者可以否决赛判（否决后发起人重选裁判）
③ 被挑战者应战 / 拒绝（超时 2 小时 → 失效）
④ **双方确认后立刻可以上传视频，不用等裁判接单**（应战后 2 小时内交齐）
⑤ 视频交齐后 2 小时内主裁判判定：谁胜 / 谁负 / 平局，可标记某方视频作弊
⑥ 判定理由对所有会员公开；判定后 3 小时内可改判（留痕）`

if (t.includes(oldFlow)) {
  t = t.replace(oldFlow, newFlow)
  console.log('✓ 流程已更新（双方确认即可传视频）')
}

// 2. 规则表补一条
const ruleAnchor = `| 4 | 改判窗口 | 判定后 3 小时内 |`
const ruleNew = `| 4 | 改判窗口 | 判定后 3 小时内 |
| 4.1 | 视频上传时机 | **双方确认后即可上传，不用等裁判接单** |`
if (t.includes(ruleAnchor) && !t.includes('4.1')) {
  t = t.replace(ruleAnchor, ruleNew)
  console.log('✓ 规则表补「视频上传时机」')
}

fs.writeFileSync(p, t)
