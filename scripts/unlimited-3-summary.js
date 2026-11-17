// 保存摘要：0 显示「不限」
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/index.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = `    res.json({ code: 0, data: { value, summary: '已保存：视频 ≤ ' + value.maxDuration + ' 秒 / ' + value.maxVideoMB + 'MB，最多 ' + value.maxCount + ' 个，合计 ≤ ' + value.maxTotalMB + 'MB，列表显示 ' + value.feedThumbs + ' 个' } })`
const to = `    const say = (v, unit) => (v > 0 ? v + ' ' + unit : '不限')
    res.json({
      code: 0,
      data: {
        value,
        summary: '已保存：时长 ' + say(value.maxDuration, '秒') +
          ' / 成品体积 ' + say(value.maxVideoMB, 'MB') +
          ' / 原视频 ' + say(value.maxRawVideoMB, 'MB') +
          '，最多 ' + value.maxCount + ' 个，合计 ' + say(value.maxTotalMB, 'MB') +
          '，列表显示 ' + value.feedThumbs + ' 个'
      }
    })`

if (t.includes("say(value.maxDuration")) {
  console.log('· 已是新版')
} else if (!t.includes(from)) {
  console.log('⚠ 未匹配摘要')
} else {
  t = t.replace(from, to)
  fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
  console.log('✓ 摘要支持不限')
}

require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')
