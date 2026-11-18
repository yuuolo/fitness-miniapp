// 竞赛页用的是 onShow，不是 onLoad → 把订阅方法插到 onShow 前
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/competitions/competitions.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

if (t.includes('subscribeCompetitions')) {
  console.log('· 已有订阅方法')
  process.exit(0)
}

const from = `  onShow() {`
const to = `  // 订阅「竞赛更新」微信提醒
  subscribeCompetitions() {
    subscribe.requestTopics(['competitions']).then(r => {
      const topics = (r && r.accepted) || []
      if (!topics.length) {
        wx.showToast({ title: '没订阅成功，可以稍后再试', icon: 'none' })
        return
      }
      this.setData({ subscribed: true })
      wx.showToast({ title: '订阅成功，竞赛有变化会通知你' })
    })
  },

  onShow() {`

if (!t.includes(from)) {
  console.log('⚠ 没找到 onShow')
  process.exit(1)
}
t = t.replace(from, to)
fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 竞赛页订阅方法已加')
require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
