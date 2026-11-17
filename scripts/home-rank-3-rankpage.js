// 排行榜页：支持 ?lift=score，并给综合评分榜加说明
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

// ---------- 1. rank.js ----------
edit('pages/rank/rank.js', t => {
  // onLoad 支持 ?lift=score
  if (!t.includes('onLoad(query)')) {
    t = t.replace(
      `  onShow() {
    features.ensure().then(f => {`,
      `  onLoad(query) {
    // 从首页「综合评分榜」入口进来时，带上 lift=score
    const lift = (query && query.lift) || ''
    if (lift) this.setData({ lift })
  },

  onShow() {
    features.ensure().then(f => {`
    )
  }
  return t
}, 'rank.js 支持 ?lift 参数')

// ---------- 2. rank.wxml：综合评分榜时隐藏周期/比法，换成评分说明 ----------
edit('pages/rank/rank.wxml', t => {
  // 周期切换：综合评分是当前快照，没有周期概念
  t = t.replace(
    `    <!-- 周期切换 -->
    <view class="date-bar">`,
    `    <!-- 周期切换（综合评分是当前快照，没有周期） -->
    <view wx:if="{{lift !== 'score'}}" class="date-bar">`
  )
  // 比法/周期说明卡
  t = t.replace(
    `    <view class="card">
      <view class="between">
        <text>排序方式</text>`,
    `    <view wx:if="{{lift === 'score'}}" class="card">
      <view class="between">
        <text>综合评分（满分 100）</text>
        <text class="tag">实时计算</text>
      </view>
      <view class="muted mt">评分 = 体脂率 40 + 相对力量 40 + 体重指数 20，缺项自动归一。
        相对力量要求卧推/深蹲/硬拉三项都录入，缺项最多 15 分。成绩一更新，排名立刻变化。</view>
    </view>

    <view wx:if="{{lift !== 'score'}}" class="card">
      <view class="between">
        <text>排序方式</text>`
  )
  return t
}, 'rank.wxml 综合评分榜说明')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', MP + '/pages/rank/rank.js'])
console.log('  ✓ 语法通过')
