// 验证深浅主题开关：切换三个模式，检查页面与 tabBar 的主题类
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const log = m => console.log(m)
const ok = m => log('  ✓ ' + m)
const bad = (m, d) => { log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

const readState = async mp => mp.evaluate(() => {
  const stack = getCurrentPages()
  const cur = stack[stack.length - 1]
  const bar = typeof cur.getTabBar === 'function' ? cur.getTabBar() : null
  return {
    route: cur.route,
    pageTheme: cur.data.themeClass || null,
    barTheme: bar ? bar.data.themeClass : null,
    mode: cur.data.themeMode || null
  }
})

async function main() {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  log('已连接')

  await mp.reLaunch('/pages/mine/mine')
  await sleep(4000)

  let st = await readState(mp)
  log('\n[1] 初始状态')
  log('  ' + JSON.stringify(st))
  if (st.pageTheme && st.pageTheme.indexOf('theme-') === 0) ok('页面根节点有主题类：' + st.pageTheme)
  else bad('页面没有主题类')
  if (st.barTheme && st.barTheme.indexOf('theme-') === 0) ok('tabBar 有主题类：' + st.barTheme)
  else bad('tabBar 没有主题类')

  // ---------- 切换按钮是否存在 ----------
  log('\n[2] 「我的」页的外观切换')
  const items = await mp.currentPage().then(p => p.$$('.seg-item'))
  const labels = []
  for (const it of items) labels.push(String(await it.text()).trim())
  log('  选项: ' + JSON.stringify(labels))
  if (labels.length === 3) ok('三个选项都在')
  else bad('选项数量不对', labels.length)

  // ---------- 依次切换 ----------
  for (const [idx, expect] of [[2, 'theme-dark'], [1, 'theme-light'], [0, 'theme-auto']]) {
    log('\n[3] 点「' + labels[idx] + '」')
    const els = await mp.currentPage().then(p => p.$$('.seg-item'))
    await els[idx].tap()
    await sleep(1500)
    st = await readState(mp)
    log('  ' + JSON.stringify(st))
    if (st.pageTheme === expect) ok('页面主题类变为 ' + expect)
    else bad('页面主题类不对', st.pageTheme)
    if (st.barTheme === expect) ok('tabBar 主题类同步为 ' + expect)
    else bad('tabBar 主题类没同步', st.barTheme)
    const active = await mp.currentPage().then(p => p.$$('.seg-item.on'))
    const activeText = active.length ? String(await active[0].text()).trim() : ''
    if (activeText === labels[idx]) ok('选中态高亮正确：' + activeText)
    else bad('选中态不对', activeText)
  }

  // ---------- 切换后其它页面也带主题 ----------
  log('\n[4] 切到深色后看其它页面')
  const els = await mp.currentPage().then(p => p.$$('.seg-item'))
  await els[2].tap()
  await sleep(1200)
  for (const [path, name, kind] of [
    ['/pages/index/index', '首页', 'tab'],
    ['/pages/moments/moments', '友圈', 'tab'],
    ['/pages/rank/rank', '排行榜', 'page']
  ]) {
    if (kind === 'tab') await mp.switchTab(path)
    else { await mp.switchTab('/pages/index/index'); await sleep(900); await mp.navigateTo(path) }
    await sleep(2000)
    const s = await readState(mp)
    // 只有 tab 页才有 tabBar；普通页面 barTheme 为 null 是正常的
    if (kind === 'tab') {
      if (s.pageTheme === 'theme-dark' && s.barTheme === 'theme-dark') ok(name + ' 跟随深色（页面+tabBar）')
      else bad(name + ' 主题未生效', JSON.stringify(s))
    } else {
      if (s.pageTheme === 'theme-dark') ok(name + ' 跟随深色（普通页面无 tabBar）')
      else bad(name + ' 主题未生效', JSON.stringify(s))
    }
  }

  // ---------- 持久化 ----------
  log('\n[5] 重启后是否记得选择')
  await mp.reLaunch('/pages/index/index')
  await sleep(3500)
  const after = await readState(mp)
  log('  ' + JSON.stringify(after))
  if (after.pageTheme === 'theme-dark') ok('重启后仍是深色（已持久化到 storage）')
  else bad('重启后主题丢失', after.pageTheme)

  // 恢复成跟随系统
  await mp.switchTab('/pages/mine/mine')
  await sleep(2500)
  const back = await mp.currentPage().then(p => p.$$('.seg-item'))
  if (back.length) { await back[0].tap(); await sleep(1200) }
  const finalState = await readState(mp)
  log('\n[6] 已恢复：' + JSON.stringify(finalState))
  if (finalState.pageTheme === 'theme-auto') ok('恢复为跟随系统')
  else bad('恢复失败')

  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => { console.error('异常:', e.message); process.exit(2) })
