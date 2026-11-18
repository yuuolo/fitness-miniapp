// subscribe.request 加超时保护：微信端没回调时也不能卡住主流程
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/utils/subscribe.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = `    if (!list.length) return null
    return new Promise(resolve => {
      wx.requestSubscribeMessage({
        tmplIds: list,
        success: res => resolve(res),
        fail: () => resolve(null)
      })
    })`

const to = `    if (!list.length) return null
    // 3 秒兜底：微信端没回调（模拟器 / 用户不点）也要继续走主流程
    return new Promise(resolve => {
      let done = false
      const finish = res => {
        if (done) return
        done = true
        resolve(res)
      }
      setTimeout(() => finish(null), 3000)
      try {
        wx.requestSubscribeMessage({
          tmplIds: list,
          success: res => finish(res),
          fail: () => finish(null)
        })
      } catch (e) {
        finish(null)
      }
    })`

if (t.includes('3 秒兜底')) {
  console.log('· 已有兜底')
} else if (!t.includes(from)) {
  console.log('⚠ 未匹配')
  process.exit(1)
} else {
  t = t.replace(from, to)
  fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('✓ 订阅授权加了 3 秒超时兜底')
}

require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
