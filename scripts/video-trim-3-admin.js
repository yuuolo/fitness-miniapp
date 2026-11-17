// 管理页：补一个「原视频（裁切前）上限」字段
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/public/admin.html'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

// 1. 输入框（放在视频压缩后上限后面）
const anchor = `      <div class="field">
        <label>单条最多照片/视频数量</label>`
const field = `      <div class="field">
        <label>原视频（裁切前）上限（MB）</label>
        <input id="lim-maxRawVideoMB" type="number" min="5" max="200" step="1" placeholder="60">
        <div class="hint">5–200 MB。视频超过时长上限时，会先把原视频传上来由服务器裁切；
          原视频超过这个体积就不建议自动裁切了（流量太大），会提示用户自己裁小再发。</div>
      </div>
      <div class="field">
        <label>单条最多照片/视频数量</label>`

if (!t.includes(anchor)) {
  console.log('⚠ 找不到数量字段锚点')
} else if (t.includes('lim-maxRawVideoMB')) {
  console.log('· 已有该字段')
} else {
  t = t.replace(anchor, field)
  done.push('新增原视频上限输入框')
}

// 2. LIM_FIELDS 加上新字段
t = t.replace(
  "var LIM_FIELDS = ['maxDuration', 'maxVideoMB', 'maxCount', 'maxTotalMB', 'feedThumbs']",
  "var LIM_FIELDS = ['maxDuration', 'maxVideoMB', 'maxRawVideoMB', 'maxCount', 'maxTotalMB', 'feedThumbs']"
)

// 3. 状态文案带上裁切信息
t = t.replace(
  "      showMsg(msg, '当前：视频 ≤ ' + data.value.maxDuration + ' 秒 / ' + data.value.maxVideoMB +\n        'MB，最多 ' + data.value.maxCount + ' 个，合计 ≤ ' + data.value.maxTotalMB +\n        'MB，列表显示 ' + data.value.feedThumbs + ' 个', 'ok')",
  "      showMsg(msg, '当前：视频 ≤ ' + data.value.maxDuration + ' 秒 / ' + data.value.maxVideoMB +\n        'MB（原视频 ≤ ' + data.value.maxRawVideoMB + 'MB 时自动裁切），最多 ' + data.value.maxCount +\n        ' 个，合计 ≤ ' + data.value.maxTotalMB + 'MB，列表显示 ' + data.value.feedThumbs + ' 个', 'ok')"
)

// 4. 保存摘要
t = t.replace(
  "summary: '已保存：视频 ≤ ' + value.maxDuration + ' 秒 / ' + value.maxVideoMB + 'MB，最多 ' + value.maxCount + ' 个，合计 ≤ ' + value.maxTotalMB + 'MB，列表显示 ' + value.feedThumbs + ' 个'",
  "summary: '已保存：视频 ≤ ' + value.maxDuration + ' 秒 / ' + value.maxVideoMB + 'MB（原视频 ≤ ' + value.maxRawVideoMB + 'MB 自动裁切），最多 ' + value.maxCount + ' 个，合计 ≤ ' + value.maxTotalMB + 'MB，列表显示 ' + value.feedThumbs + ' 个'"
)

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))
console.log('  已更新字段列表与文案')
