// 2) 前端：指标对比（最新 vs 上一次）+ 点指标进历史曲线页
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

// ---------- 1. fitness.js：生成对比数据 + 跳转 ----------
edit('pages/fitness/fitness.js', t => {
  if (t.includes('buildCompare')) return t
  // 用于判断「变好还是变差」：大部分指标越低越好，肌肉/水分/代谢越高越好
  t = t.replace(
    `const SEG_META = [`,
    `// 指标好坏方向：-1 越低越好，1 越高越好，0 中性（不标颜色）
const METRIC_DIR = {
  weight: -1, bodyFat: -1, fatMass: -1, visceral: -1, bmi: -1, waistHipRatio: -1,
  bodyAge: -1, heartRate: 0,
  muscle: 1, muscleRate: 1, protein: 1, water: 1, boneMass: 1,
  skeletalMuscle: 1, bmr: 1, fatFreeMass: 1, score: 1
}

function round1(v) {
  return Math.round(Number(v) * 10) / 10
}

// 最新一条 vs 上一次「有该指标」的记录
function buildCompare(history) {
  const list = history || []
  if (!list.length) return []
  const latest = list[0]
  const out = []
  for (const m of METRICS) {
    const now = latest[m.key]
    if (now == null || now === '') continue
    const prevRec = list.slice(1).find(x => x[m.key] != null && x[m.key] !== '')
    const prev = prevRec ? prevRec[m.key] : null
    let delta = null
    let tone = 'flat'
    if (prev != null) {
      delta = round1(now - prev)
      const dir = METRIC_DIR[m.key] == null ? 0 : METRIC_DIR[m.key]
      if (delta === 0 || dir === 0) tone = 'flat'
      else tone = (delta > 0 ? 1 : -1) === dir ? 'good' : 'bad'
    }
    out.push({
      key: m.key,
      name: m.name,
      unit: m.unit,
      value: now,
      prev,
      prevDate: prevRec ? prevRec.date : '',
      delta,
      hasPrev: prev != null,
      deltaText: delta == null ? '' : (delta > 0 ? '+' : '') + delta,
      tone
    })
  }
  return out
}

const SEG_META = [`
  )
  // data 增加 compare
  t = t.replace(
    `    metrics: [], bestList: [], bodyList: [], actList: [],`,
    `    metrics: [], compare: [], compareHint: '', bestList: [], bodyList: [], actList: [],`
  )
  // load 里生成
  t = t.replace(
    `        bodyList: (f.bodyHistory || []).map(b => ({`,
    `        // 最近两次对比（按日期倒序，第一条是最新）
        compare: buildCompare(f.bodyHistory || []),
        compareHint: (f.bodyHistory || []).length > 1
          ? '左侧是最新（' + ((f.bodyHistory || [])[0] || {}).date + '），右侧上一次（' + ((f.bodyHistory || [])[1] || {}).date + '）'
          : '只有一次记录，再测一次就能对比',
        bodyList: (f.bodyHistory || []).map(b => ({`
  )
  // 跳转方法
  t = t.replace(
    `  goRank() {`,
    `  // 点某个指标 → 看它的历史曲线
  openMetric(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    wx.navigateTo({ url: '/pages/fitness-metric/fitness-metric?key=' + key })
  },

  goRank() {`
  )
  return t
}, 'fitness.js：对比数据 + 跳转')

// ---------- 2. fitness.wxml：指标卡改成对比样式 ----------
edit('pages/fitness/fitness.wxml', t => {
  if (t.includes('metric-cell')) return t
  return t.replace(
    `    <view wx:if="{{metrics.length}}" class="section-title">身体指标</view>
    <view wx:if="{{metrics.length}}" class="card">
      <view class="grid">
        <view wx:for="{{metrics}}" wx:key="key" class="grid-cell">
          <view class="grid-v">{{item.value}}<text wx:if="{{item.unit}}" class="grid-u">{{item.unit}}</text></view>
          <view class="muted">{{item.name}}</view>
        </view>
      </view>`,
    `    <view wx:if="{{compare.length}}" class="between section-title">
      <text>身体指标</text>
      <text class="muted">点指标看历史曲线 ›</text>
    </view>
    <view wx:if="{{compare.length}}" class="card">
      <view class="compare-hint muted">{{compareHint}}</view>
      <view class="metric-list">
        <view wx:for="{{compare}}" wx:key="key" class="metric-row" data-key="{{item.key}}" bindtap="openMetric">
          <view class="metric-name">{{item.name}}</view>
          <view class="metric-values">
            <text class="metric-now">{{item.value}}<text wx:if="{{item.unit}}" class="metric-u">{{item.unit}}</text></text>
            <text wx:if="{{item.hasPrev}}" class="metric-prev">{{item.prev}}<text wx:if="{{item.unit}}" class="metric-u">{{item.unit}}</text></text>
            <text wx:else class="metric-prev muted">—</text>
            <text wx:if="{{item.delta !== null}}" class="metric-delta {{item.tone}}">{{item.deltaText}}</text>
          </view>
          <text class="metric-arrow">›</text>
        </view>
      </view>`
  )
}, 'fitness.wxml：指标对比列表')

// ---------- 3. fitness.wxss：对比样式 ----------
edit('pages/fitness/fitness.wxss', t => {
  if (t.includes('.metric-row')) return t
  return t + `
/* 指标对比：最新（主色）vs 上一次（灰） */
.compare-hint { font-size: 23rpx; margin-bottom: 6rpx; }
.metric-list { margin-top: 4rpx; }
.metric-row {
  display: flex; align-items: center; gap: 12rpx;
  padding: 20rpx 0; border-bottom: 1rpx solid var(--line);
}
.metric-row:last-child { border-bottom: none; }
.metric-name { width: 168rpx; font-size: 27rpx; color: var(--ink); }
.metric-values { flex: 1; display: flex; align-items: baseline; gap: 16rpx; }
.metric-now { font-size: 32rpx; font-weight: 600; color: var(--brand-strong); }
.metric-prev { font-size: 26rpx; color: var(--muted); }
.metric-u { font-size: 22rpx; margin-left: 2rpx; }
.metric-delta { font-size: 24rpx; font-weight: 600; }
.metric-delta.good { color: #2e9e5b; }
.metric-delta.bad { color: #d9534f; }
.metric-delta.flat { color: var(--muted); }
.metric-arrow { color: var(--muted); font-size: 26rpx; }
`
}, 'fitness.wxss：对比样式')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', MP + '/pages/fitness/fitness.js'])
console.log('  ✓ 语法通过')
