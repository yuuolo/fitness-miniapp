// 文档：订阅统一入口
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/docs/挑战功能设计方案.md'
let t = fs.readFileSync(p, 'utf8')

if (t.includes('统一入口：我的 → 微信提醒')) {
  console.log('· 文档已更新')
  process.exit(0)
}

t = t.replace('### 6.2 会员怎么订阅', '### 6.2 会员怎么订阅（统一入口）')

const from = `在各页点订阅按钮 → 微信弹一次授权 → 同意记 1 张票：

- 友圈顶部：「🔔 有新视频提醒我」
- 竞赛页顶部：「🔔 竞赛有变化提醒我」
- 排行榜：「综合评分榜更新提醒」「力量榜更新提醒」`

const to = `**统一入口：我的 → 微信提醒**（各页面不再放订阅按钮）

- **一键订阅内容提醒**：一次点击同时授权「友圈新视频 / 竞赛动态 / 综合评分榜 / 力量排行榜」
  （两个排行榜共用同一个模板，所以 3 个模板一次授权覆盖 4 个话题）
- **挑战提醒**：同一页第二个按钮（有人挑战我 / 该我判了 / 判定结果）；
  也可以在发起挑战、应战、裁判接单时自动申请
- 页面显示每个话题还剩几条待发提醒，可单独清零`

if (!t.includes(from)) {
  console.log('⚠ 未匹配旧的订阅说明')
  process.exit(1)
}
t = t.replace(from, to)
fs.writeFileSync(p, t)
console.log('✓ 文档更新：统一订阅入口')
