// 管理页：运动记录管理卡片（查询 + 删除）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/public/admin.html'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

if (t.includes('activityCard')) {
  console.log('· 已有运动记录卡片')
  process.exit(0)
}

// ---------- 1. HTML 卡片（放在「上传与展示限制」之前） ----------
const anchor = `        <div class="card" id="mediaLimitsCard">`
const card = `        <div class="card" id="activityCard">
      <h2>运动记录 <span class="tag">会员自己记的 / 教练代录的 / 设备导入的</span></h2>
      <div class="hint" style="margin-bottom:10px">
        会员在小程序里可以自己记录运动；这里能看到所有人的记录，可以按会员、日期、类型筛选。
        录错的可以直接删除。
      </div>
      <div class="field">
        <label>搜索（昵称 / 手机号 / openid）</label>
        <input id="actKeyword" placeholder="留空看全部">
      </div>
      <div class="field">
        <label>日期范围</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="actFrom" type="date" style="flex:1">
          <span style="color:var(--muted)">~</span>
          <input id="actTo" type="date" style="flex:1">
        </div>
      </div>
      <div class="field">
        <label>运动类型</label>
        <select id="actType">
          <option value="">全部类型</option>
          <option value="walk">步行</option>
          <option value="run">跑步</option>
          <option value="cycling">骑行</option>
          <option value="swim">游泳</option>
          <option value="strength">力量训练</option>
          <option value="class">团课</option>
          <option value="other">其他</option>
        </select>
      </div>
      <div class="actions" style="margin-top:12px">
        <button class="primary" id="actSearchBtn">查询</button>
        <button id="actReloadBtn">刷新</button>
      </div>
      <div class="msg" id="actMsg"></div>
      <div class="mx-wrap" id="actList"></div>
    </div>

`
if (!t.includes(anchor)) {
  console.log('⚠ 找不到卡片锚点')
  process.exit(1)
}
t = t.replace(anchor, card + anchor)
done.push('新增运动记录卡片 HTML')

// ---------- 2. JS ----------
const jsAnchor = `  // ---------- 上传与展示限制 ----------`
const js = `  // ---------- 运动记录管理 ----------
  function renderActivity(rows, total) {
    var box = document.getElementById('actList')
    if (!rows.length) {
      box.innerHTML = '<div class="hint">没有符合条件的记录</div>'
      return
    }
    var head = '<tr><th>会员</th><th>日期</th><th>类型</th><th>明细</th><th>来源</th><th></th></tr>'
    var body = rows.map(function (r) {
      var parts = []
      if (Number(r.steps) > 0) parts.push(r.steps + ' 步')
      if (Number(r.distance) > 0) parts.push(r.distance + ' 公里')
      if (Number(r.duration) > 0) parts.push(r.duration + ' 分钟')
      if (Number(r.calories) > 0) parts.push(r.calories + ' 千卡')
      return '<tr>' +
        '<td>' + esc(r.name) + '</td>' +
        '<td>' + esc(r.date) + '</td>' +
        '<td>' + esc(r.typeName) + '</td>' +
        '<td>' + esc(parts.join(' · ') || '-') + '</td>' +
        '<td>' + esc(r.source) + '</td>' +
        '<td><button class="mini danger" data-act-del="' + esc(r.id) + '" data-act-name="' +
          esc(r.name + ' ' + r.date + ' ' + r.typeName) + '">删除</button></td>' +
        '</tr>'
    }).join('')
    box.innerHTML = '<table class="mx"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>' +
      '<div class="hint" style="margin-top:6px">共 ' + total + ' 条，显示 ' + rows.length + ' 条</div>'
  }

  function loadActivity() {
    var msg = document.getElementById('actMsg')
    var q = []
    var kw = document.getElementById('actKeyword').value.trim()
    var from = document.getElementById('actFrom').value
    var to = document.getElementById('actTo').value
    var type = document.getElementById('actType').value
    if (kw) q.push('keyword=' + encodeURIComponent(kw))
    if (from) q.push('from=' + encodeURIComponent(from))
    if (to) q.push('to=' + encodeURIComponent(to))
    if (type) q.push('type=' + encodeURIComponent(type))
    q.push('limit=200')
    showMsg(msg, '加载中…', 'info')
    return api('/api/admin/activity?' + q.join('&')).then(function (data) {
      renderActivity(data.rows || [], data.total || 0)
      showMsg(msg, '已加载 ' + (data.rows || []).length + ' 条', 'ok')
    }).catch(function (e) {
      showMsg(msg, e.message, 'err')
    })
  }

  function deleteActivity(id, name) {
    if (!confirm('确定删除「' + name + '」这条运动记录吗？')) return
    var msg = document.getElementById('actMsg')
    api('/api/admin/activity', { method: 'DELETE', body: { id: id } }).then(function () {
      showMsg(msg, '已删除：' + name, 'ok')
      return loadActivity()
    }).catch(function (e) {
      showMsg(msg, e.message, 'err')
    })
  }

  document.getElementById('actSearchBtn').onclick = loadActivity
  document.getElementById('actReloadBtn').onclick = loadActivity
  document.getElementById('actList').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act-del]')
    if (!btn) return
    deleteActivity(btn.getAttribute('data-act-del'), btn.getAttribute('data-act-name'))
  })

${jsAnchor}`

if (!t.includes(jsAnchor)) {
  console.log('⚠ 找不到 JS 锚点')
  process.exit(1)
}
t = t.replace(jsAnchor, js)
done.push('新增运动记录卡片 JS')

// ---------- 3. 登录后一起加载 ----------
t = t.split("Promise.all([loadStatus(), loadStorage(), loadFeatures(), loadLifts(), loadLayout(), loadLimits()])")
  .join("Promise.all([loadStatus(), loadStorage(), loadFeatures(), loadLifts(), loadLayout(), loadLimits(), loadActivity()])")
done.push('登录后加载运动记录')

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))
