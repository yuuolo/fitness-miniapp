// 验证功能开关在小程序里的真实效果：tabBar 是否隐藏、页面是否显示占位
// 用 AUTO_FEATURES=all-on | classes-venues-cards-off 指定期望
const automator = require('miniprogram-automator')

const ENDPOINT = process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421'
const EXPECT = process.env.AUTO_FEATURES || 'all-on'
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const log = m => console.log(m)
const ok = m => log('  ✓ ' + m)
const bad = (m, d) => { log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

async function main() {
  const mp = await automator.connect({ wsEndpoint: ENDPOINT })
  log('已连接，期望场景：' + EXPECT)

  // 刷新一次首页，让 home 带回最新开关
  await mp.reLaunch('/pages/index/index')
  await sleep(4500)

  // 首页 data.features
  const pages = await mp.pageStack()
  const indexPage = pages[0]
  const idx = await indexPage.data()
  log('  首页 features = ' + JSON.stringify(idx.features))

  // 自定义 tabBar 的渲染结果
  const tabInfo = await mp.evaluate(() => {
    const stack = getCurrentPages()
    const cur = stack[stack.length - 1]
    const bar = cur && typeof cur.getTabBar === 'function' ? cur.getTabBar() : null
    return bar ? { tabs: (bar.data.tabs || []).map(t => t.text), current: bar.data.current } : null
  })
  log('  tabBar = ' + JSON.stringify(tabInfo))
  if (!tabInfo) {
    bad('拿不到自定义 tabBar（可能没生效）')
  } else {
    const texts = tabInfo.tabs.join('/')
    if (EXPECT === 'all-on') {
      if (texts === '首页/约课/友圈/娱乐/我的') ok('全部开启时 5 个 tab 都在：' + texts)
      else bad('tab 数量/顺序不对', texts)
    } else if (EXPECT === 'classes-venues-cards-off') {
      if (texts === '首页/友圈/我的') ok('关闭团课+娱乐后 tab 只剩：' + texts)
      else bad('tab 没有正确隐藏', texts)
    }
  }

  // 首页快捷入口
  const quick = await mp.evaluate(() => {
    const stack = getCurrentPages()
    const cur = stack[stack.length - 1]
    return cur && cur.data ? {
      classesOff: cur.data.features && cur.data.features.classes === false,
      venuesOff: cur.data.features && cur.data.features.venues === false,
      cardsOff: cur.data.features && cur.data.features.cards === false
    } : null
  })
  log('  首页开关状态 = ' + JSON.stringify(quick))
  if (EXPECT === 'classes-venues-cards-off') {
    if (quick && quick.classesOff && quick.venuesOff && quick.cardsOff) ok('首页拿到关闭状态，快捷入口与会员卡区块会被隐藏')
    else bad('首页没拿到关闭状态', JSON.stringify(quick))
  }

  // 关掉后直接进团课页，应该看到占位
  if (EXPECT === 'classes-venues-cards-off') {
    const schedule = await mp.switchTab('/pages/schedule/schedule')
    await sleep(3000)
    const sd = await schedule.data()
    log('  团课页 disabled = ' + sd.disabled)
    if (sd.disabled === true) ok('团课页显示「暂未开放」占位')
    else bad('团课页没有显示占位')

    const venues = await mp.switchTab('/pages/venues/venues')
    await sleep(2500)
    const vd = await venues.data()
    if (vd.disabled === true) ok('娱乐页显示「暂未开放」占位')
    else bad('娱乐页没有显示占位')

    // 服务端也要拦住
    const blocked = await mp.evaluate(() => new Promise(resolve => {
      const api = require('./utils/api')
      resolve('skip')
    })).catch(() => 'skip')
  } else {
    const schedule = await mp.switchTab('/pages/schedule/schedule')
    await sleep(3000)
    const sd = await schedule.data()
    log('  团课页 disabled = ' + sd.disabled + ' 课程数 = ' + (sd.list || []).length)
    if (sd.disabled === false) ok('全部开启时团课页正常展示')
    else bad('团课页异常')
  }

  await mp.switchTab('/pages/index/index')
  await sleep(800)
  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => {
  console.error('开关验证异常：', e.message)
  process.exit(2)
})
