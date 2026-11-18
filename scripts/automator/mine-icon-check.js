// 验证：我的页面「记录运动」用了新图标（mi-run），不再是火焰
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
  const mine = await mp.switchTab('/pages/mine/mine')
  await sleep(2800)

  console.log('\n[1] 菜单项')
  const rows = await mine.$$('.menu-item')
  const labels = []
  for (const r of rows) labels.push(String(await r.text()).replace(/\s+/g, ' ').trim().slice(0, 12))
  console.log('  ' + JSON.stringify(labels))
  if (labels.some(x => x.indexOf('记录运动') >= 0)) ok('有「记录运动」')
  else bad('没有记录运动')

  console.log('\n[2] 图标类名')
  const run = await mine.$$('.mi-run')
  const flame = await mine.$$('.mi-flame')
  console.log('  mi-run: ' + run.length + ' 个，mi-flame: ' + flame.length + ' 个')
  if (run.length === 1) ok('记录运动用的是新的 mi-run 图标')
  else bad('mi-run 数量不对')
  if (flame.length === 1) ok('只剩「竞赛」用火焰（两者已区分）')
  else bad('火焰图标数量不对')

  console.log('\n[3] 报错')
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
