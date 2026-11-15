// 验证「积分」功能隐藏后：小程序里看不到任何积分信息
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
  await sleep(4500)
  const home = await mp.currentPage()
  const hd = await home.data()

  log('\n[1] 功能开关状态')
  const feat = hd.features || {}
  log('  ' + JSON.stringify(feat))
  if (feat.points === false) ok('points 开关为关闭')
  else bad('points 开关没关掉', String(feat.points))

  log('\n[2] 首页不再出现积分')
  const heroText = await home.$$('.hero .sub')
  let sub = ''
  if (heroText.length) sub = String(await heroText[0].text()).trim()
  log('  欢迎语副标题: "' + sub + '"')
  if (sub.indexOf('积分') < 0) ok('首页欢迎语里没有积分')
  else bad('首页还在显示积分：' + sub)

  // 整个页面文本里搜「积分」
  const allText = []
  for (const el of await home.$$('view')) {
    try { const t = String(await el.text()).trim(); if (t) allText.push(t) } catch (e) {}
  }
  const hitHome = allText.filter(t => t.indexOf('积分') >= 0)
  if (hitHome.length) bad('首页仍有积分文案: ' + JSON.stringify(hitHome.slice(0, 2)))
  else ok('首页整页无「积分」字样')

  log('\n[3] 「我的」页面')
  const mine = await mp.switchTab('/pages/mine/mine')
  await sleep(3200)
  const md = await mine.data()
  log('  features.points=' + (md.features && md.features.points) + ' | logs 条数=' + (md.logs || []).length)

  const pointsCard = await mine.$$('.points-card')
  if (!pointsCard.length) ok('积分卡片已隐藏')
  else bad('积分卡片还在')

  const mineText = []
  for (const el of await mine.$$('view')) {
    try { const t = String(await el.text()).trim(); if (t) mineText.push(t) } catch (e) {}
  }
  const hitMine = mineText.filter(t => t.indexOf('积分') >= 0)
  if (hitMine.length) bad('「我的」仍有积分文案: ' + JSON.stringify(hitMine.slice(0, 3)))
  else ok('「我的」整页无「积分」字样')
  if ((md.logs || []).length === 0) ok('没有请求积分记录（logs 为空）')

  log('\n[4] 员工端会员列表/详情')
  await mp.switchTab('/pages/index/index')
  await sleep(1500)
  const members = await mp.navigateTo('/pages/staff/members/members?manage=1&admin=1')
  await sleep(2800)
  const listData = await members.data()
  const rows = listData.list || []
  log('  会员数: ' + rows.length)
  let memberTexts = []
  for (const el of await members.$$('view')) {
    try { const t = String(await el.text()).trim(); if (t) memberTexts.push(t) } catch (e) {}
  }
  if (memberTexts.some(t => t.indexOf('积分') >= 0)) bad('会员列表还显示积分')
  else ok('会员列表不显示积分')

  if (rows.length) {
    const detail = await mp.navigateTo('/pages/staff/member/member?id=' + rows[0]._id + '&manage=1&admin=1')
    await sleep(3000)
    let detailTexts = []
    for (const el of await detail.$$('view')) {
      try { const t = String(await el.text()).trim(); if (t) detailTexts.push(t) } catch (e) {}
    }
    if (detailTexts.some(t => t.indexOf('积分') >= 0)) bad('会员详情还显示积分')
    else ok('会员详情不显示积分')
    await mp.navigateBack()
    await sleep(600)
  }
  await mp.navigateBack()
  await sleep(600)

  log('\n[5] 其他功能不受影响')
  for (const [path, name, kind] of [
    ['/pages/moments/moments', '友圈', 'tab'],
    ['/pages/rank/rank', '排行榜', 'page'],
    ['/pages/competitions/competitions', '竞赛', 'page'],
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
