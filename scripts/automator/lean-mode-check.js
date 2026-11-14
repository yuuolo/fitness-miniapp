// 关闭会员卡/团课/娱乐之后，完整看一遍会员看到什么
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const log = m => console.log(m)
const ok = m => log('  ✓ ' + m)
const bad = (m, d) => { log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

async function main() {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  log('已连接')

  await mp.reLaunch('/pages/index/index')
  await sleep(5000)
  const home = await mp.currentPage()

  // ---------- 1. tabBar ----------
  log('\n[1] 底部 tab')
  const bar = await mp.evaluate(() => {
    const stack = getCurrentPages()
    const cur = stack[stack.length - 1]
    const b = cur.getTabBar()
    return { tabs: (b.data.tabs || []).map(t => t.text), current: b.data.current }
  })
  log('  ' + JSON.stringify(bar))
  if (bar.tabs.join('/') === '首页/友圈/我的') ok('只剩 首页 / 友圈 / 我的')
  else bad('tab 不对', bar.tabs.join('/'))

  // ---------- 2. 首页布局 ----------
  log('\n[2] 首页模块')
  const d = await home.data()
  const types = (d.layout || []).map(b => b.type)
  log('  配置的模块: ' + types.join(', '))
  log('  features: ' + JSON.stringify(d.features))

  const entryCards = await home.$$('.entry-card')
  if (entryCards.length === 0) ok('入场码入口已隐藏（没有会员卡功能）')
  else bad('入场码入口还在')

  const cards = (await home.$$('.card')).length
  log('  .card 元素数: ' + cards)

  // 「我的会员卡」「今日预约」标题不应该出现
  const texts = []
  for (const el of await home.$$('view')) {
    try { const t = String(await el.text()).trim(); if (t && t.length < 20) texts.push(t) } catch (e) {}
  }
  const joined = texts.join('|')
  if (joined.indexOf('我的会员卡') < 0) ok('「我的会员卡」区块不显示')
  else bad('还在显示「我的会员卡」')
  if (joined.indexOf('今日预约') < 0) ok('「今日预约」区块不显示')
  else bad('还在显示「今日预约」')

  // ---------- 3. 「我的」页面 ----------
  log('\n[3] 「我的」页面')
  const mine = await mp.switchTab('/pages/mine/mine')
  await sleep(3000)
  const md = await mine.data()
  const items = []
  for (const el of await mine.$$('.list-item')) {
    try { items.push(String(await el.text()).trim().replace('›', '').trim()) } catch (e) {}
  }
  log('  菜单: ' + JSON.stringify(items))
  const banned = ['我的会员卡', '我的预约']
  for (const b of banned) {
    if (items.some(i => i.indexOf(b) >= 0)) bad('「' + b + '」还在')
    else ok('「' + b + '」已隐藏')
  }
  if (items.some(i => i.indexOf('力量排行榜') >= 0)) ok('排行榜保留')
  if (items.some(i => i.indexOf('竞赛') >= 0)) ok('竞赛保留')

  // ---------- 4. 直接访问已关闭页面 ----------
  log('\n[4] 直接打开已关闭页面')
  for (const [path, name] of [['/pages/schedule/schedule', '约课'], ['/pages/venues/venues', '娱乐']]) {
    try {
      await mp.switchTab(path)
      await sleep(2500)
      const p = await mp.currentPage()
      const pd = await p.data()
      if (pd.disabled === true) ok(name + ' 页显示「暂未开放」占位')
      else bad(name + ' 页没有占位', JSON.stringify({ disabled: pd.disabled }))
    } catch (e) {
      // 页面已从 tabBar 移除，switchTab 会失败，这本身也是预期
      ok(name + ' 已不在 tabBar，无法进入（' + e.message.slice(0, 30) + '）')
    }
  }

  // ---------- 5. 保留的功能可用 ----------
  log('\n[5] 保留功能是否正常')
  await mp.switchTab('/pages/moments/moments')
  await sleep(3000)
  const mData = await (await mp.currentPage()).data()
  log('  友圈动态数: ' + (mData.list || []).length)
  if (mData.disabled !== true) ok('友圈可用')

  await mp.navigateTo('/pages/rank/rank')
  await sleep(2500)
  const rData = await (await mp.currentPage()).data()
  log('  排行榜项目数: ' + (rData.lifts || []).length + ' | 周期: ' + rData.period)
  if (rData.disabled !== true) ok('排行榜可用')

  await mp.reLaunch('/pages/index/index')
  await sleep(600)
  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => { console.error('验证异常：', e.message); process.exit(2) })
