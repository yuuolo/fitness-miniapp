// 3) 会员资料页显示报告图（可放大）+ 教练在会员详情页转发该会员资料
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

// ---------- A. 会员资料页：加体测报告图 ----------
edit('pages/member/member.wxml', t => {
  if (t.includes('reportImage')) return t
  const anchor = `    <!-- 最近运动 -->`
  if (!t.includes(anchor)) throw new Error('找不到最近运动锚点')
  const block = `    <!-- 体测报告图 -->
    <block wx:if="{{f && f.latestBody && f.latestBody.reportImage}}">
      <view class="section-title">体测报告</view>
      <view class="card">
        <image class="report" src="{{f.latestBody.reportImage}}" mode="widthFix"
          data-src="{{f.latestBody.reportImage}}" bindtap="previewReport" />
        <view class="muted mt-sm">点图片可以放大查看</view>
      </view>
    </block>

` + anchor
  return t.replace(anchor, block)
}, 'member.wxml 加报告图')

edit('pages/member/member.js', t => {
  if (t.includes('previewReport')) return t
  return t.replace(
    `  toggleHistory() {`,
    `  // 报告图全屏查看
  previewReport(e) {
    const src = (e && e.currentTarget && e.currentTarget.dataset.src) ||
      (this.data.f && this.data.f.latestBody && this.data.f.latestBody.reportImage)
    if (!src) return
    wx.previewImage({ current: src, urls: [src] })
  },

  toggleHistory() {`
  )
}, 'member.js 加 previewReport')

edit('pages/member/member.wxss', t => {
  if (t.includes('.report {')) return t
  return t + `
/* 体测报告图：完整显示，宽度撑满 */
.report {
  width: 100%;
  height: auto;
  display: block;
  border-radius: var(--r-sm);
  background: var(--fill);
}
`
}, 'member.wxss 加报告图样式')

// ---------- B. 教练：会员详情页转发 ----------
edit('pages/staff/member/member.wxml', t => {
  if (t.includes('open-type="share"')) return t
  const anchor = `    <view class="list-item" bindtap="goPublicProfile">`
  if (!t.includes(anchor)) throw new Error('找不到公开资料入口')
  const block = `    <view class="list-item" bindtap="shareHint">
      <view class="grow">
        <view>转发这份资料给朋友</view>
        <view class="muted">发到微信里，对方打开能看到 TA 的身体数据</view>
      </view>
      <button class="btn ghost sm" open-type="share">转发</button>
    </view>
` + anchor
  return t.replace(anchor, block)
}, 'staff/member.wxml 加转发入口')

edit('pages/staff/member/member.js', t => {
  if (t.includes('onShareAppMessage')) return t

  // onLoad 里开启分享菜单
  t = t.replace(
    `    this.setData({ isAdmin: q.admin === '1', manage: q.manage === '1' })`,
    `    this.setData({ isAdmin: q.admin === '1', manage: q.manage === '1' })
    // 允许右上角「···」转发这个会员的资料
    wx.showShareMenu({ menus: ['shareAppMessage'] })`
  )

  // 分享给朋友：指向公开的会员资料页
  return t.replace(
    `  // 看 TA 的公开资料页（只读，含和我的身体数据 PK）`,
    `  // 转发这个会员的资料给朋友（对方打开是公开资料页，看不到手机号）
  onShareAppMessage() {
    const m = this.data.member || {}
    const latest = m.latestBody || {}
    return {
      title: (m.nickName || '会员') + ' 的身体数据' +
        (latest.score != null ? ' · ' + latest.score + ' 分' : ''),
      path: '/pages/member/member?openid=' + encodeURIComponent(this.id || ''),
      imageUrl: latest.reportImage || ''
    }
  },

  // 点「转发这份资料」那一行时的提示（真正的转发走按钮的 open-type）
  shareHint() {
    wx.showToast({ title: '点右边的「转发」按钮', icon: 'none' })
  },

  // 看 TA 的公开资料页（只读，含和我的身体数据 PK）`
  )
}, 'staff/member.js 加分享')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['pages/member/member.js', 'pages/staff/member/member.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', MP + '/' + f])
  console.log('  ✓ 语法 ' + f)
}
