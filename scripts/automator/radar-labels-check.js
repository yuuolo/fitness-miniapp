// 验证雷达图放大后首页快捷入口的布局
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  await mp.reLaunch('/pages/index/index')
  await sleep(5500)
  const page = await mp.currentPage()
  const d = await page.data()

  console.log('radarSvg 长度: ' + String(d.radarSvg || '').length + '  radarEmpty: ' + d.radarEmpty)
  console.log('radarScore: ' + d.radarScore)

  const radar = await page.$$('.radar')
  for (const el of radar) {
    const s = await el.size()
    console.log('雷达图: ' + Math.round(s.width) + ' x ' + Math.round(s.height))
  }

  const tiles = await page.$$('.q')
  console.log('快捷入口格子数: ' + tiles.length)
  for (const t of tiles) {
    const s = await t.size()
    const cls = await t.attribute('class')
    const txt = String(await t.text()).replace(/\s+/g, ' ').trim()
    console.log('  ' + cls + '  ' + Math.round(s.width) + 'x' + Math.round(s.height) + '  «' + txt.slice(0, 24) + '»')
  }

  // 标题 / 说明 / 图形 的纵向顺序还在
  const title = await page.$$('.q-t')
  for (const el of title) {
    const o = await el.offset()
    console.log('  标题 y=' + Math.round(o.top) + ' «' + String(await el.text()).trim() + '»')
  }

  await mp.disconnect()
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
