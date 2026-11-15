// 验证：员工工作台 → 会员资料与体测 → 点会员 → 详情页有内容
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
  await sleep(3500)

  log('\n[1] 员工工作台 → 会员资料与体测')
  const staff = await mp.navigateTo('/pages/staff/index/index')
  await sleep(3000)
  const menu = await staff.$$('.list-item')
  let opened = false
  for (const m of menu) {
    const t = String(await m.text())
    if (t.indexOf('会员资料') >= 0) {
      await m.tap()
      opened = true
      break
    }
  }
  if (!opened) { bad('没找到会员资料入口'); await mp.disconnect(); process.exit(1) }
  await sleep(3200)

  const listPage = await mp.currentPage()
  log('  当前页: ' + listPage.path)
  const ld = await listPage.data()
  const list = ld.list || []
  log('  会员数: ' + list.length)
  if (!list.length) { bad('会员列表为空'); await mp.disconnect(); process.exit(1) }
  ok('会员列表有 ' + list.length + ' 条')

  log('\n[2] 点第一个会员进详情')
  const rows = await listPage.$$('.list-item')
  log('  列表行数: ' + rows.length)
  await rows[0].tap()
  await sleep(3500)

  const page = await mp.currentPage()
  log('  当前页: ' + page.path)
  if (page.path.indexOf('staff/member/member') < 0) { bad('没进到详情页', page.path) }
  else ok('已进入会员详情页')

  const d = await page.data()
  log('  member: ' + JSON.stringify(d.member ? {
    nickName: d.member.nickName, phone: d.member.phone, role: d.member.role,
    height: d.member.height, since: d.member.since
  } : null))
  if (d.member && (d.member.nickName || d.member.phone)) ok('详情数据已加载：' + (d.member.nickName || d.member.phone))
  else bad('详情没有数据（member 为空）')

  log('\n[3] 页面内容')
  const texts = []
  for (const el of await page.$$('view')) {
    try { const t = String(await el.text()).trim(); if (t && t.length < 40) texts.push(t) } catch (e) {}
  }
  const uniq = [...new Set(texts)]
  log('  页面文本（前 10 条）: ' + JSON.stringify(uniq.slice(0, 10)))
  if (uniq.some(t => t.indexOf('身体数据与力量成绩') >= 0)) ok('显示「身体数据与力量成绩」入口')
  else bad('没有身体数据入口')
  if (uniq.some(t => /角色|会员|教练|管理员/.test(t))) ok('显示角色信息')
  else bad('没显示角色')

  // 关键：不能出现错误提示
  const errShown = uniq.some(t => t.indexOf('加载失败') >= 0)
  if (!errShown) ok('没有出现「加载失败」提示')
  else bad('页面报加载失败')

  log('\n[4] 点身体数据入口')
  for (const el of await page.$$('.list-item')) {
    const t = String(await el.text())
    if (t.indexOf('身体数据') >= 0) {
      await el.tap()
      break
    }
  }
  await sleep(3000)
  const fp = await mp.currentPage()
  log('  当前页: ' + fp.path)
  if (fp.path.indexOf('staff/fitness') >= 0) ok('跳到体测录入页')
  else bad('没跳到体测页', fp.path)
  const fd = await fp.data()
  log('  体测页 loaded=' + fd.loaded + ' memberName=' + (fd.f && fd.f.memberName))

  await mp.navigateBack()
  await sleep(600)
  await mp.navigateBack()
  await sleep(600)
  await mp.navigateBack()
  await sleep(800)
  await mp.reLaunch('/pages/index/index')
  await sleep(600)
  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => { console.error('异常:', e.message); process.exit(2) })
