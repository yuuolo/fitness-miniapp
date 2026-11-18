// 复现：发起挑战页的会员搜索
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const logs = []
  mp.on('console', m => logs.push('[' + m.type + '] ' + String(m.args && m.args.join(' ')).slice(0, 200)))

  await mp.reLaunch('/pages/index/index')
  await sleep(3000)
  const page = await mp.navigateTo('/pages/challenges/new/new')
  await sleep(3000)

  let d = await page.data()
  console.log('成员数(初始)=' + (d.members || []).length + '，memberOpen=' + d.memberOpen + '，referees=' + (d.referees || []).length)

  const btns = await page.$$('.pick-btn')
  console.log('选择按钮 ' + btns.length + ' 个')
  if (btns.length) {
    await btns[0].tap()
    await sleep(1200)
    d = await page.data()
    console.log('点开后 memberOpen=' + d.memberOpen + '，成员=' + (d.members || []).length)
    const inputs = await page.$$('input')
    console.log('输入框 ' + inputs.length + ' 个')
    if (inputs.length) {
      await inputs[0].input('龙')
      await sleep(1500)
      d = await page.data()
      console.log('输入「龙」→ keyword=' + JSON.stringify(d.keyword) + '，成员=' + (d.members || []).length +
        '，memberEmpty=' + d.memberEmpty)
      const rows = await page.$$('.list-item')
      console.log('列表行 ' + rows.length)
    }
  }

  console.log('\n日志:')
  logs.slice(-8).forEach(l => console.log('  ' + l))
  await mp.disconnect()
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
