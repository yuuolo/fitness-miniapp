// 修：页面路径要带文件名（pages/challenges/list/list），并补 challengeBadge
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const done = []

function edit(rel, fn, label) {
  const p = MP + '/' + rel
  let raw = fs.readFileSync(p, 'utf8')
  const CRLF = raw.includes('\r\n')
  let t = raw.replace(/\r\n/g, '\n')
  const before = t
  t = fn(t)
  if (t !== before) {
    fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
    done.push(label)
  } else {
    console.log('  [!] 无变化：' + label)
  }
}

// 1. app.json 页面路径
const appPath = MP + '/app.json'
const app = JSON.parse(fs.readFileSync(appPath, 'utf8'))
app.pages = app.pages.map(p => {
  if (p === 'pages/challenges/list') return 'pages/challenges/list/list'
  if (p === 'pages/challenges/new') return 'pages/challenges/new/new'
  if (p === 'pages/challenges/detail') return 'pages/challenges/detail/detail'
  return p
})
fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n')
console.log('✓ app.json 页面路径修正')
console.log('  ' + app.pages.filter(p => p.indexOf('challenge') >= 0).join('\n  '))

// 2. 所有跳转 URL
for (const rel of ['pages/mine/mine.js', 'pages/challenges/list/list.js', 'pages/challenges/new/new.js', 'pages/challenges/detail/detail.js', 'pages/staff/index/index.js']) {
  const p = MP + '/' + rel
  if (!fs.existsSync(p)) continue
  let raw = fs.readFileSync(p, 'utf8')
  const CRLF = raw.includes('\r\n')
  let t = raw.replace(/\r\n/g, '\n')
  const before = t
  t = t.split('/pages/challenges/list').join('/pages/challenges/list/list')
  t = t.split('/pages/challenges/new').join('/pages/challenges/new/new')
  t = t.split('/pages/challenges/detail').join('/pages/challenges/detail/detail')
  // 避免把已经修好的再重复加
  t = t.split('/list/list/list').join('/list/list')
  t = t.split('/new/new/new').join('/new/new')
  t = t.split('/detail/detail/detail').join('/detail/detail')
  if (t !== before) {
    fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
    done.push('URL 修正：' + rel)
  }
}

// 3. 我的页面：challengeBadge 数据 + 拉取
edit('pages/mine/mine.js', t => {
  if (t.includes('challengeBadge')) return t
  t = t.replace(
    `  data: {`,
    `  data: {
    challengeBadge: 0,`
  )
  // onShow 里拉一次挑战待办数
  t = t.replace(
    `  onShow() {`,
    `  onShow() {
    this.loadChallengeBadge()`
  )
  t = t.replace(
    `  goChallenges() {`,
    `  // 挑战待办红点
  loadChallengeBadge() {
    api.call('challengeSummary', {}, { silent: true }).then(r => {
      this.setData({ challengeBadge: (r && r.badge) || 0 })
    }, () => {})
  },

  goChallenges() {`
  )
  return t
}, '我的页面：challengeBadge')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', MP + '/pages/mine/mine.js'])
console.log('  ✓ 语法通过')
