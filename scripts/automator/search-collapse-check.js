// 验证：友圈搜索栏默认收起，点图标才展开
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
  let d = await feed.data()

  console.log('\n[1] 默认状态')
  console.log('  searchOpen=' + d.searchOpen)
  let bars = await feed.$$('.search-bar')
  let toggles = await feed.$$('.search-toggle')
  console.log('  搜索栏元素: ' + bars.length + '，搜索图标: ' + toggles.length)
  if (!d.searchOpen && bars.length === 0) ok('搜索栏默认收起')
  else bad('搜索栏没收起')
  if (toggles.length === 1) ok('标题栏有搜索图标')
  else bad('找不到搜索图标')

  console.log('\n[2] 点图标展开')
  if (toggles.length) {
    await toggles[0].tap()
    await sleep(900)
  }
  d = await feed.data()
  bars = await feed.$$('.search-bar')
  console.log('  searchOpen=' + d.searchOpen + '，搜索栏元素: ' + bars.length)
  if (d.searchOpen && bars.length === 1) ok('点图标后展开')
  else bad('没展开')

  console.log('\n[3] 展开后搜索仍可用')
  const inputs = await feed.$$('.search-input')
  if (inputs.length) {
    await inputs[0].input('型')
    await sleep(1400)
    d = await feed.data()
    const hits = (d.list || []).map(x => String(x.content).slice(0, 8))
    console.log('  搜「型」→ ' + hits.length + ' 条: ' + hits.join(' | '))
    if (hits.length) ok('展开后 1 个字照常预搜')
  }

  console.log('\n[4] 再点图标收起并恢复')
  toggles = await feed.$$('.search-toggle')
  if (toggles.length) {
    await toggles[0].tap()
    await sleep(1400)
  }
  d = await feed.data()
  bars = await feed.$$('.search-bar')
  console.log('  searchOpen=' + d.searchOpen + '，keyword=' + JSON.stringify(d.keyword) + '，列表 ' + (d.list || []).length + ' 条')
  if (!d.searchOpen && bars.length === 0 && !d.keyword && (d.list || []).length > 0) {
    ok('收起后清空搜索条件并恢复全部')
  } else {
    bad('收起后状态不对')
  }

  console.log('\n[5] 报错')
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
