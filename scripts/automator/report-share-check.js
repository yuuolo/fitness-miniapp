// 验证：报告图完整显示 + 点击放大 + 转发（会员端 & 教练端）
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  console.log('已连接')

  console.log('\n[1] 我的身体数据：报告图')
  await mp.reLaunch('/pages/fitness/fitness')
  await sleep(5000)
  const page = await mp.currentPage()
  const d = await page.data()
  console.log('  reportImage: ' + (d.f && d.f.latestBody && d.f.latestBody.reportImage ? '有' : '无'))
  console.log('  openid: ' + d.openid)

  const imgs = await page.$$('.report')
  console.log('  .report 图片数: ' + imgs.length)
  if (imgs.length === 1) {
    const s = await imgs[0].size()
    console.log('  渲染尺寸: ' + Math.round(s.width) + ' x ' + Math.round(s.height))
    if (s.height > s.width * 0.6) ok('报告图按比例完整显示（高度 ' + Math.round(s.height) + 'px，没有被压成固定高度）')
    else bad('报告图可能仍是固定高度裁切', Math.round(s.height) + 'px')
  } else bad('没有报告图元素')

  console.log('\n[2] 点图片放大（wx.previewImage）')
  const preview = await mp.evaluate(() => new Promise(resolve => {
    const p = getCurrentPages()[getCurrentPages().length - 1]
    const orig = wx.previewImage
    let called = null
    wx.previewImage = opts => { called = opts; wx.previewImage = orig }
    try {
      p.previewReport({ currentTarget: { dataset: { src: (p.data.f.latestBody || {}).reportImage } } })
    } catch (e) {
      resolve({ error: String(e && e.message) })
      return
    }
    setTimeout(() => {
      wx.previewImage = orig
      resolve(called ? { url: called.urls && called.urls[0], count: (called.urls || []).length } : { none: true })
    }, 300)
  }))
  console.log('  previewImage 调用: ' + JSON.stringify(preview))
  if (preview.url) ok('点击会调用 wx.previewImage 全屏查看')
  else bad('没有调用 previewImage', JSON.stringify(preview))

  console.log('\n[3] 会员转发自己的资料')
  const share = await mp.evaluate(() => {
    const p = getCurrentPages()[getCurrentPages().length - 1]
    if (typeof p.onShareAppMessage !== 'function') return { missing: true }
    return p.onShareAppMessage()
  })
  console.log('  分享内容: ' + JSON.stringify(share))
  if (share && share.path && share.path.indexOf('/pages/member/member?openid=') === 0) ok('分享链接指向公开资料页')
  else bad('分享链接不对')
  if (share && /身体数据/.test(share.title)) ok('分享标题: ' + share.title)
  else bad('分享标题不对', share && share.title)

  console.log('\n[4] 转发卡片里的按钮存在')
  const btns = await page.$$('button[open-type="share"]')
  console.log('  open-type=share 按钮数: ' + btns.length)
  if (btns.length >= 1) ok('页面上有「转发给朋友」按钮')
  else bad('没有转发按钮')

  console.log('\n[5] 教练端：会员详情页转发某个会员')
  await mp.reLaunch('/pages/index/index')
  await sleep(1500)
  const staff = await mp.navigateTo('/pages/staff/members/members')
  await sleep(3500)
  const rows = await staff.$$('.list-item')
  console.log('  会员列表: ' + rows.length + ' 条')
  if (!rows.length) { bad('会员列表为空'); await mp.disconnect(); process.exit(1) }
  await rows[0].tap()
  await sleep(3500)
  const mpage = await mp.currentPage()
  const md = await mpage.data()
  console.log('  当前页: ' + mpage.path + '  会员: ' + (md.member && md.member.nickName))
  const mshare = await mp.evaluate(() => {
    const p = getCurrentPages()[getCurrentPages().length - 1]
    if (typeof p.onShareAppMessage !== 'function') return { missing: true }
    return p.onShareAppMessage()
  })
  console.log('  分享内容: ' + JSON.stringify(mshare))
  if (mshare && mshare.path && mshare.path.indexOf('/pages/member/member?openid=') === 0) ok('教练能转发指定会员的资料')
  else bad('教练端分享不对')
  const shareBtns = await mpage.$$('button[open-type="share"]')
  if (shareBtns.length >= 1) ok('会员详情页有「转发」按钮')
  else bad('会员详情页没有转发按钮')

  await mp.reLaunch('/pages/index/index')
  await sleep(700)
  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
