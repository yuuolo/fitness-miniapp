// 验证首页快捷入口卡片：图标渲染、点击跳转
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const log = m => console.log(m)
const ok = m => log('  ✓ ' + m)
const bad = (m, d) => { log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

async function main() {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  await mp.reLaunch('/pages/index/index')
  await sleep(4500)
  const home = await mp.currentPage()
  const d = await home.data()

  log('[1] 首页布局里的快捷入口')
  const linkBlocks = (d.layout || []).filter(b => b.type === 'link')
  log('  数量: ' + linkBlocks.length)
  linkBlocks.forEach(b => log('  · ' + b.title + ' -> ' + b.page + ' (icon="' + (b.icon || '') + '")'))
  if (!linkBlocks.length) {
    log('  没有快捷入口，跳过')
    await mp.disconnect()
    process.exit(0)
  }
  ok('布局里有自定义快捷入口')

  log('\n[2] 卡片与图标渲染')
  const cards = await home.$$('.link-card')
  log('  .link-card 数量: ' + cards.length)
  if (cards.length) ok('快捷入口卡片已渲染')
  else bad('卡片没渲染')

  const icons = await home.$$('.link-icon')
  log('  .link-icon 数量: ' + icons.length)
  if (icons.length) {
    const size = await icons[0].size()
    log('  图标尺寸: ' + size.width + 'x' + size.height)
    if (size.width > 0 && size.height > 0) ok('图标有实际尺寸（SVG 背景生效）')
    else bad('图标尺寸为 0')

    // 确认卡片里不再有 emoji 文本
    const txt = String(await cards[0].text()).trim()
    log('  卡片文本: "' + txt + '"')
    const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
    if (emojiRe.test(txt)) bad('卡片里还有 emoji')
    else ok('卡片里没有 emoji 字符（图标走 SVG 背景）')
  }

  log('\n[3] 点击跳转')
  const before = (await mp.currentPage()).path
  await cards[0].tap()
  await sleep(2800)
  const rawAfter = (await mp.currentPage()).path
  const after = rawAfter.charAt(0) === '/' ? rawAfter : '/' + rawAfter
  log('  ' + before + ' -> ' + after)
  if (after !== before && after === '/pages/competitions/competitions') ok('跳到目标页面')
  else if (after !== before) ok('有跳转（' + after + '）')
  else bad('没有跳转')

  await mp.reLaunch('/pages/index/index')
  await sleep(600)
  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => { console.error('异常:', e.message); process.exit(2) })
