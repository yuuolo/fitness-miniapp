// 首页挑战模块 + 订阅授权流程联调
const automator = require('miniprogram-automator')
const fs = require('fs')
const sleep = ms => new Promise(r => setTimeout(r, ms))

const OUT = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview/challenge'
let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }
const created = []

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const errs = []
  mp.on('console', m => { if (m.type === 'error') errs.push(String(m.args && m.args.join(' ')).slice(0, 140)) })

  await mp.reLaunch('/pages/index/index')
  await sleep(3500)

  console.log('\n[1] 首页挑战模块')
  const idx = await mp.currentPage()
  let d = await idx.data()
  console.log('  layout: ' + (d.layout || []).map(b => b.type).join(' / '))
  console.log('  challengeBadge=' + d.challengeBadge + '，active=' + d.challengeActive)
  const cards = await idx.$$('.challenge-home')
  console.log('  挑战卡片: ' + cards.length)
  if ((d.layout || []).some(b => b.type === 'challenge')) ok('首页布局里有挑战模块')
  else bad('布局里没有挑战模块')
  if (cards.length === 1) ok('挑战卡片已渲染')
  else bad('卡片没渲染')

  const text = JSON.stringify(d)
  await mp.screenshot({ path: OUT + '/08-home.png' })
  console.log('  ✓ 首页截图')

  // 点卡片进大厅
  if (cards.length) {
    await cards[0].tap()
    await sleep(2500)
    const list = await mp.currentPage()
    console.log('  点卡片后页面: ' + list.path)
    if (list.path.indexOf('challenges/list') >= 0) ok('点卡片进入挑战大厅')
    else bad('没进大厅')
    await mp.navigateBack()
    await sleep(1200)
  }

  console.log('\n[2] 发起挑战（验证订阅授权不卡流程）')
  const nu = await mp.navigateTo('/pages/challenges/new/new')
  await sleep(2800)
  let pickBtns = await nu.$$('.pick-btn')
  if (pickBtns.length) {
    await pickBtns[0].tap()
    await sleep(1200)
    const inputs = await nu.$$('input')
    if (inputs.length) {
      await inputs[0].input('龙')
      await sleep(1200)
      const rows = await nu.$$('.list-item')
      if (rows.length) { await rows[0].tap(); await sleep(700) }
    }
  }
  pickBtns = await nu.$$('.pick-btn')
  if (pickBtns.length) {
    await pickBtns[0].tap()
    await sleep(1000)
    const refRows = await nu.$$('.list-item')
    if (refRows.length) { await refRows[0].tap(); await sleep(600) }
  }
  const t0 = Date.now()
  await mp.evaluate(() => {
    const p = getCurrentPages()[getCurrentPages().length - 1]
    p.submit()
  })
  await sleep(6000)
  const cur = await mp.currentPage()
  const curData = await cur.data()
  const cost = Date.now() - t0
  console.log('  耗时 ' + cost + 'ms，当前页: ' + cur.path)
  if (curData && curData.id) {
    created.push(curData.id)
    ok('订阅授权没有卡住创建流程')
  } else {
    bad('创建流程被卡住或失败')
  }

  console.log('\n[3] 报错')
  const real = errs.filter(e => !/code been used|登录失败|subscribe|requestSubscribeMessage/i.test(e))
  if (!real.length) ok('无 JS 报错')
  else bad('有报错', real.slice(0, 3).join(' | '))

  await mp.reLaunch('/pages/index/index')
  await sleep(500)
  await mp.disconnect()
  fs.writeFileSync('C:/Users/yuuolo/Documents/deepseek/.dsh-tools/challenge-created-ids.txt', created.join('\n'))
  console.log('\n创建的挑战: ' + (created.join(',') || '(无)'))
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
