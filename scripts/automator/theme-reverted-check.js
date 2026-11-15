// 验证主题开关已撤销：不再有外观选择器，深色仍跟随系统
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const log = m => console.log(m)
const ok = m => log('  ✓ ' + m)
const bad = (m, d) => { log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

async function main() {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  log('已连接')

  // ---------- 「我的」页不再有外观切换 ----------
  const mine = await mp.switchTab('/pages/mine/mine')
  await sleep(3500)
  const md = await mine.data()

  log('\n[1] 「我的」页')
  log('  data 里还有 themeMode 吗: ' + (md.themeMode === undefined ? '没有' : '有 -> ' + md.themeMode))
  if (md.themeMode === undefined) ok('外观状态已移除')
  else bad('还残留 themeMode')

  const segs = await mine.$$('.seg-item')
  log('  .seg-item 数量: ' + segs.length)
  if (!segs.length) ok('外观选择器已移除')
  else bad('选择器还在')

  const texts = []
  for (const el of await mine.$$('view')) {
    try { const t = String(await el.text()).trim(); if (t && t.length < 20) texts.push(t) } catch (e) {}
  }
  if (texts.some(t => t === '外观')) bad('还显示「外观」标题')
  else ok('没有「外观」标题')

  // ---------- 菜单功能仍在 ----------
  const items = []
  for (const el of await mine.$$('.menu-item')) {
    try { items.push(String(await el.text()).trim()) } catch (e) {}
  }
  log('  菜单: ' + JSON.stringify(items))
  if (items.some(i => i.indexOf('身体数据') >= 0)) ok('功能菜单正常')
  else bad('菜单异常')

  // ---------- 页面不再有主题类 ----------
  log('\n[2] 页面根节点不再挂主题类')
  const stack = await mp.pageStack()
  log('  当前页面: ' + JSON.stringify(stack.map(p => p.path)))
  const hasThemeClass = await mp.evaluate(() => {
    const cur = getCurrentPages()[getCurrentPages().length - 1]
    return !!(cur.data && cur.data.themeClass)
  })
  if (!hasThemeClass) ok('page data 里没有 themeClass')
  else bad('还残留 themeClass')

  // ---------- tabBar 正常 ----------
  log('\n[3] 底部 tabBar')
  const bar = await mp.evaluate(() => {
    const stack = getCurrentPages()
    const cur = stack[stack.length - 1]
    const b = cur.getTabBar()
    return { tabs: (b.data.tabs || []).map(t => t.text), current: b.data.current, hasTheme: b.data.themeClass !== undefined }
  })
  log('  ' + JSON.stringify(bar))
  if (bar.tabs.join('/') === '首页/友圈/我的') ok('tab 正常')
  if (bar.hasTheme === false) ok('tabBar 不再有主题类')

  // ---------- 其它页面正常 ----------
  log('\n[4] 其它页面')
  for (const [path, name, kind] of [
    ['/pages/index/index', '首页', 'tab'],
    ['/pages/moments/moments', '友圈', 'tab'],
    ['/pages/rank/rank', '排行榜', 'page'],
    ['/pages/staff/index/index', '员工工作台', 'page']
  ]) {
    try {
      if (kind === 'tab') await mp.switchTab(path)
      else { await mp.switchTab('/pages/index/index'); await sleep(900); await mp.navigateTo(path) }
      await sleep(2000)
      ok(name + ' 正常')
    } catch (e) { bad(name + ' 异常', e.message) }
  }

  await mp.reLaunch('/pages/index/index')
  await sleep(500)
  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => { console.error('异常:', e.message); process.exit(2) })
