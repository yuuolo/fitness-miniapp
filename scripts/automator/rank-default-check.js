// 验证排行榜默认选中「最近有变化」的项目
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  console.log('已连接')

  await mp.reLaunch('/pages/rank/rank')
  await sleep(5000)
  const page = await mp.currentPage()
  const d = await page.data()

  console.log('\n[1] 首次进入（不手动选项目）')
  console.log('  当前项目: ' + d.lift)
  console.log('  提示: ' + (d.autoNote || '(无)'))
  console.log('  榜单: ' + (d.board ? d.board.periodName + ' · ' + d.board.liftName + ' · ' + d.board.total + ' 人' : 'null'))
  console.log('  项目列表: ' + JSON.stringify((d.lifts || []).map(l => l.key)))

  if (d.lift) ok('已选中项目：' + d.lift)
  else bad('没有选中项目')

  if (d.autoNote && d.autoNote.indexOf('默认显示最近有更新') >= 0) ok('显示提示：' + d.autoNote)
  else bad('没有自动选择提示', d.autoNote)

  if (d.autoNote) {
    const hit = d.autoNote.match(/「(.+?)」/)
    if (hit && d.board && hit[1] === d.board.liftName) ok('提示里的项目与榜单一致：' + hit[1])
    else bad('提示与榜单不一致', hit && hit[1] + ' vs ' + (d.board && d.board.liftName))
  }

  console.log('\n[2] 手动切到另一个项目，提示应消失')
  const tabs = await page.$$('.tab')
  console.log('  项目 tab 数: ' + tabs.length)
  let other = null
  for (const t of tabs) {
    const key = await t.attribute('data-key')
    if (key && key !== d.lift) { other = t; break }
  }
  if (other) {
    const key = await other.attribute('data-key')
    await other.tap()
    await sleep(2500)
    const d2 = await page.data()
    console.log('  切到: ' + d2.lift + '  提示: ' + (d2.autoNote || '(无)'))
    if (d2.lift === key) ok('手动切换生效：' + key)
    else bad('切换没生效', d2.lift + ' 期望 ' + key)
    if (!d2.autoNote) ok('手动选择后提示消失')
    else bad('提示没有消失', d2.autoNote)
  } else {
    log('  只有一个项目，跳过')
  }

  console.log('\n[3] 切周期后仍保留当前项目')
  const periods = await page.$$('.d')
  if (periods.length) {
    await periods[periods.length - 1].tap()
    await sleep(2500)
    const d3 = await page.data()
    console.log('  周期: ' + d3.period + ' 项目: ' + d3.lift + ' 提示: ' + (d3.autoNote || '(无)'))
    if (d3.period === 'all') ok('周期切换生效')
    if (!d3.autoNote) ok('切周期不重新自动选项目')
  }

  await mp.reLaunch('/pages/index/index')
  await sleep(700)
  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
