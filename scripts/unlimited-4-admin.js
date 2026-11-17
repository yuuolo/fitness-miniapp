// 管理页：输入框允许 0（不限），范围文案放开
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/public/admin.html'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

function swap(from, to, label) {
  if (!t.includes(from)) {
    console.log('  [!] 未匹配：' + label)
    return
  }
  t = t.replace(from, to)
  done.push(label)
}

// 抬头说明
swap(
  `      <div class="hint" style="margin-bottom:6px">
        改完立刻生效，小程序下次进入首页时自动读到新值，不需要重新发布。
        视频在拍照/选择时就按秒数限制，压缩后会再检查一次体积；照片按张数限制。
      </div>`,
  `      <div class="hint" style="margin-bottom:6px">
        改完立刻生效，小程序下次进入首页时自动读到新值，不需要重新发布。<br>
        <b>下面填 0 表示「不限」</b>——时长、成品体积、原视频体积、合计体积都可以设成不限；
        超过 60 秒、超过 200MB 也都可以直接填（受手机与网络实际能力限制）。
      </div>`,
  '抬头说明'
)

// 各项输入框：min 改 0，range 放开
swap(
  `<input id="lim-maxDuration" type="number" min="3" max="60" step="1" placeholder="15">
        <div class="hint">拍摄时就限制（3–60 秒）。超过这个时长的视频发不出去。</div>`,
  `<input id="lim-maxDuration" type="number" min="0" max="3600" step="1" placeholder="15">
        <div class="hint">0 = 不限；可以填 60、120、300…（最长 3600 秒）。超过这个时长的视频，
          会提示上传者「只保留前 N 秒」并由服务器裁切。</div>`,
  '时长输入'
)

swap(
  `<input id="lim-maxVideoMB" type="number" min="1" max="50" step="1" placeholder="12">
        <div class="hint">1–50 MB。视频超过时长上限被裁切后，若成品仍然大于这个值，
          服务器会按目标体积再压一次（先算目标码率，不够就再降一档）。</div>`,
  `<input id="lim-maxVideoMB" type="number" min="0" max="2000" step="1" placeholder="12">
        <div class="hint">0 = 不限；上限 2000 MB。超过这个体积的成品会被拒绝（或被自动压到该体积内）。</div>`,
  '成品体积输入'
)

swap(
  `<input id="lim-maxRawVideoMB" type="number" min="5" max="200" step="1" placeholder="60">
        <div class="hint">5–200 MB。视频超过时长上限时，会先把原视频传上来由服务器裁切；
          原视频超过这个体积就不建议自动裁切了（流量太大），会提示用户自己裁小再发。</div>`,
  `<input id="lim-maxRawVideoMB" type="number" min="0" max="2000" step="1" placeholder="60">
        <div class="hint">0 = 不限；上限 2000 MB（服务端另有 1GB 物理上限）。超时长视频需要先把原视频传上来裁切，
          原视频超过这个体积会提示用户自己裁小再发（省流量）。</div>`,
  '原视频上限输入'
)

swap(
  `<input id="lim-maxTotalMB" type="number" min="4" max="200" step="1" placeholder="40">
        <div class="hint">4–200 MB。一条动态里所有照片+视频加起来不能超过这个值（不会小于视频上限）。</div>`,
  `<input id="lim-maxTotalMB" type="number" min="0" max="2000" step="1" placeholder="40">
        <div class="hint">0 = 不限；上限 2000 MB。一条动态里所有照片+视频加起来不能超过这个值。</div>`,
  '合计体积输入'
)

// 状态行：不限显示「不限」
swap(
  `      showMsg(msg, '当前：视频 ≤ ' + data.value.maxDuration + ' 秒 / ' + data.value.maxVideoMB +
        'MB（原视频 ≤ ' + data.value.maxRawVideoMB + 'MB 时自动裁切），最多 ' + data.value.maxCount +
        ' 个，合计 ≤ ' + data.value.maxTotalMB + 'MB，列表显示 ' + data.value.feedThumbs + ' 个', 'ok')`,
  `      var say = function (v, unit) { return v > 0 ? v + ' ' + unit : '不限（0）' }
      showMsg(msg, '当前：时长 ' + say(data.value.maxDuration, '秒') +
        ' / 成品 ' + say(data.value.maxVideoMB, 'MB') +
        ' / 原视频 ' + say(data.value.maxRawVideoMB, 'MB') +
        '，最多 ' + data.value.maxCount + ' 个，合计 ' + say(data.value.maxTotalMB, 'MB') +
        '，列表显示 ' + data.value.feedThumbs + ' 个', 'ok')`,
  '状态行'
)

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))
