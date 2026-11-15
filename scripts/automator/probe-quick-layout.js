// 量快捷入口两个格子里「标题」和「图形」的实际位置
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  await mp.reLaunch('/pages/index/index')
  await sleep(4500)
  const page = await mp.currentPage()

  const qs = await page.$$('.q')
  console.log('格子数: ' + qs.length)
  for (let i = 0; i < qs.length; i++) {
    const cls = await qs[i].attribute('class')
    const box = await qs[i].size()
    const off = await qs[i].offset()
    const text = String(await qs[i].text()).replace(/\s+/g, ' ').trim()
    console.log('\n格子 #' + (i + 1) + ' class=' + cls)
    console.log('  位置 y=' + off.top + ' 尺寸 ' + box.width + 'x' + box.height)
    console.log('  文本: ' + text.slice(0, 60))

    // 格子内部的子元素
    const radar = await qs[i].$$('.radar')
    const thumbs = await qs[i].$$('.thumb')
    const title = await qs[i].$$('.q-t')
    const desc = await qs[i].$$('.muted')
    const detail = async (sel, els) => {
      for (const el of els) {
        const b = await el.size()
        const o = await el.offset()
        console.log('    ' + sel + ' y=' + o.top + ' h=' + b.height + ' 文本=' + String(await el.text()).replace(/\s+/g, ' ').trim().slice(0, 30))
      }
    }
    await detail('.radar', radar)
    await detail('.thumb', thumbs)
    await detail('.q-t', title)
    await detail('.muted', desc)
  }

  await mp.disconnect()
})().catch(e => { console.error('异常:', e.message); process.exit(1) })
