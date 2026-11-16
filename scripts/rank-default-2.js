// 排行榜页：显示「默认选中最近有变化的项目」提示
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'

function edit(rel, fn) {
  const p = MP + '/' + rel
  let raw = fs.readFileSync(p, 'utf8')
  const CRLF = raw.includes('\r\n')
  let t = raw.replace(/\r\n/g, '\n')
  const before = t
  t = fn(t)
  if (t !== before) {
    fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
    console.log('  ✓ ' + rel)
  } else {
    console.log('  [!] 无变化 ' + rel)
  }
}

// ---------- js ----------
edit('pages/rank/rank.js', t => {
  if (t.includes('autoNote')) return t
  t = t.replace(
    `    metric: 'absolute',
    board: null`,
    `    metric: 'absolute',
    board: null,
    autoNote: ''`
  )
  t = t.replace(
    `      this.setData({
        loaded: true,
        lifts: r.lifts,
        lift: r.lift,`,
    `      // 服务端没指定项目时会挑「最近有变化」的那一项，这里给个说明
      const autoNote = r.autoPicked ? ('默认显示最近有更新的「' + r.liftName + '」') : ''
      this.setData({
        loaded: true,
        lifts: r.lifts,
        lift: r.lift,
        autoNote,`
  )
  t = t.replace(
    `  pickLift(e) {
    if (this.data.lift === e.currentTarget.dataset.key) return
    this.setData({ lift: e.currentTarget.dataset.key })
    this.load()
  },`,
    `  pickLift(e) {
    if (this.data.lift === e.currentTarget.dataset.key) return
    // 手动选过项目后就不再提示「默认显示」
    this.setData({ lift: e.currentTarget.dataset.key, autoNote: '' })
    this.load()
  },`
  )
  return t
})

// ---------- wxml：tabs 下面加一行提示 ----------
edit('pages/rank/rank.wxml', t => {
  if (t.includes('autoNote')) return t
  const anchor = `    <!-- 周期切换 -->`
  if (!t.includes(anchor)) throw new Error('找不到周期切换锚点')
  return t.replace(
    anchor,
    `    <view wx:if="{{autoNote}}" class="auto-note">{{autoNote}}</view>

` + anchor
  )
})

// ---------- wxss ----------
edit('pages/rank/rank.wxss', t => {
  if (t.includes('.auto-note')) return t
  return t + `
/* 自动选中最近有变化项目的提示 */
.auto-note {
  font-size: 22rpx;
  color: var(--brand-strong);
  background: var(--brand-soft);
  border-radius: var(--r-pill);
  padding: 6rpx 18rpx;
  margin: 4rpx 0 12rpx 0;
  display: inline-block;
}
`
})

require('child_process').execFileSync(process.execPath, ['--check', MP + '/pages/rank/rank.js'])
console.log('  ✓ rank.js 语法通过')
