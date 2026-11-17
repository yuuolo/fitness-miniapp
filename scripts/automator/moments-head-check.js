// 验证：友圈头部 搜索图标在左、标题已删除
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const errs = []
  mp.on('console', m => { if (m.type === 'error') errs.push(String(m.args && m.args.join(' ')).slice(0, 120)) })

  await mp.reLaunch('/pages/index/index')
  await sleep(2500)
  const feed = await mp.switchTab('/pages/moments/moments')
  await sleep(3500)

  console.log('\n[1] 头部结构')
  const head = await feed.$$('.moments-head')
  const toggles = await feed.$$('.search-toggle')
  const buttons = await feed.$$('.moments-head .btn')
  console.log('  头部节点: ' + head.length + '，搜索图标: ' + toggles.length + '，发一条按钮: ' + buttons.length)
  if (head.length === 1 && toggles.length === 1 && buttons.length === 1) ok('头部只有「图标 + 发一条」')
  else bad('头部结构不对')

  if (toggles.length && buttons.length) {
    const t1 = await toggles[0].offset()
    const b1 = await buttons[0].offset()
    console.log('  搜索图标 left=' + Math.round(t1.left) + '，发一条 left=' + Math.round(b1.left))
    if (t1.left < b1.left) ok('搜索图标在左边')
    else bad('图标没在左边')
  }

  console.log('\n[2] 标题是否还在')
  const titles = await feed.$$('.section-title')
  const texts = []
  for (const t of titles) texts.push(String(await t.text()).replace(/\s+/g, ' ').trim().slice(0, 16))
  console.log('  剩余 section-title: ' + JSON.stringify(texts))
  if (!texts.some(x => x.indexOf('健身友圈') >= 0)) ok('「健身友圈」标题已删除')
  else bad('标题还在')

  console.log('\n[3] 点图标仍能展开搜索')
  const t2 = await feed.$$('.search-toggle')
  if (t2.length) {
    await t2[0].tap()
    await sleep(900)
  }
  const d = await feed.data()
  const bars = await feed.$$('.search-bar')
  console.log('  searchOpen=' + d.searchOpen + '，搜索栏 ' + bars.length)
  if (d.searchOpen && bars.length === 1) ok('点图标展开搜索栏')
  else bad('展开失败')
  if (bars.length) {
    await t2[0].tap()
    await sleep(700)
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
