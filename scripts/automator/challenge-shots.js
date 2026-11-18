// 截取挑战相关页面效果图
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = ms => new Promise(r => setTimeout(r, ms))

const OUT = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview/challenge'
fs.mkdirSync(OUT, { recursive: true })

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  await mp.reLaunch('/pages/index/index')
  await sleep(2500)

  // 1. 我的页面（入口 + 红点）
  await mp.switchTab('/pages/mine/mine')
  await sleep(2200)
  await mp.screenshot({ path: OUT + '/01-mine-entry.png' })
  console.log('✓ 01 我的页面入口')

  // 2. 挑战大厅
  const list = await mp.navigateTo('/pages/challenges/list/list')
  await sleep(3000)
  await mp.screenshot({ path: OUT + '/02-hall.png' })
  console.log('✓ 02 挑战大厅')

  // 3. 发起挑战
  const nu = await mp.navigateTo('/pages/challenges/new/new')
  await sleep(2800)
  const pickBtns = await nu.$$('.pick-btn')
  if (pickBtns.length) {
    await pickBtns[0].tap()
    await sleep(1200)
    const inputs = await nu.$$('input')
    if (inputs.length) {
      await inputs[0].input('龙')
      await sleep(1200)
      const rows = await nu.$$('.list-item')
      if (rows.length) {
        await rows[0].tap()
        await sleep(1000)
      }
    }
  }
  await mp.screenshot({ path: OUT + '/03-new-filled.png' })
  console.log('✓ 03 发起挑战（已选对手）')

  // 4. 挑战详情
  const id = fs.readFileSync('C:/Users/yuuolo/Documents/deepseek/.dsh-tools/challenge-created-ids.txt', 'utf8').trim().split('\n')[0]
  const detail = await mp.navigateTo('/pages/challenges/detail/detail?id=' + id)
  await sleep(2800)
  await mp.screenshot({ path: OUT + '/04-detail.png' })
  console.log('✓ 04 挑战详情')

  // 5. 教练端
  await mp.navigateTo('/pages/staff/challenges/challenges')
  await sleep(2200)
  await mp.screenshot({ path: OUT + '/05-staff-list.png' })
  console.log('✓ 05 教练端')

  await mp.reLaunch('/pages/index/index')
  await sleep(500)
  await mp.disconnect()
  console.log('\n输出目录: ' + OUT)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
