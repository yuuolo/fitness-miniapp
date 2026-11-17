// 管理页：排行榜项目支持「编辑」（改名 / 比法 / 排序）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/public/admin.html'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

if (t.includes('data-edit=')) {
  console.log('· 已有编辑功能')
  process.exit(0)
}

// ---------- 1. 卡片说明补一句 ----------
t = t.replace(
  `        排行榜按这里的项目排名。可以新增项目（如「农夫行走」），也可以把用不上的隐藏——
        隐藏后排行榜不再显示，历史成绩仍保留。<br>`,
  `        排行榜按这里的项目排名。可以新增项目（如「农夫行走」），也可以把用不上的隐藏——
        隐藏后排行榜不再显示，历史成绩仍保留；点「编辑」可以改名称、比法和排序。<br>`
)
done.push('卡片说明')

// ---------- 2. renderLifts：加编辑按钮与编辑表单 ----------
const fromRender = `    $('liftList').innerHTML = (data.items || []).map(function (it) {
      var delBtn = it.deletable
        ? '<button data-del="' + esc(it.key) + '">删除</button>'
        : '<button data-del="' + esc(it.key) + '" disabled title="' + esc(it.deleteHint) + '">删除</button>'
      var hint = it.deletable ? '' : '<div class="d" style="color:#d29922">不可删除：' + esc(it.deleteHint) + '</div>'
      return '<div class="feat">' +
        '<div class="grow">' +
        '<div class="name">' + esc(it.name) +
        '<span class="badge ' + (it.enabled ? 'on' : 'off') + '">' + (it.enabled ? '启用' : '已隐藏') + '</span>' +
        (it.deletable ? '' : '<span class="badge">受保护</span>') +
        '</div>' +
        '<div class="d">' + esc(it.metricName) + ' · 单位 ' + esc(it.unit) + ' · 排序 ' + esc(it.sort) + '</div>' +
        hint +
        '</div>' +
        '<div class="row" style="gap:8px">' +
        '<button data-toggle="' + esc(it.key) + '">' + (it.enabled ? '隐藏' : '启用') + '</button>' +
        delBtn +
        '</div>' +
        '</div>'
    }).join('')`

const toRender = `    $('liftList').innerHTML = (data.items || []).map(function (it) {
      // 编辑态：直接在这一行展开表单
      if (editingLiftKey === it.key) {
        var metricOpts = (data.metrics || []).map(function (m) {
          return '<option value="' + esc(m.key) + '"' + (m.key === it.metric ? ' selected' : '') + '>' +
            esc(m.name) + '（' + esc(m.unit) + '）</option>'
        }).join('')
        var locked = it.key === 'bench' || it.key === 'squat' || it.key === 'deadlift'
        return '<div class="feat" style="display:block">' +
          '<div class="field"><label>项目名称</label>' +
          '<input id="editLiftName" maxlength="12" value="' + esc(it.name) + '"></div>' +
          '<div class="field"><label>怎么比</label>' +
          '<select id="editLiftMetric"' + (locked ? ' disabled title="评分标准项，比法固定为估算 1RM"' : '') + '>' +
          metricOpts + '</select></div>' +
          '<div class="field"><label>排序（小的在前）</label>' +
          '<input id="editLiftSort" type="number" step="10" value="' + esc(it.sort) + '"></div>' +
          (locked ? '<div class="hint">卧推/深蹲/硬拉是身体评分用的标准项，只能改名称和排序。</div>' : '') +
          '<div class="actions" style="margin-top:10px">' +
          '<button class="primary" data-edit-save="' + esc(it.key) + '">保存</button>' +
          '<button data-edit-cancel="1">取消</button>' +
          '</div></div>'
      }
      var delBtn = it.deletable
        ? '<button data-del="' + esc(it.key) + '">删除</button>'
        : '<button data-del="' + esc(it.key) + '" disabled title="' + esc(it.deleteHint) + '">删除</button>'
      var hint = it.deletable ? '' : '<div class="d" style="color:#d29922">不可删除：' + esc(it.deleteHint) + '</div>'
      return '<div class="feat">' +
        '<div class="grow">' +
        '<div class="name">' + esc(it.name) +
        '<span class="badge ' + (it.enabled ? 'on' : 'off') + '">' + (it.enabled ? '启用' : '已隐藏') + '</span>' +
        (it.deletable ? '' : '<span class="badge">受保护</span>') +
        '</div>' +
        '<div class="d">' + esc(it.metricName) + ' · 单位 ' + esc(it.unit) + ' · 排序 ' + esc(it.sort) + '</div>' +
        hint +
        '</div>' +
        '<div class="row" style="gap:8px">' +
        '<button data-edit="' + esc(it.key) + '">编辑</button>' +
        '<button data-toggle="' + esc(it.key) + '">' + (it.enabled ? '隐藏' : '启用') + '</button>' +
        delBtn +
        '</div>' +
        '</div>'
    }).join('')`

if (!t.includes(fromRender)) {
  console.log('⚠ 未匹配 renderLifts 主体')
  process.exit(1)
}
t = t.replace(fromRender, toRender)
done.push('renderLifts 编辑表单')

// ---------- 3. 事件绑定 ----------
const anchor = `    Array.prototype.forEach.call($('liftList').querySelectorAll('[data-toggle]'), function (btn) {`

const events = `    Array.prototype.forEach.call($('liftList').querySelectorAll('[data-edit]'), function (btn) {
      btn.addEventListener('click', function () {
        editingLiftKey = this.getAttribute('data-edit')
        renderLifts(liftData)
      })
    })

    Array.prototype.forEach.call($('liftList').querySelectorAll('[data-edit-cancel]'), function (btn) {
      btn.addEventListener('click', function () {
        editingLiftKey = ''
        renderLifts(liftData)
      })
    })

    Array.prototype.forEach.call($('liftList').querySelectorAll('[data-edit-save]'), function (btn) {
      btn.addEventListener('click', function () {
        var key = this.getAttribute('data-edit-save')
        var name = $('editLiftName').value.trim()
        var metricEl = $('editLiftMetric')
        var metric = metricEl && !metricEl.disabled ? metricEl.value : ''
        var sort = Number($('editLiftSort').value) || 999
        if (!name) return showMsg($('liftMsg'), '项目名称不能为空', 'err')
        var body = { key: key, name: name, sort: sort }
        // 比法在锁定时不传，服务端会保持原值
        if (metric) body.metric = metric
        var saveBtn = this
        saveBtn.disabled = true
        api('/api/admin/lifts', { method: 'POST', body: body }).then(function () {
          editingLiftKey = ''
          showMsg($('liftMsg'), '已保存：' + name, 'ok')
          return loadLifts()
        }).catch(function (e) {
          showMsg($('liftMsg'), e.message, 'err')
        }).then(function () {
          saveBtn.disabled = false
        })
      })
    })

${anchor}`

if (!t.includes(anchor)) {
  console.log('⚠ 未匹配事件绑定锚点')
  process.exit(1)
}
t = t.replace(anchor, events)
done.push('编辑事件')

// ---------- 4. editingLiftKey 变量 ----------
const varAnchor = `  function renderLifts(data) {`
if (!t.includes('var editingLiftKey')) {
  t = t.replace(varAnchor, `  var editingLiftKey = ''

${varAnchor}`)
  done.push('编辑态变量')
}

// ---------- 5. 重新加载时清空编辑态 ----------
t = t.replace(
  `  function loadLifts() {`,
  `  function loadLifts() {
    // 重新拉数据时保留编辑态（除非已保存/取消）`
)

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))
