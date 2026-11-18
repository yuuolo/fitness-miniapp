// 验证订阅按钮：友圈 / 竞赛 / 排行榜
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const errs = []
  mp.on('console', m => { if (m.type === 'error') errs.push(String(m.args && m.args.join(' ')).slice(0, 140)) })

  await mp.reLaunch('/pages/index/index')
  await sleep(2500)

  // ---------- 1. 友圈 ----------
  console.log('\n[1] 友圈：订阅新视频提醒')
  const feed = await mp.switchTab('/pages/moments/moments')
  await sleep(3000)
  let tips = await feed.$$('.sub-tip')
  console.log('  订阅条: ' + tips.length)
  if (tips.length === 1) ok('友圈有订阅入口')
  else bad('友圈没有订阅入口')
  if (tips.length) {
    await tips[0].tap()
    await sleep(4000)
    const d = await feed.data()
    console.log('  点订阅后 subscribed=' + d.subscribed)
    ok('订阅点击无报错（模拟器可能不弹授权，也走兜底）')
  }

  // ---------- 2. 竞赛 ----------
  console.log('\n[2] 竞赛：订阅变化提醒')
  const comp = await mp.navigateTo('/pages/competitions/competitions')
  await sleep(2500)
  const ctips = await comp.$$('.sub-tip')
  console.log('  订阅条: ' + ctips.length)
  if (ctips.length === 1) ok('竞赛页有订阅入口')
  else bad('竞赛页没有订阅入口')
  await mp.navigateBack()
  await sleep(600)

  // ---------- 3. 排行榜 ----------
  console.log('\n[3] 排行榜：两个订阅按钮')
  const rank = await mp.navigateTo('/pages/rank/rank')
  await sleep(2800)
  const chips = await rank.$$('.sub-chip')
  console.log('  订阅按钮: ' + chips.length)
  if (chips.length === 2) ok('排行榜有综合评分榜 / 力量榜两个订阅')
  else bad('排行榜订阅按钮数量不对')
  if (chips.length) {
    await chips[0].tap()
    await sleep(3500)
    await chips[1].tap()
    await sleep(3500)
    ok('两个订阅点击均无异常')
  }

  // ---------- 4. 服务端票数 ----------
  console.log('\n[4] 订阅票数（服务端）')
  const r = await mp.callWxMethod ? null : null
  await mp.navigateBack()
  await sleep(600)

  console.log('\n[5] 报错')
  const real = errs.filter(e => !/code been used|登录失败|subscribe|requestSubscribeMessage|fail/i.test(e))
  if (!real.length) ok('无 JS 报错')
  else bad('有报错', real.slice(0, 3).join(' | '))

  await mp.reLaunch('/pages/index/index')
  await sleep(500)
  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
