// 验证：小程序读到上传限制 + 友圈列表 +N（moments 是 tabBar 页，要用 switchTab）
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const errs = []
  mp.on('console', m => { if (m.type === 'error') errs.push(String(m.args && m.args.join(' ')).slice(0, 120)) })
  console.log('已连接')

  console.log('\n[1] 发布页读到限制')
  await mp.reLaunch('/pages/index/index')
  await sleep(3000)
  const post = await mp.navigateTo('/pages/moments/post/post')
  await sleep(3500)
  const d = await post.data()
  console.log('  maxDuration=' + d.maxDuration + ' maxCount=' + d.maxCount)
  console.log('  提示: ' + d.limitText)
  if (d.maxDuration && d.maxCount && d.limitText) ok('限制已下发并展示')
  else bad('限制没读到')

  console.log('\n[2] 友圈列表 +N（feedThumbs 现为 1）')
  await mp.navigateBack()
  await sleep(800)
  const feed = await mp.switchTab('/pages/moments/moments')
  await sleep(4500)
  const fd = await feed.data()
  const list = fd.list || []
  console.log('  动态数: ' + list.length)
  list.forEach(m => {
    console.log('    «' + String(m.content || '').slice(0, 12) + '» media=' + (m.media || []).length +
      ' hidden=' + (m.hiddenMedia || 0) + ' count=' + (m.mediaCount || 0))
  })
  const moreEls = await feed.$$('.media-more')
  console.log('  +N 元素数: ' + moreEls.length)
  if (moreEls.length > 0) ok('列表显示 +N')
  else if (list.some(m => m.mediaCount > 1)) bad('有隐藏媒体但没渲染 +N')
  else ok('没有多媒体的动态，跳过 +N 检查')

  console.log('\n[3] 详情页仍能看全')
  const target = list.find(m => (m.mediaCount || 0) > 1) || list.find(m => (m.media || []).length)
  if (target) {
    const det = await mp.navigateTo('/pages/moments/detail/detail?id=' + target._id)
    await sleep(3000)
    const dd = await det.data()
    const mm = dd.m || dd.moment || dd.item || {}
    console.log('  详情媒体数: ' + ((mm.media || []).length) + '（列表里 ' + (target.media || []).length + '）')
    if ((mm.media || []).length >= (target.media || []).length) ok('详情页没被截断')
    else bad('详情页也被截断')
  } else {
    ok('没有带媒体的动态，跳过')
  }

  console.log('\n[4] 报错')
  const real = errs.filter(e => !/code been used|登录失败/i.test(e))
  if (!real.length) ok('无 JS 报错')
  else bad('有报错', real.join(' | '))

  await mp.reLaunch('/pages/index/index')
  await sleep(500)
  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
