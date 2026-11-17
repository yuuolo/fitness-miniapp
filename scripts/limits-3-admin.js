// 管理页：新增「上传与展示限制」卡片（放在功能开关之后）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/public/admin.html'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

if (t.includes('mediaLimitsCard')) {
  console.log('· 已有该卡片')
  process.exit(0)
}

// ---------- 1. HTML 卡片 ----------
const anchor = `        <div class="card">
      <h2>首页布局 <span class="tag">按角色编排首页模块</span><span class="tag" id="layoutRoleTag">会员</span></h2>`

const card = `        <div class="card" id="mediaLimitsCard">
      <h2>上传与展示限制 <span class="tag">控制云存储与流量成本</span></h2>
      <div class="hint" style="margin-bottom:6px">
        改完立刻生效，小程序下次进入首页时自动读到新值，不需要重新发布。
        视频在拍照/选择时就按秒数限制，压缩后会再检查一次体积；照片按张数限制。
      </div>
      <div class="field">
        <label>视频最长秒数</label>
        <input id="lim-maxDuration" type="number" min="3" max="60" step="1" placeholder="15">
        <div class="hint">拍摄时就限制（3–60 秒）。超过这个时长的视频发不出去。</div>
      </div>
      <div class="field">
        <label>视频压缩后上限（MB）</label>
        <input id="lim-maxVideoMB" type="number" min="1" max="50" step="1" placeholder="12">
        <div class="hint">1–50 MB。压缩后仍然超过就拒绝发送；上传接口也会按这个值拦。</div>
      </div>
      <div class="field">
        <label>单条最多照片/视频数量</label>
        <input id="lim-maxCount" type="number" min="1" max="9" step="1" placeholder="9">
        <div class="hint">1–9 个。超过就不能再选。</div>
      </div>
      <div class="field">
        <label>单条合计大小上限（MB）</label>
        <input id="lim-maxTotalMB" type="number" min="4" max="200" step="1" placeholder="40">
        <div class="hint">4–200 MB。一条动态里所有照片+视频加起来不能超过这个值（不会小于视频上限）。</div>
      </div>
      <div class="field">
        <label>列表最多显示数量</label>
        <input id="lim-feedThumbs" type="number" min="1" max="9" step="1" placeholder="9">
        <div class="hint">1–9 个。友圈列表里每条最多显示几个，多出来的显示「+N」，详情页仍然能看全。</div>
      </div>
      <div class="actions" style="margin-top:14px">
        <button class="primary" id="limSaveBtn">保存限制</button>
        <button id="limReloadBtn">刷新</button>
        <button id="limDefaultBtn">恢复默认</button>
      </div>
      <div class="msg" id="limMsg"></div>
    </div>

`

if (!t.includes(anchor)) {
  console.log('⚠ 找不到首页布局卡片锚点')
  process.exit(1)
}
t = t.replace(anchor, card + anchor)
done.push('新增卡片 HTML')

// ---------- 2. JS：读取/保存 ----------
const jsAnchor = `  function showMsg(el, text, kind) {`
if (!t.includes(jsAnchor)) {
  console.log('⚠ 找不到 showMsg 锚点')
  process.exit(1)
}

const js = `  // ---------- 上传与展示限制 ----------
  var LIM_FIELDS = ['maxDuration', 'maxVideoMB', 'maxCount', 'maxTotalMB', 'feedThumbs']
  var limDefaults = null

  function fillLimits(value) {
    LIM_FIELDS.forEach(function (k) {
      var el = document.getElementById('lim-' + k)
      if (el) el.value = value && value[k] !== undefined ? value[k] : ''
    })
  }

  function loadLimits() {
    var msg = document.getElementById('limMsg')
    return api('/api/admin/media-limits').then(function (data) {
      limDefaults = data.defaults
      fillLimits(data.value)
      showMsg(msg, '当前：视频 ≤ ' + data.value.maxDuration + ' 秒 / ' + data.value.maxVideoMB +
        'MB，最多 ' + data.value.maxCount + ' 个，合计 ≤ ' + data.value.maxTotalMB +
        'MB，列表显示 ' + data.value.feedThumbs + ' 个', 'ok')
    }).catch(function (e) {
      showMsg(msg, e.message, 'err')
    })
  }

  function saveLimits() {
    var msg = document.getElementById('limMsg')
    var value = {}
    LIM_FIELDS.forEach(function (k) {
      var el = document.getElementById('lim-' + k)
      if (el && el.value !== '') value[k] = Number(el.value)
    })
    var btn = document.getElementById('limSaveBtn')
    btn.disabled = true
    api('/api/admin/media-limits', { method: 'PUT', body: { value: value } }).then(function (data) {
      fillLimits(data.value)
      showMsg(msg, data.summary || '已保存', 'ok')
    }).catch(function (e) {
      showMsg(msg, e.message, 'err')
    }).then(function () {
      btn.disabled = false
    })
  }

  document.getElementById('limSaveBtn').onclick = saveLimits
  document.getElementById('limReloadBtn').onclick = loadLimits
  document.getElementById('limDefaultBtn').onclick = function () {
    if (!limDefaults) return
    fillLimits(limDefaults)
    showMsg(document.getElementById('limMsg'), '已填入默认值，记得点「保存限制」', 'info')
  }

${jsAnchor}`

t = t.replace(jsAnchor, js)
done.push('新增卡片 JS')

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))
