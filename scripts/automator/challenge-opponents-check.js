// 验证挑战选对手（现在普通会员也能查）
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
  await sleep(3000)

  console.log('\n[1] 发起挑战：选会员')
  const page = await mp.navigateTo('/pages/challenges/new/new')
  await sleep(3200)
  let d = await page.data()
  console.log('  初始成员: ' + (d.members || []).length + ' 条')
  if ((d.members || []).length > 0) ok('打开页面就有会员列表（不用先打字）')
  else bad('会员列表为空')

  const btns = await page.$$('.pick-btn')
  if (btns.length) {
    await btns[0].tap()
    await sleep(1500)
  }
  d = await page.data()
  const sample = (d.members || []).slice(0, 3).map(x => x.name + '(' + (x.role || '') + ')').join('、')
  console.log('  展开后: ' + (d.members || []).length + ' 条，示例: ' + sample)
  console.log('  是否带手机号: ' + ((d.members || []).some(x => x.phone) ? '有（不应该）' : '没有（正确）'))
  if (!(d.members || []).some(x => x.phone)) ok('不暴露手机号')

  const inputs = await page.$$('input')
  if (inputs.length) {
    await inputs[0].input('菜')
    await sleep(1400)
    d = await page.data()
    console.log('  搜「菜」→ ' + (d.members || []).length + ' 条: ' + (d.members || []).map(x => x.name).join('、'))
    if ((d.members || []).length === 1) ok('搜索正常')
    const rows = await page.$$('.list-item')
    if (rows.length) {
      await rows[0].tap()
      await sleep(700)
      d = await page.data()
      console.log('  选中: ' + JSON.stringify(d.opponent && d.opponent.name))
      if (d.opponent) ok('可以选中')
    }
  }

  console.log('\n[2] 报错')
  const real = errs.filter(e => !/code been used|登录失败|subscribe|fail/i.test(e))
  if (!real.length) ok('无 JS 报错')
  else bad('有报错', real.slice(0, 3).join(' | '))

  await mp.reLaunch('/pages/index/index')
  await sleep(500)
  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
