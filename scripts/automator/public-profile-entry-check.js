// 验证：员工端会员详情页新增的「查看公开资料」入口
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

  // 员工工作台 → 会员资料
  const staff = await mp.navigateTo('/pages/staff/index/index')
  await sleep(3000)
  for (const el of await staff.$$('.list-item')) {
    if (String(await el.text()).indexOf('会员资料') >= 0) { await el.tap(); break }
  }
  await sleep(3000)
  const listPage = await mp.currentPage()
  const rows = await listPage.$$('.list-item')
  log('\n[1] 会员列表 ' + rows.length + ' 条，点第一个')
  await rows[0].tap()
  await sleep(3200)

  const page = await mp.currentPage()
  log('  当前页: ' + page.path)

  log('\n[2] 检查新增入口')
  const texts = []
  let publicRow = null
  for (const el of await page.$$('.list-item')) {
    const t = String(await el.text()).trim()
    texts.push(t)
    if (t.indexOf('查看公开资料') >= 0) publicRow = el
  }
  log('  卡片行: ' + JSON.stringify(texts.map(t => t.replace(/\s+/g, ' ').slice(0, 40))))
  if (publicRow) ok('「查看公开资料」入口已出现')
  else bad('没有「查看公开资料」入口')

  if (!publicRow) { await mp.disconnect(); process.exit(1) }

  log('\n[3] 点击进入公开资料页')
  await publicRow.tap()
  await sleep(3500)
  const pub = await mp.currentPage()
  log('  当前页: ' + pub.path)
  if (pub.path.indexOf('member/member') >= 0) ok('跳到了公开资料页')
  else bad('跳转不对', pub.path)

  const d = await pub.data()
  log('  member: ' + (d.member ? d.member.nickName : 'null') + ' / ' + (d.member ? d.member.roleName : ''))
  if (d.member && d.member.nickName) ok('公开资料页正常加载')
  else bad('公开资料页没数据')
  log('  pk: ' + (d.pk ? ('ready=' + d.pk.ready + ' 我=' + d.pk.myScore + ' TA=' + d.pk.theirScore) : 'null'))

  // 返回
  await mp.navigateBack()
  await sleep(700)
  await mp.navigateBack()
  await sleep(600)
  await mp.navigateBack()
  await sleep(600)
  await mp.reLaunch('/pages/index/index')
  await sleep(600)
  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => { console.error('异常:', e.message); process.exit(2) })
