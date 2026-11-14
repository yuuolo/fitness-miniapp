// 验证下线后的小程序：员工工作台只剩该有的入口，其余页面正常
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

  // ---------- 1. 员工工作台入口 ----------
  log('\n[1] 员工工作台入口')
  const staff = await mp.navigateTo('/pages/staff/index/index')
  await sleep(3000)
  const items = await staff.$$('.list-item')
  const labels = []
  for (const it of items) {
    try { labels.push(String(await it.text()).trim().replace('›', '').trim()) } catch (e) {}
  }
  log('  菜单: ' + JSON.stringify(labels))

  const banned = ['排课与签到', '我的课程与签到', '娱乐预约核销', '卡种管理', '娱乐项目管理']
  for (const b of banned) {
    if (labels.some(l => l.indexOf(b) >= 0)) bad('「' + b + '」入口还在')
    else ok('「' + b + '」入口已移除')
  }
  if (labels.some(l => l.indexOf('竞赛管理') >= 0)) ok('竞赛管理保留')
  else bad('竞赛管理不见了')
  if (labels.some(l => l.indexOf('会员资料与体测') >= 0 || l.indexOf('会员与办卡') >= 0)) {
    if (labels.some(l => l.indexOf('会员与办卡') >= 0)) bad('还显示「会员与办卡」，应为「会员资料与体测」')
    else ok('会员入口改为「会员资料与体测」')
  }
  await mp.navigateBack()
  await sleep(800)

  // ---------- 2. 会员详情页没有办卡 ----------
  log('\n[2] 会员详情页（不再有办卡）')
  const members = await mp.navigateTo('/pages/staff/members/members?manage=1&admin=1')
  await sleep(2500)
  const md = await members.data()
  const list = md.list || []
  log('  会员数: ' + list.length)
  if (list.length) {
    const detail = await mp.navigateTo('/pages/staff/member/member?id=' + list[0]._id + '&manage=1&admin=1')
    await sleep(3000)
    const dd = await detail.data()
    const buttons = await detail.$$('button')
    const texts = []
    for (const b of buttons) { try { texts.push(String(await b.text()).trim()) } catch (e) {} }
    log('  按钮: ' + JSON.stringify(texts))
    const hasCardOp = texts.some(t => t.indexOf('办卡') >= 0 || t.indexOf('确认办卡') >= 0)
    if (hasCardOp) bad('还有办卡按钮')
    else ok('办卡按钮已移除')
    if (dd.cards !== undefined) ok('会员卡仍然只读展示（' + (dd.cards || []).length + ' 张）')
    if (texts.some(t => t.indexOf('代填') >= 0)) ok('代填资料保留')
    await mp.navigateBack()
    await sleep(600)
  }
  await mp.navigateBack()
  await sleep(600)

  // ---------- 3. 首页与其余页面正常 ----------
  log('\n[3] 其余页面仍正常')
  await mp.reLaunch('/pages/index/index')
  await sleep(4000)
  const home = (await mp.currentPage())
  const hd = await home.data()
  log('  首页模块数: ' + (hd.layout || []).length)
  if ((hd.layout || []).length > 0) ok('首页正常渲染')

  for (const path of ['/pages/moments/moments', '/pages/rank/rank', '/pages/mine/mine', '/pages/competitions/competitions']) {
    try {
      if (path.indexOf('moments') >= 0 || path.indexOf('mine') >= 0) await mp.switchTab(path)
      else await mp.navigateTo(path)
      await sleep(2200)
      ok(path.split('/')[2] + ' 打开正常')
    } catch (e) {
      bad(path + ' 打不开', e.message)
    }
  }

  await mp.reLaunch('/pages/index/index')
  await sleep(600)
  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => { console.error('验证异常：', e.message); process.exit(2) })
