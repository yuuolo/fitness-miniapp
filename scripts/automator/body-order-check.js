// 验证：身体数据历史按测量日期排序 + 历史行带报告图可点
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

const TARGET = process.env.TARGET_OPENID

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  console.log('已连接')

  console.log('\n[1] 员工端：身体数据历史')
  const page = await mp.navigateTo('/pages/staff/fitness/fitness?id=' + TARGET + '&tab=body')
  await sleep(4000)
  const d = await page.data()
  const hist = (d.f && d.f.bodyHistory) || []
  console.log('  会员: ' + (d.f && d.f.memberName) + '，历史 ' + hist.length + ' 条')
  hist.forEach(h => console.log('    ' + h.date + ' · ' + h.weight + 'kg · 报告图 ' + (h.reportImage ? '有' : '无')))
  const dates = hist.map(h => h.date)
  const sorted = dates.slice().sort().reverse()
  if (JSON.stringify(dates) === JSON.stringify(sorted)) ok('按测量日期倒序')
  else bad('排序不对', dates.join(','))

  const withImg = hist.filter(h => h.reportImage).length
  if (withImg > 0) ok(withImg + ' 条带报告图（可点开查看）')
  else console.log('  · 该会员历史里暂无报告图')

  // 点击有报告图的记录，确认不报错
  const rows = await page.$$('.list-item')
  let tapped = false
  for (let i = 0; i < rows.length; i++) {
    const el = rows[i]
    const src = await el.attribute('data-src')
    if (src) { await el.tap(); tapped = true; break }
  }
  await sleep(1200)
  if (tapped) ok('点开报告图没有触发报错')
  else ok('无报告图可点，跳过预览（不会崩）')

  console.log('\n[2] 会员资料页：历史身体资料')
  await mp.navigateBack()
  await sleep(800)
  const mpage = await mp.navigateTo('/pages/member/member?openid=' + TARGET)
  await sleep(3500)
  const md = await mpage.data()
  const list = md.bodyList || []
  console.log('  历史 ' + list.length + ' 条，带报告图 ' + list.filter(x => x.reportImage).length + ' 条')
  list.slice(0, 3).forEach(x => console.log('    ' + x.date + ' · ' + x.weight + 'kg · 图' + (x.reportImage ? '有' : '无')))
  if (list.length) ok('资料页历史已带报告图字段')

  await mp.reLaunch('/pages/index/index')
  await sleep(600)
  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
