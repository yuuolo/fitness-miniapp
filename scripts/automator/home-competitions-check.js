// 验证首页「竞赛预览」模块渲染（管理员布局里也有，可用于确认渲染逻辑）
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  await mp.reLaunch('/pages/index/index')
  await sleep(5000)
  const page = await mp.currentPage()
  const d = await page.data()

  const types = (d.layout || []).map(b => b.type)
  console.log('当前账号: ' + (d.me && d.me.role) + '  布局: ' + JSON.stringify(types))

  const hasComp = types.indexOf('competitions') >= 0
  if (hasComp) { ok('布局里有竞赛预览') } else { bad('布局里没有竞赛预览') }

  // 页面上找「竞赛」相关文本
  const texts = []
  for (const el of await page.$$('view')) {
    try { const t = String(await el.text()).trim(); if (t && t.length < 30) texts.push(t) } catch (e) {}
  }
  const hit = [...new Set(texts)].filter(t => t.indexOf('竞赛') >= 0)
  console.log('  含「竞赛」的文本: ' + JSON.stringify(hit.slice(0, 6)))
  if (hit.length) { ok('竞赛模块在页面上渲染出来了') } else { bad('页面上没有竞赛内容') }

  const comps = (d.competitions || [])
  console.log('  竞赛数据: ' + JSON.stringify(comps.map(c => ({ title: c.title, status: c.statusName, lift: c.liftName, players: c.playerCount }))))

  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
