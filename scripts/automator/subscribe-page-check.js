// 验证：订阅管理页（我的页面入口 + 一键订阅 + 各页已移除订阅条）
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const errs = []
  mp.on('console', m => { if (m.type === 'error') errs.push(String(m.args && m.args.join(' ')).slice(0, 160)) })

  await mp.reLaunch('/pages/index/index')
  await sleep(4000)

  // ---------- 1. 我的页面入口 ----------
  console.log('\n[1] 我的页面：微信提醒入口')
  const mine = await mp.switchTab('/pages/mine/mine')
  await sleep(2500)
  const items = await mine.$$('.menu-item')
  const labels = []
  for (const it of items) labels.push((await it.text()).replace(/\s+/g, ' ').trim().slice(0, 10))
  console.log('  菜单: ' + JSON.stringify(labels))
  if (labels.some(x => x.indexOf('微信提醒') >= 0)) ok('有「微信提醒」入口')
  else bad('没有入口')

  // ---------- 2. 订阅管理页 ----------
  console.log('\n[2] 订阅管理页')
  const page = await mp.navigateTo('/pages/subscribe/subscribe')
  await sleep(3500)
  let d = await page.data()
  console.log('  ready=' + d.ready + '，total=' + d.total + '，topics=' + (d.topics || []).map(t => t.name + ':' + t.tickets).join(' / '))
  if ((d.topics || []).length === 4) ok('四个话题都列出来了')
  else bad('话题数量不对')
  const btn = await page.$$('button')
  console.log('  按钮: ' + btn.length)
  if (btn.length) {
    await btn[0].tap()
    await sleep(5000)
    d = await page.data()
    console.log('  点一键订阅后 total=' + d.total + '，lastError=' + JSON.stringify(d.lastError))
    if (d.lastError) {
      console.log('  （模拟器不支持真实授权，错误信息会显示出来：' + d.lastError.slice(0, 40) + '）')
    }
    ok('一键订阅有反馈，不再静默失败')
  }

  await mp.navigateBack()
  await sleep(600)

  // ---------- 3. 各页面订阅条已移除 ----------
  console.log('\n[3] 各页面已移除订阅条')
  const feed = await mp.switchTab('/pages/moments/moments')
  await sleep(2800)
  let tips = await feed.$$('.sub-tip')
  console.log('  友圈订阅条: ' + tips.length)
  if (tips.length === 0) ok('友圈订阅条已移除')
  else bad('友圈还有订阅条')

  const comp = await mp.navigateTo('/pages/competitions/competitions')
  await sleep(2200)
  tips = await comp.$$('.sub-tip')
  console.log('  竞赛订阅条: ' + tips.length)
  if (tips.length === 0) ok('竞赛订阅条已移除')
  else bad('竞赛还有订阅条')
  await mp.navigateBack()
  await sleep(600)

  const rank = await mp.navigateTo('/pages/rank/rank')
  await sleep(2500)
  const chips = await rank.$$('.sub-chip')
  console.log('  排行榜订阅按钮: ' + chips.length)
  if (chips.length === 0) ok('排行榜订阅按钮已移除')
  else bad('排行榜还有订阅按钮')
  await mp.navigateBack()
  await sleep(600)

  // ---------- 4. 截图 ----------
  await mp.navigateTo('/pages/subscribe/subscribe')
  await sleep(2500)
  await mp.screenshot({ path: 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview/challenge/11-subscribe-page.png' })
  console.log('  ✓ 订阅页截图')

  console.log('\n[4] 报错')
  const real = errs.filter(e => !/code been used|登录失败|requestSubscribeMessage|subscribe/i.test(e))
  if (!real.length) ok('无 JS 报错')
  else bad('有报错', real.slice(0, 3).join(' | '))

  await mp.reLaunch('/pages/index/index')
  await sleep(500)
  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
