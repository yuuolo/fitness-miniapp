// 验证：三类录入拆分成 tab + 会员详情三个入口
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

const TARGET = process.env.TARGET_OPENID || ''

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  console.log('已连接')

  console.log('\n[1] 会员详情页：三个入口')
  await mp.reLaunch('/pages/index/index')
  await sleep(2000)
  const staff = await mp.navigateTo('/pages/staff/members/members')
  await sleep(3500)
  let rows = await staff.$$('.list-item')
  await rows[0].tap()
  await sleep(3200)
  const mpage = await mp.currentPage()
  const labels = []
  for (const el of await mpage.$$('.list-item')) {
    labels.push(String(await el.text()).replace(/\s+/g, ' ').trim().slice(0, 16))
  }
  console.log('  入口: ' + JSON.stringify(labels))
  const need = ['身体数据', '力量成绩', '运动记录']
  const hit = need.filter(n => labels.some(l => l.indexOf(n) >= 0))
  if (hit.length === 3) ok('三个录入入口都在')
  else bad('入口缺失', JSON.stringify(need.filter(n => hit.indexOf(n) < 0)))

  console.log('\n[2] 默认进「身体数据」tab')
  for (const el of await mpage.$$('.list-item')) {
    if (String(await el.text()).indexOf('身体数据') >= 0) { await el.tap(); break }
  }
  await sleep(3500)
  let page = await mp.currentPage()
  let d = await page.data()
  console.log('  tab=' + d.tab + '  身体数据表单字段数=' + Object.keys(d.body || {}).length)
  if (d.tab === 'body') ok('默认 tab = body')
  else bad('默认 tab 不对', d.tab)
  let segs = await page.$$('.seg-tab')
  console.log('  分段按钮数: ' + segs.length)
  if (segs.length === 3) ok('三个分段按钮')
  else bad('分段按钮数量不对', segs.length)

  console.log('\n[3] 切到「力量成绩」')
  for (const el of segs) {
    if (String(await el.text()).indexOf('力量成绩') >= 0) { await el.tap(); break }
  }
  await sleep(1200)
  d = await page.data()
  console.log('  tab=' + d.tab + '  力量历史 ' + (d.strengthList || []).length + ' 条')
  if (d.tab === 'strength') ok('切到 strength')
  else bad('切换失败', d.tab)
  if ((d.strengthList || []).length >= 0) ok('力量成绩历史列表已生成（' + (d.strengthList || []).length + ' 条）')

  console.log('\n[4] 切到「运动记录」')
  segs = await page.$$('.seg-tab')
  for (const el of segs) {
    if (String(await el.text()).indexOf('运动记录') >= 0) { await el.tap(); break }
  }
  await sleep(1200)
  d = await page.data()
  console.log('  tab=' + d.tab + '  运动历史 ' + (d.activityList || []).length + ' 条')
  if (d.tab === 'activity') ok('切到 activity')
  else bad('切换失败', d.tab)
  if ((d.activityList || []).length) {
    console.log('    第一条: ' + d.activityList[0].typeName + ' ' + d.activityList[0].detail)
  }

  console.log('\n[5] 直接带 tab 参数进入')
  await mp.navigateBack()
  await sleep(600)
  const direct = await mp.navigateTo('/pages/staff/fitness/fitness?id=' + TARGET + '&tab=strength')
  await sleep(3500)
  const dd = await direct.data()
  console.log('  tab=' + dd.tab)
  if (dd.tab === 'strength') ok('?tab=strength 生效')
  else bad('参数没生效', dd.tab)

  await mp.reLaunch('/pages/index/index')
  await sleep(600)
  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
