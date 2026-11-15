// 验证「前台」角色已移除：角色选择里只剩三级，权限行为正确
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
  await mp.switchTab('/pages/mine/mine')
  await sleep(2500)

  // 打开员工端 -> 会员列表 -> 会员详情（管理员身份，能看到角色选择）
  const members = await mp.navigateTo('/pages/staff/members/members?manage=1&admin=1')
  await sleep(3000)
  const listData = await members.data()
  const rows = listData.list || []
  log('\n[1] 会员列表')
  log('  条数: ' + rows.length)
  const roleNames = rows.map(r => r.roleName)
  log('  角色名: ' + JSON.stringify(roleNames))
  if (roleNames.indexOf('前台') >= 0) bad('列表里还有「前台」角色')
  else ok('列表里没有「前台」角色')

  if (!rows.length) {
    log('  没有会员，跳过角色选择检查')
    await mp.disconnect()
    process.exit(failures ? 1 : 0)
  }

  const detail = await mp.navigateTo('/pages/staff/member/member?id=' + rows[0]._id + '&manage=1&admin=1')
  await sleep(3200)
  const dd = await detail.data()

  log('\n[2] 会员详情的角色选择')
  const roles = dd.roles || []
  log('  可选角色: ' + JSON.stringify(roles.map(r => r.label)))
  if (roles.length === 3) ok('角色只有三级')
  else bad('角色数量不对', roles.length)
  if (roles.some(r => r.label === '前台')) bad('角色选择里还有「前台」')
  else ok('角色选择里没有「前台」')
  const values = roles.map(r => r.value).sort()
  log('  value: ' + JSON.stringify(values))
  if (values.join(',') === 'admin,coach,member') ok('三级角色为 member/coach/admin')
  else bad('角色取值不对', values.join(','))

  // 页面上不该出现「前台」字样（除了「到前台出示」这类地点语义）
  log('\n[3] 页面文案')
  const texts = []
  for (const el of await detail.$$('view')) {
    try { const t = String(await el.text()).trim(); if (t) texts.push(t) } catch (e) {}
  }
  const hits = texts.filter(t => t.indexOf('前台') >= 0)
  if (hits.length) log('  仍含「前台」的文案: ' + JSON.stringify(hits.slice(0, 3)) + '（若无角色含义则正常）')
  else ok('会员详情没有「前台」字样')

  log('\n[4] 员工工作台（管理员视角）')
  await mp.switchTab('/pages/index/index')
  await sleep(1200)
  const staff = await mp.navigateTo('/pages/staff/index/index')
  await sleep(3000)
  const sd = await staff.data()
  log('  role=' + sd.role + ' isStaff=' + sd.isStaff + ' isCoach=' + sd.isCoach + ' cardsOn=' + sd.cardsOn)
  if (sd.role === '管理员' && sd.isStaff === true) ok('管理员拥有后台能力')
  else bad('管理员后台能力异常')
  const items = []
  for (const el of await staff.$$('.list-item')) {
    try { items.push(String(await el.text()).trim()) } catch (e) {}
  }
  log('  菜单: ' + JSON.stringify(items))

  log('\n[5] 其他页面正常')
  await mp.switchTab('/pages/index/index')
  await sleep(1000)
  for (const [path, name, kind] of [
    ['/pages/rank/rank', '排行榜', 'page'],
    ['/pages/competitions/competitions', '竞赛', 'page'],
    ['/pages/moments/moments', '友圈', 'tab']
  ]) {
    try {
      if (kind === 'tab') await mp.switchTab(path)
      else { await mp.switchTab('/pages/index/index'); await sleep(800); await mp.navigateTo(path) }
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
