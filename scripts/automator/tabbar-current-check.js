// 逐页检查 tabBar 的 current 是否正确（高亮依赖它）
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

const TAB_PAGES = [
  '/pages/index/index',
  '/pages/schedule/schedule',
  '/pages/moments/moments',
  '/pages/venues/venues',
  '/pages/mine/mine'
]

async function main() {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  await mp.reLaunch('/pages/index/index')
  await sleep(3500)

  for (const path of TAB_PAGES) {
    try {
      await mp.switchTab(path)
    } catch (e) {
      console.log(path + ' switchTab 失败: ' + e.message)
      continue
    }
    await sleep(2500)
    const info = await mp.evaluate(() => {
      const stack = getCurrentPages()
      const cur = stack[stack.length - 1]
      const bar = cur && typeof cur.getTabBar === 'function' ? cur.getTabBar() : null
      if (!bar) return { noBar: true, route: cur && cur.route }
      return {
        route: cur && cur.route,
        current: bar.data.current,
        tabs: (bar.data.tabs || []).map(t => ({ text: t.text, path: t.pagePath })),
        ready: bar.data.ready
      }
    })
    const expected = '/' + info.route
    const hit = info.current === expected
    console.log((hit ? '✓ ' : '✗ ') + path)
    console.log('   route=' + info.route + ' bar.current=' + info.current + ' ready=' + info.ready)
    if (!hit) {
      console.log('   期望高亮: ' + expected + '  实际: ' + info.current)
    }
  }

  await mp.disconnect()
}

main().catch(e => { console.error('异常:', e.message); process.exit(1) })
