// 修正入口插入（去掉多余的隐藏块）
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

// 1) 身体数据页：把「最近运动」整段提到 wx:if 外面，标题右侧加记录入口
edit('pages/fitness/fitness.wxml', t => {
  if (t.includes('goActivity')) {
    // 若之前插过（带隐藏块），先清理
    t = t.replace(/\n  <view wx:if="\{\{actList\.length\}\}"[\s\S]{0,0}/, '')
  }
  const from = `  <block wx:if="{{actList.length}}">
    <view class="between section-title">
      <text>最近运动</text>
      <text class="muted">最近 {{actList.length}} 次</text>
    </view>`
  const to = `  <view class="between section-title">
    <text>最近运动</text>
    <text class="muted" bindtap="goActivity">＋ 记录运动 ›</text>
  </view>
  <view wx:if="{{!actList.length}}" class="card muted">还没有运动记录，点右上角「记录运动」记一条</view>
  <block wx:if="{{actList.length}}">`
  if (!t.includes(from)) {
    console.log('  [!] 身体数据页未匹配（可能已改过）')
    return t
  }
  return t.replace(from, to)
}, '身体数据页加记录入口')

// 2) 我的页面：算法说明上面加「记录运动」
edit('pages/mine/mine.wxml', t => {
  if (t.includes('goActivity')) return t
  const from = `      <view class="menu-item" bindtap="goManual">
        <view class="mi mi-book"></view><text class="grow">算法说明</text><text class="chevron">›</text>
      </view>`
  const to = `      <view wx:if="{{features.fitness !== false}}" class="menu-item" bindtap="goActivity">
        <view class="mi mi-flame"></view><text class="grow">记录运动</text><text class="chevron">›</text>
      </view>
      <view class="menu-item" bindtap="goManual">
        <view class="mi mi-book"></view><text class="grow">算法说明</text><text class="chevron">›</text>
      </view>`
  if (!t.includes(from)) {
    console.log('  [!] 我的页面未匹配')
    return t
  }
  return t.replace(from, to)
}, '我的页面加记录运动入口')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
