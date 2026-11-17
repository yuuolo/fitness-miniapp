// 量一下头部各元素尺寸（只用 size/offset）
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  await mp.reLaunch('/pages/index/index')
  await sleep(2200)
  const feed = await mp.switchTab('/pages/moments/moments')
  await sleep(3200)

  const info = async (sel, label) => {
    const els = await feed.$$(sel)
    if (!els.length) return console.log(label + ': 无')
    const size = await els[0].size()
    const off = await els[0].offset()
    console.log(label + ': ' + Math.round(size.width) + 'x' + Math.round(size.height) +
      ' @ left=' + Math.round(off.left) + ' top=' + Math.round(off.top))
  }

  await info('.page', '页面根')
  await info('.moments-head', '头部')
  await info('.search-toggle', '搜索图标')
  await info('.moments-head .btn', '发一条')

  await mp.disconnect()
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
