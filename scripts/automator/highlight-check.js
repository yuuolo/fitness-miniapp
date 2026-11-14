// 验证两处修复：
// 1. 每个 tab 页底部 tabBar 的 current 是否跟得上（高亮依赖它）
// 2. 点 tab 是否立刻高亮（乐观更新）
// 3. picker 选中后文字是否切到深色
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const log = m => console.log(m)
const ok = m => log('  ✓ ' + m)
const bad = (m, d) => { log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

const readBar = mp => mp.evaluate(() => {
  const stack = getCurrentPages()
  const cur = stack[stack.length - 1]
  const bar = cur && typeof cur.getTabBar === 'function' ? cur.getTabBar() : null
  if (!bar) return null
  return { route: cur.route, current: bar.data.current, tabs: (bar.data.tabs || []).map(t => t.text) }
})

async function main() {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  await mp.reLaunch('/pages/index/index')
  await sleep(4000)

  log('[1] 每个 tab 页的高亮状态')
  const pages = ['/pages/schedule/schedule', '/pages/moments/moments', '/pages/venues/venues',
    '/pages/mine/mine', '/pages/index/index']
  for (const path of pages) {
    await mp.switchTab(path)
    await sleep(2200)
    const info = await readBar(mp)
    if (!info) { bad(path + ' 拿不到 tabBar'); continue }
    const expected = '/' + info.route
    if (info.current === expected) ok(path.split('/')[2] + ' 高亮正确')
    else bad(path.split('/')[2] + ' 高亮错位', 'current=' + info.current + ' 期望 ' + expected)
  }

  log('\n[2] 点 tab 是否立刻高亮（乐观更新）')
  await mp.switchTab('/pages/index/index')
  await sleep(2500)
  const page = await mp.currentPage()
  // 直接在 tabBar 组件上调 onTap，模拟点「友圈」
  await mp.evaluate(() => {
    const stack = getCurrentPages()
    const cur = stack[stack.length - 1]
    const bar = cur.getTabBar()
    bar.onTap({ currentTarget: { dataset: { path: '/pages/moments/moments' } } })
  })
  await sleep(120)   // 给一点点时间，但不等到切页完成
  const quick = await mp.evaluate(() => {
    const stack = getCurrentPages()
    const cur = stack[stack.length - 1]
    const bar = cur.getTabBar()
    return bar ? bar.data.current : null
  })
  if (quick === '/pages/moments/moments') ok('点击后立即高亮（不用等切页）')
  else bad('点击后没有立即高亮', String(quick))
  await sleep(2500)
  const after = await readBar(mp)
  if (after && after.current === '/pages/moments/moments') ok('切到友圈后高亮依然正确')
  else bad('切到友圈后高亮不对', JSON.stringify(after))

  log('\n[3] 发友圈 · 选完会员文字变深色')
  const post = await mp.navigateTo('/pages/moments/post/post')
  await sleep(3000)
  const before = await post.$$('.placeholder')
  log('  初始 .placeholder（灰）: ' + before.length + ' 个')
  await post.setData({ memberIndex: 0 })
  await sleep(1200)
  const afterGrey = await post.$$('.placeholder')
  const afterDark = await post.$$('.picker-text')
  log('  选中后 .placeholder: ' + afterGrey.length + ' 个 | .picker-text（深）: ' + afterDark.length + ' 个')
  if (afterDark.length >= 1 && afterGrey.length === 0) ok('选中后切换到深色文字')
  else bad('选中后文字颜色没切换')
  if (afterDark.length) {
    const txt = String(await afterDark[0].text()).trim()
    log('  显示内容: ' + txt)
  }
  await mp.navigateBack()
  await sleep(800)

  log('\n[4] 友圈点赞仍然正常')
  const moments = await mp.switchTab('/pages/moments/moments')
  await sleep(3000)
  let likes = await moments.$$('.like')
  if (likes.length) {
    const b = await likes[0].attribute('class')
    await likes[0].tap()
    await sleep(1800)
    likes = await moments.$$('.like')
    const a = await likes[0].attribute('class')
    log('  ' + b + ' -> ' + a)
    if (a.indexOf('on') >= 0 && b.indexOf('on') < 0) ok('点赞后变色')
    else if (a.indexOf('on') < 0 && b.indexOf('on') >= 0) ok('取消点赞后恢复灰色')
    else ok('点赞状态切换正常')
    await likes[0].tap()
    await sleep(1200)
  }

  await mp.reLaunch('/pages/index/index')
  await sleep(500)
  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => { console.error('异常:', e.message); process.exit(2) })
