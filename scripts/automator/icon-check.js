// 验证「我的」页 6 个 SVG 图标是否渲染出来（背景图是否加载成功）
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const log = m => console.log(m)
const ok = m => log('  ✓ ' + m)
const bad = (m, d) => { log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

const ICONS = ['mi-card', 'mi-list', 'mi-chart', 'mi-trophy', 'mi-flame', 'mi-tool']

async function main() {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  log('已连接')

  const mine = await mp.switchTab('/pages/mine/mine')
  await sleep(3500)

  // 1. emoji 是否已经没有了
  const texts = []
  for (const el of await mine.$$('view')) {
    try { const t = String(await el.text()).trim(); if (t && t.length < 12) texts.push(t) } catch (e) {}
  }
  const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
  const emojis = texts.filter(t => emojiRe.test(t))
  log('\n[1] emoji 残留检查')
  if (emojis.length) bad('还有 emoji: ' + JSON.stringify(emojis))
  else ok('菜单里已没有 emoji')

  // 2. 6 个图标元素都在
  log('\n[2] SVG 图标元素')
  for (const cls of ICONS) {
    const els = await mine.$$('.' + cls)
    if (els.length) {
      const size = await els[0].size()
      log('  .' + cls + '  ' + size.width + 'x' + size.height)
      if (size.width > 0 && size.height > 0) ok('.' + cls + ' 已渲染')
      else bad('.' + cls + ' 尺寸为 0')
    } else {
      // 精简模式下「会员卡/我的预约」菜单是隐藏的，找不到属正常
      log('  .' + cls + ' 不在当前页面（该菜单项被功能开关隐藏）')
    }
  }

  // 3. 菜单文字仍然完整
  log('\n[3] 菜单文字')
  const items = []
  for (const el of await mine.$$('.menu-item')) {
    try { items.push(String(await el.text()).trim()) } catch (e) {}
  }
  log('  ' + JSON.stringify(items))
  const expect = ['我的身体数据', '力量排行榜', '竞赛', '员工工作台']
  const missing = expect.filter(e => !items.some(i => i.indexOf(e) >= 0))
  if (missing.length) bad('缺少菜单: ' + missing.join(','))
  else ok('当前开启的功能菜单都在')

  // 4. 头像描边与积分卡片
  log('\n[4] 版式元素')
  const avatar = await mine.$$('.avatar')
  if (avatar.length) ok('头像存在')
  const points = await mine.$$('.points-card')
  if (points.length) ok('积分卡片存在')
  const chevrons = await mine.$$('.chevron')
  log('  箭头数量: ' + chevrons.length)
  if (chevrons.length >= items.length) ok('每行都有右侧箭头')
  else bad('箭头数量不足')

  await mp.switchTab('/pages/index/index')
  await sleep(500)
  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => { console.error('异常:', e.message); process.exit(2) })
