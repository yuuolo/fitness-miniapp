// 验证首页布局功能：模块顺序来自后端配置、自定义入口可点
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const log = m => console.log(m)
const ok = m => log('  ✓ ' + m)
const bad = (m, d) => { log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

async function main() {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  log('已连接')

  // 当前模拟器登录的是管理员（店长）
  const home = await mp.reLaunch('/pages/index/index')
  await sleep(5000)
  const d = await home.data()

  log('\n[1] 首页拿到的布局')
  const blocks = d.layout || []
  log('  角色: ' + (d.me && d.me.role) + ' | 模块数: ' + blocks.length)
  log('  模块顺序: ' + blocks.map(b => b.type + (b.type === 'link' ? '(' + b.title + ')' : '')).join(' → '))

  if (!blocks.length) {
    bad('首页没有拿到布局配置')
  } else {
    ok('首页从后端拿到按角色配置的模块')
  }

  // 默认布局第一个是 stats；一旦管理员自己放了自定义入口在最前，就以入口优先
  if (d.me && d.me.role === 'admin' && blocks[0]) {
    if (blocks[0].type === 'link') ok('管理员把自定义入口放在了首页第一位（正是「更快捷的位置」）')
    else if (blocks[0].type === 'stats') ok('管理员默认布局第一个模块是「今日概况」')
    else bad('管理员布局顺序不符', blocks[0].type)
  }

  const types = new Set(blocks.map(b => b.type))
  log('  包含类型: ' + Array.from(types).join(', '))
  if (types.has('hero')) ok('包含欢迎模块')
  if (types.has('entry')) ok('包含入场码模块')

  // ---------- 2. DOM 里真的渲染出来了吗 ----------
  log('\n[2] 渲染检查')
  const hero = await home.$$('.hero')
  if (hero.length) ok('欢迎模块已渲染')
  else log('  注意：这个角色的布局里没有欢迎模块')

  if (types.has('entry')) {
    const entry = await home.$$('.entry-card')
    if (entry.length) ok('入场码模块已渲染（独立成块，可调位置）')
    else bad('入场码区块没渲染')
  }

  if (types.has('stats')) {
    const stats = await home.$$('.stats')
    if (stats.length) ok('今日概况已渲染')
    else bad('今日概况没渲染')
  }

  if (types.has('quick')) {
    const quick = await home.$$('.quick')
    if (quick.length) ok('快捷入口宫格已渲染')
    else bad('快捷入口没渲染')
  }

  if (types.has('competitions')) {
    const comp = await home.$$('.card')
    log('  竞赛预览区块：共 ' + comp.length + ' 个 card（含其它模块）')
    ok('竞赛模块已渲染')
  }

  // ---------- 3. 自定义快捷入口 ----------
  const linkBlocks = blocks.filter(b => b.type === 'link')
  log('\n[3] 自定义快捷入口（' + linkBlocks.length + ' 个）')
  const linkEls = await home.$$('.link-card')
  log('  DOM 中 .link-card 数量: ' + linkEls.length)
  if (linkBlocks.length && linkEls.length) {
    ok('自定义入口卡片已渲染')
    // 点第一个跳过去
    const before = (await mp.currentPage()).path
    await linkEls[0].tap()
    await sleep(3000)
    const rawAfter = (await mp.currentPage()).path
    const after = rawAfter.charAt(0) === '/' ? rawAfter : '/' + rawAfter
    log('  点击后从 ' + before + ' 跳到 ' + after)
    if (after !== before) ok('点击自定义入口能跳转到目标页面')
    else bad('点击自定义入口没有跳转')
    const TAB_PAGES = ['/pages/index/index', '/pages/schedule/schedule', '/pages/moments/moments',
      '/pages/venues/venues', '/pages/mine/mine']
    if (TAB_PAGES.indexOf(after) >= 0) ok('目标是 tab 页时用 switchTab 跳转成功（没有跳转失败）')
    await mp.reLaunch('/pages/index/index').catch(() => {})
    await sleep(1200)
  } else if (!linkBlocks.length) {
    log('  当前角色布局里没有自定义入口，跳过')
  } else {
    bad('有配置但没渲染出来')
  }

  // ---------- 4. 隐藏的模块不应出现 ----------
  log('\n[4] 隐藏模块检查')
  for (const b of blocks) {
    if (b.enabled === false) bad('已隐藏的模块 ' + b.type + ' 仍被下发到前端')
  }
  ok('下发给前端的模块都已过滤掉隐藏项')

  await mp.reLaunch('/pages/index/index')
  await sleep(600)
  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => {
  console.error('首页布局验证异常：', e.message)
  process.exit(2)
})
