// 验证：快捷入口「没选图标就不显示图标」
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const log = m => console.log(m)
const ok = m => log('  ✓ ' + m)
const bad = (m, d) => { log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

async function main() {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  await mp.reLaunch('/pages/index/index')
  await sleep(5000)
  const home = await mp.currentPage()
  const d = await home.data()

  const links = (d.layout || []).filter(b => b.type === 'link')
  log('[1] 布局里的快捷入口')
  links.forEach(b => log('  ' + JSON.stringify({ title: b.title, icon: b.icon || '', page: b.page })))
  if (!links.length) { log('  没有快捷入口'); await mp.disconnect(); process.exit(0) }

  const cards = await home.$$('.link-card')
  log('\n[2] 卡片数量: ' + cards.length + '（布局里 ' + links.length + ' 个）')
  if (cards.length !== links.length) bad('卡片数量与布局不一致')

  log('\n[3] 逐个检查图标节点')
  for (let i = 0; i < cards.length; i++) {
    const block = links[i] || {}
    const cardText = String(await cards[i].text()).trim()
    const icons = await cards[i].$$('.link-icon')
    const hasIconNode = icons.length > 0
    let iconText = ''
    let iconSize = null
    if (hasIconNode) {
      iconText = String(await icons[0].text()).trim()
      iconSize = await icons[0].size()
    }
    log('  「' + (block.title || '?') + '」icon="' + (block.icon || '') + '"')
    log('    卡片文本: "' + cardText + '"')
    log('    图标节点: ' + (hasIconNode ? '有，内容 "' + iconText + '" 尺寸 ' + iconSize.width + 'x' + iconSize.height : '无'))

    if (!block.icon) {
      if (!hasIconNode) ok('没选图标 → 不渲染图标节点')
      else bad('没选图标却渲染了图标', cardText)
    } else {
      if (hasIconNode) ok('选了图标 → 正常渲染')
      else bad('选了图标却没渲染')
    }
  }

  log('\n[4] 没有「统一链接图标」的痕迹')
  const allIcons = await home.$$('.link-icon')
  let svgBacked = 0
  for (const el of allIcons) {
    // 旧实现是空节点 + SVG 背景；新实现必须有文字内容
    const t = String(await el.text()).trim()
    if (!t) svgBacked++
  }
  if (svgBacked === 0) ok('没有空白图标节点（SVG 兜底已移除）')
  else bad('仍有 ' + svgBacked + ' 个空白图标节点')

  await mp.reLaunch('/pages/index/index')
  await sleep(500)
  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => { console.error('异常:', e.message); process.exit(2) })
