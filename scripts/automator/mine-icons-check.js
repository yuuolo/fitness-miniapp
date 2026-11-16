// 验证「我的」菜单图标尺寸（之前塌成红点）
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  await mp.reLaunch('/pages/mine/mine')
  await sleep(4000)
  const page = await mp.currentPage()

  const icons = await page.$$('.mi')
  console.log('图标元素数: ' + icons.length)
  let bad = 0
  for (const el of icons) {
    const cls = await el.attribute('class')
    const b = await el.size()
    console.log('  ' + cls + '  ' + b.width + ' x ' + b.height)
    if (b.width < 15 || b.height < 15) bad++
  }
  console.log(bad ? '  ✗ ' + bad + ' 个图标尺寸异常' : '  ✓ 所有图标都有正常尺寸')
  await mp.disconnect()
  process.exit(bad ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
