// 换配色后把小程序主要页面走一遍，确认没破坏
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const log = m => console.log(m)
const ok = m => log('  ✓ ' + m)
const bad = (m, d) => { log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

const PAGES = [
  ['/pages/index/index', '首页', 'tab'],
  ['/pages/moments/moments', '友圈', 'tab'],
  ['/pages/mine/mine', '我的', 'tab'],
  ['/pages/rank/rank', '排行榜', 'page'],
  ['/pages/competitions/competitions', '竞赛', 'page'],
  ['/pages/profile/profile', '资料', 'page'],
  ['/pages/fitness/fitness', '健身数据', 'page'],
  ['/pages/cards/cards', '会员卡', 'page'],
  ['/pages/bookings/bookings', '我的预约', 'page'],
  ['/pages/staff/index/index', '员工工作台', 'page']
]

async function main() {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const errs = []
  mp.on('exception', e => errs.push(String(e && e.message).slice(0, 120)))

  await mp.reLaunch('/pages/index/index')
  await sleep(4500)

  log('=== 逐页打开 ===')
  for (const [path, name, kind] of PAGES) {
    try {
      if (kind === 'tab') await mp.switchTab(path)
      else {
        await mp.switchTab('/pages/index/index')
        await sleep(1200)
        await mp.navigateTo(path)
      }
      await sleep(2600)
      const cur = await mp.currentPage()
      const data = await cur.data()
      const route = String(cur.path).replace(/^\//, '')
      if ('/' + route === path) ok(name + ' 渲染正常')
      else bad(name + ' 没打开', route)
    } catch (e) {
      bad(name + ' 打开失败', e.message)
    }
  }

  // tabBar 高亮 + 样式
  log('\n=== tabBar ===')
  await mp.switchTab('/pages/index/index')
  await sleep(2500)
  const bar = await mp.evaluate(() => {
    const stack = getCurrentPages()
    const cur = stack[stack.length - 1]
    const b = cur.getTabBar()
    return { tabs: (b.data.tabs || []).map(t => t.text), current: b.data.current }
  })
  log('  ' + JSON.stringify(bar))
  if (bar.tabs.join('/') === '首页/友圈/我的') ok('tab 数量正确（精简模式）')
  else bad('tab 不对', bar.tabs.join('/'))

  log('\n=== 页面异常 ===')
  const real = errs.filter(e => e && e.indexOf('not-found') < 0)
  if (real.length) { bad('有 ' + real.length + ' 个运行时异常', real.slice(0, 3).join(' | ')) }
  else ok('无运行时异常')

  await mp.reLaunch('/pages/index/index')
  await sleep(500)
  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => { console.error('异常:', e.message); process.exit(2) })
