// 修正三处 CRLF 不匹配的替换
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

// ---------- 1. 员工端：历史预览方法 ----------
edit('pages/staff/fitness/fitness.js', t => {
  if (t.includes('previewBodyImage(')) return t
  const anchor = `  previewReport() {`
  if (!t.includes(anchor)) throw new Error('找不到 previewReport')
  return t.replace(anchor, `  // 点历史记录：看当时保存的体测报告图
  previewBodyImage(e) {
    const src = e.currentTarget.dataset.src
    const date = e.currentTarget.dataset.date || ''
    if (!src) {
      wx.showToast({ title: (date ? date + ' ' : '') + '这条没有报告图', icon: 'none' })
      return
    }
    wx.previewImage({ current: src, urls: [src] })
  },

${anchor}`)
}, '员工端历史预览方法')

// ---------- 2. 资料页：bodyList 带 reportImage ----------
edit('pages/member/member.js', t => {
  if (t.includes('reportImage: b.reportImage')) return t
  const from = `          score: b.score == null ? '-' : b.score
        }))`
  const to = `          score: b.score == null ? '-' : b.score,
          reportImage: b.reportImage || ''
        }))`
  if (!t.includes(from)) throw new Error('找不到 bodyList 映射结尾')
  return t.replace(from, to)
}, '资料页历史带报告图字段')

// ---------- 3. 资料页：历史行可点开报告图 ----------
edit('pages/member/member.wxml', t => {
  if (t.includes('previewReport')) return t
  const from = `        <view wx:for="{{bodyList}}" wx:key="id" wx:if="{{showAllHistory || index < 5}}" class="list-item">
          <view class="grow">
            <view class="title-sm">{{item.date}}</view>`
  const to = `        <view wx:for="{{bodyList}}" wx:key="id" wx:if="{{showAllHistory || index < 5}}" class="list-item"
          data-src="{{item.reportImage}}" bindtap="previewReport">
          <view class="grow">
            <view class="title-sm">{{item.date}}<text wx:if="{{item.reportImage}}" class="tag orange">报告图</text></view>`
  if (!t.includes(from)) throw new Error('找不到资料页历史行')
  return t.replace(from, to)
}, '资料页历史可点开报告图')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['pages/staff/fitness/fitness.js', 'pages/member/member.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', MP + '/' + f])
  console.log('  ✓ 语法 ' + f)
}
