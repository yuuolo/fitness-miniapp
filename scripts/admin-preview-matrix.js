// 3) 管理页：加「预览模块 × 角色」开关矩阵 + 「添加模块」
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/public/admin.html'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

// ---------- 1. HTML：在 layoutList 之后插入矩阵与添加模块 ----------
if (!t.includes('id="previewMatrix"')) {
  const anchor = `      <div id="layoutList"></div>
`
  if (!t.includes(anchor)) throw new Error('找不到 layoutList')
  const html = `      <div id="layoutList"></div>

      <div class="hint" style="margin-top:16px">
        预览模块单独开关（每个角色独立，改完点「保存布局」生效）
      </div>
      <div id="previewMatrix" class="mx-wrap"></div>

      <div class="row" style="margin-top:14px">
        <div class="field">
          <label>添加模块</label>
          <select id="blockAddSelect"></select>
        </div>
        <div class="field">
          <label>&nbsp;</label>
          <button id="blockAddBtn">添加到当前角色</button>
        </div>
      </div>
`
  t = t.replace(anchor, html)
  done.push('HTML：矩阵 + 添加模块')
}

// ---------- 2. CSS ----------
if (!t.includes('.mx-wrap')) {
  const anchor = `  .layout-empty { color: var(--muted); font-size: 13px; padding: 12px 0; }`
  if (!t.includes(anchor)) throw new Error('找不到 layout-empty 样式')
  const css = `${anchor}
  /* 预览模块 × 角色 开关矩阵 */
  .mx-wrap { margin: 10px 0 4px; }
  .mx { width: 100%; border-collapse: collapse; font-size: 13px; }
  .mx th, .mx td { padding: 8px 6px; text-align: center; border-bottom: 1px dashed var(--line); }
  .mx th:first-child, .mx td:first-child { text-align: left; color: var(--muted); font-weight: 400; }
  .mx th { color: var(--muted); font-weight: 500; }
  .mx .mini.on { border-color: var(--accent); color: #ffb59b; background: rgba(233,96,58,.14); }`
  t = t.replace(anchor, css)
  done.push('CSS：矩阵样式')
}

// ---------- 3. JS：渲染与交互 ----------
if (!t.includes('renderPreviewMatrix')) {
  const anchor = `  function renderLayout(data) {`
  if (!t.includes(anchor)) throw new Error('找不到 renderLayout')
  const js = `  // ---------- 预览模块 × 角色 开关矩阵 ----------
  var PREVIEW_TYPES = ['rank', 'competitions', 'moments']

  function ensureBlock(role, type) {
    var arr = blocksOf(role)
    var idx = -1
    for (var i = 0; i < arr.length; i++) if (arr[i].type === type) { idx = i; break }
    if (idx >= 0) return arr[idx]
    var tm = typeMeta(type) || {}
    var b = { id: type, type: type, title: tm.name || type, desc: tm.desc || '', enabled: true }
    arr.push(b)
    return b
  }

  function renderPreviewMatrix() {
    var meta = needMeta()
    var roles = meta.roles || []
    var head = '<tr><th>模块</th>' + roles.map(function (r) { return '<th>' + esc(r.name) + '</th>' }).join('') + '</tr>'
    var body = PREVIEW_TYPES.map(function (type) {
      var tm = typeMeta(type) || {}
      var cells = roles.map(function (r) {
        var arr = blocksOf(r.key) || []
        var b = null
        for (var i = 0; i < arr.length; i++) if (arr[i].type === type) { b = arr[i]; break }
        var label = b ? (b.enabled ? '显示' : '已隐藏') : '未添加'
        var cls = 'mini' + (b && b.enabled ? ' on' : '')
        return '<td><button class="' + cls + '" data-pv-role="' + r.key + '" data-pv-type="' + type + '">' + label + '</button></td>'
      }).join('')
      return '<tr><td>' + esc(tm.name || type) + '</td>' + cells + '</tr>'
    }).join('')

    $('previewMatrix').innerHTML = '<table class="mx"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>'

    Array.prototype.forEach.call($('previewMatrix').querySelectorAll('[data-pv-role]'), function (btn) {
      btn.addEventListener('click', function () {
        var role = this.getAttribute('data-pv-role')
        var type = this.getAttribute('data-pv-type')
        var b = ensureBlock(role, type)
        b.enabled = !b.enabled
        layoutData.roles[role] = blocksOf(role)
        renderPreviewMatrix()
        renderLayoutList()
        markDirty(true)
        showMsg($('layoutMsg'),
          '「' + (typeMeta(type) || {}).name + '」在「' + roleName(role) + '」里已' + (b.enabled ? '显示' : '隐藏') + '，记得点「保存布局」',
          'info')
      })
    })
  }

  function renderBlockAdd() {
    var meta = needMeta()
    var cur = blocksOf(currentRole) || []
    var used = cur.map(function (b) { return b.type })
    var opts = (meta.blocks || []).filter(function (b) { return used.indexOf(b.type) < 0 })
    $('blockAddSelect').innerHTML = opts.length
      ? opts.map(function (b) { return '<option value="' + esc(b.type) + '">' + esc(b.name) + ' — ' + esc(b.desc) + '</option>' }).join('')
      : '<option value="">（该角色已包含全部模块）</option>'
  }

  function renderLayout(data) {`
  t = t.replace(anchor, js)
  done.push('JS：矩阵渲染 + 添加模块')

  // renderLayout 里补调用
  t = t.replace(
    `    renderRoles()
    renderLayoutList()
    markDirty(false)`,
    `    renderRoles()
    renderLayoutList()
    renderPreviewMatrix()
    renderBlockAdd()
    markDirty(false)`
  )

  // renderLayoutList 末尾补 renderBlockAdd（切换角色/拖拽后刷新可选模块）
  t = t.replace(
    `    Array.prototype.forEach.call($('layoutList').querySelectorAll('[data-act]'), function (btn) {`,
    `    renderPreviewMatrix()
    renderBlockAdd()

    Array.prototype.forEach.call($('layoutList').querySelectorAll('[data-act]'), function (btn) {`
  )

  // 添加模块按钮
  const addAnchor = `  $('layoutSaveBtn').addEventListener('click', function () {`
  if (!t.includes(addAnchor)) throw new Error('找不到 layoutSaveBtn')
  const addJs = `  $('blockAddBtn').addEventListener('click', function () {
    var type = $('blockAddSelect').value
    if (!type) return showMsg($('layoutMsg'), '当前角色已经包含全部模块了', 'info')
    var arr = blocksOf(currentRole)
    var tm = typeMeta(type) || {}
    arr.push({ id: type, type: type, title: tm.name || type, desc: tm.desc || '', enabled: true })
    layoutData.roles[currentRole] = arr
    renderLayoutList()
    markDirty(true)
    showMsg($('layoutMsg'), '已把「' + (tm.name || type) + '」添加到「' + roleName(currentRole) + '」，记得点「保存布局」', 'info')
  })

${addAnchor}`
  t = t.replace(addAnchor, addJs)
  done.push('JS：添加模块按钮')
}

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))
