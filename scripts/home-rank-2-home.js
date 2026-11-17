// 首页：快捷入口改为综合评分榜入口；排行榜预览改为「最近有更新的力量项目」
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

// ---------- 1. index.js ----------
edit('pages/index/index.js', t => {
  // data：补 rankUnit / rankNote / scoreRank
  t = t.replace(
    `    rankName: '卧推',`,
    `    rankName: '卧推',
    rankUnit: 'kg',
    rankNote: '',
    scoreRank: 0,`
  )

  // 排行榜预览：不写死卧推，交给服务端挑「最近有更新」的项目
  t = t.replace(
    `  loadRank() {
    return api.call('leaderboard', { lift: 'bench', metric: 'absolute' }, { silent: true }).then(r => {`,
    `  // 排行榜预览：不指定项目，服务端会挑「最近有成绩更新」的那一项
  loadRank() {
    return api.call('leaderboard', { period: 'week' }, { silent: true }).then(r => {`
  )
  t = t.replace(
    `      rankName: r.liftName`,
    `      rankName: r.liftName || '力量',
      rankUnit: r.unit || 'kg',
      rankNote: r.autoPicked ? '最近有更新' : ''`
  )

  // 雷达图那块：顺手拿到「综合评分榜」里我的名次
  t = t.replace(
    `  loadRadar() {`,
    `  // 综合评分榜里我的名次（给快捷入口显示）
  loadScoreRank() {
    return api.call('leaderboard', { lift: 'score' }, { silent: true }).then(r => {
      const me = r.me
      this.setData({ scoreRank: me ? me.rank : 0, scoreTop: (r.top || []).slice(0, 3) })
    }, () => {})
  },

  loadRadar() {`
  )
  t = t.replace(
    `    if (hasBlock.quick && feat.fitness !== false) this.loadRadar()`,
    `    if (hasBlock.quick && feat.fitness !== false) {
      this.loadRadar()
      if (feat.rank !== false) this.loadScoreRank()
    }`
  )

  // 快捷入口点排行榜：进综合评分榜
  t = t.replace(
    `  goRank() {
    wx.navigateTo({ url: '/pages/rank/rank' })
  },`,
    `  // 快捷入口的「排行榜」= 综合评分榜；预览模块的「查看全部」= 当前力量榜
  goRank() {
    wx.navigateTo({ url: '/pages/rank/rank?lift=score' })
  },

  goRankLift() {
    wx.navigateTo({ url: '/pages/rank/rank' })
  },`
  )
  return t
}, 'index.js 排行榜逻辑')

// ---------- 2. index.wxml ----------
edit('pages/index/index.wxml', t => {
  // 快捷入口：标题改成综合评分榜，副标题带我的名次
  t = t.replace(
    `          <view class="q-t">排行榜</view>
          <view class="muted">{{radarScore !== null ? '综合能力 ' + radarScore : '录一次体测就能看到'}}</view>`,
    `          <view class="q-t">综合评分榜</view>
          <view class="muted">{{radarScore !== null ? (scoreRank ? '我 ' + radarScore + ' 分 · 第 ' + scoreRank + ' 名' : '我 ' + radarScore + ' 分') : '录一次体测就能看到'}}</view>`
  )

  // 排行榜预览：标题带「最近有更新」，数值单位用服务端返回的
  t = t.replace(
    `          <text>{{rankName}}排行榜</text>
          <text class="muted" bindtap="goRank">查看全部 ›</text>`,
    `          <text>{{rankName}}排行榜<text wx:if="{{rankNote}}" class="tag">{{rankNote}}</text></text>
          <text class="muted" bindtap="goRankLift">查看全部 ›</text>`
  )
  t = t.replace(
    `        <view class="card" bindtap="goRank">`,
    `        <view class="card" bindtap="goRankLift">`
  )
  t = t.replace(
    `<text class="price">{{item.value}} {{item.unit || 'kg'}}</text>`,
    `<text class="price">{{item.value}} {{rankUnit}}</text>`
  )
  return t
}, 'index.wxml 排行榜展示')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', MP + '/pages/index/index.js'])
console.log('  ✓ 语法通过')
