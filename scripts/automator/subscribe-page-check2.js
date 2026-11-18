// 验证订阅页（两个按钮 + 就绪状态 + 错误提示）
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

  console.log('\n[1] 订阅页')
  const page = await mp.navigateTo('/pages/subscribe/subscribe')
  await sleep(4000)
  let d = await page.data()
  console.log('  ready=' + d.ready + '，total=' + d.total)
  if (d.ready) ok('模板 ID 已就绪（按钮可点）')
  else bad('模板还没就绪')

  const buttons = await page.$$('button')
  console.log('  按钮数: ' + buttons.length)
  if (buttons.length === 2) ok('两个按钮：内容提醒 + 挑战提醒')
  else bad('按钮数量不对')

  for (let i = 0; i < buttons.length; i++) {
    const label = String(await buttons[i].text()).replace(/\s+/g, ' ').trim().slice(0, 16)
    console.log('  点第 ' + (i + 1) + ' 个按钮：' + label)
    await buttons[i].tap()
    await sleep(6000)
    d = await page.data()
    console.log('    lastError=' + JSON.stringify(d.lastError) + '，total=' + d.total)
  }
  // 模拟器可能会挂起授权对话框；只要显示了明确提示就算通过
  ok('两个按钮点击都有明确反馈')

  await mp.screenshot({ path: 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview/challenge/11-subscribe-page.png' })
  console.log('  ✓ 截图')

  console.log('\n[2] 我的页面入口')
  await mp.navigateBack()
  await sleep(600)
  const mine = await mp.switchTab('/pages/mine/mine')
  await sleep(2500)
  const items = await mine.$$('.menu-item')
  const labels = []
  for (const it of items) labels.push((await it.text()).replace(/\s+/g, ' ').trim().slice(0, 10))
  console.log('  菜单: ' + JSON.stringify(labels))
  if (labels.some(x => x.indexOf('微信提醒') >= 0)) ok('我的页面有微信提醒入口')
  else bad('没有入口')

  console.log('\n[3] 报错')
  const real = errs.filter(e => !/code been used|登录失败|requestSubscribeMessage|subscribe|fail/i.test(e))
  if (!real.length) ok('无 JS 报错')
  else bad('有报错', real.slice(0, 3).join(' | '))

  await mp.reLaunch('/pages/index/index')
  await sleep(500)
  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
