// 2) 报告图完整显示 + 点击放大 + 转发（会员端「我的身体数据」）
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

// ---------- wxml：报告图改成完整显示 + 可点击放大，并加转发卡片 ----------
edit('pages/fitness/fitness.wxml', t => {
  t = t.replace(
    `      <image wx:if="{{f.latestBody.reportImage}}" class="report" src="{{f.latestBody.reportImage}}" mode="aspectFill" />`,
    `      <image wx:if="{{f.latestBody.reportImage}}" class="report" src="{{f.latestBody.reportImage}}"
        mode="widthFix" data-src="{{f.latestBody.reportImage}}" bindtap="previewReport" />
      <view wx:if="{{f.latestBody.reportImage}}" class="muted mt-sm">点图片可以放大查看</view>`
  )

  // 底部加「转发给朋友」卡片
  if (!t.includes('转发给朋友')) {
    t = t.replace(
      `  <block wx:if="{{actList.length}}">`,
      `  <view wx:if="{{openid}}" class="card">
    <view class="muted">把这份身体数据发给朋友：点右上角「···」→ 转发，或点下面的按钮。</view>
    <button class="btn ghost block mt" open-type="share">转发给朋友</button>
    <view class="muted mt-sm">对方打开后能看到身体评分、指标和历史记录（不含手机号）。</view>
  </view>

  <block wx:if="{{actList.length}}">`
    )
  }
  return t
}, 'fitness.wxml 报告图 + 转发卡片')

// ---------- js：previewReport / 分享 / 记录 openid ----------
edit('pages/fitness/fitness.js', t => {
  if (t.includes('previewReport')) return t

  // data 增加 openid（分享链接要用）
  t = t.replace(
    '    hasBody: false, score: 0, scoreDetail: [],',
    '    hasBody: false, score: 0, scoreDetail: [], openid: \'\','
  )

  // load 里记录 openid
  t = t.replace(
    `      this.setData({
        loaded: true,
        f,`,
    `      this.setData({
        loaded: true,
        f,
        openid: f.openid || '',`
  )

  // 在文件末尾（Page 收尾前）追加方法：放大预览 + 分享
  t = t.replace(
    /\n\}\)\s*$/,
    `
  // 报告图：点击全屏查看（和看相册里的图一样）
  previewReport(e) {
    const src = (e && e.currentTarget && e.currentTarget.dataset.src) ||
      (this.data.f && this.data.f.latestBody && this.data.f.latestBody.reportImage)
    if (!src) return
    wx.previewImage({ current: src, urls: [src] })
  },

  // 转发身体数据给朋友
  onShareAppMessage() {
    const f = this.data.f || {}
    const latest = f.latestBody || {}
    const score = latest.score != null ? latest.score : ''
    return {
      title: (score !== '' ? '我的身体数据 · ' + score + ' 分' : '我的身体数据') +
        (latest.date ? '（' + latest.date + '）' : ''),
      path: '/pages/member/member?openid=' + encodeURIComponent(this.data.openid || ''),
      imageUrl: latest.reportImage || ''
    }
  },

  onShareTimeline() {
    const f = this.data.f || {}
    const latest = f.latestBody || {}
    return {
      title: '我的身体数据' + (latest.score != null ? ' · ' + latest.score + ' 分' : ''),
      query: 'openid=' + encodeURIComponent(this.data.openid || ''),
      imageUrl: latest.reportImage || ''
    }
  }
})
`
  )
  return t
}, 'fitness.js 放大 + 分享')

// 分享菜单（onShow 时开启）
edit('pages/fitness/fitness.js', t => {
  if (t.includes('showShareMenu')) return t
  return t.replace(
    `  onShow() {
    this.load()
  },`,
    `  onShow() {
    // 开启右上角「···」里的转发入口
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    this.load()
  },`
  )
}, 'fitness.js 开启分享菜单')

// ---------- wxss：报告图不再固定高度 ----------
edit('pages/fitness/fitness.wxss', t => {
  t = t.replace(
    `.report {
  width: 100%;
  height: 420rpx;`,
    `.report {
  width: 100%;
  height: auto;
  display: block;`
  )
  return t
}, 'fitness.wxss 报告图自适应高度')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', MP + '/pages/fitness/fitness.js'])
console.log('  ✓ 语法通过')
