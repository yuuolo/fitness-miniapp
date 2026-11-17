// 验证首页：快捷入口=综合评分榜，排行榜预览=最近有更新的力量项目
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const errs = []
  mp.on('console', m => { if (m.type === 'error') errs.push(String(m.args && m.args.join(' ')).slice(0, 120)) })

  await mp.reLaunch('/pages/index/index')
  await sleep(5000)
  const page = await mp.currentPage()
  const d = await page.data()

  console.log('\n[1] 快捷入口（排行榜格子）')
  const q = await page.$$('.q-rank')
  const qText = q.length ? String(await q[0].text()).replace(/\s+/g, ' ').trim() : '(没找到)'
  console.log('  文案: ' + qText)
  if (qText.indexOf('综合评分榜') >= 0) ok('标题是「综合评分榜」')
  else bad('标题不对')
  if (d.scoreRank) ok('显示我的名次：第 ' + d.scoreRank + ' 名')
  else console.log('  · 暂无我的评分排名（还没体测）')

  console.log('\n[2] 排行榜预览（力量榜）')
  console.log('  rankName=' + d.rankName + ' rankUnit=' + d.rankUnit + ' rankNote=' + d.rankNote)
  const titles = await page.$$('.section-title')
  for (const t of titles) {
    const txt = String(await t.text()).replace(/\s+/g, ' ').trim()
    if (txt.indexOf('排行榜') >= 0) console.log('  标题: ' + txt)
  }
  if (d.rankName && d.rankName !== '卧推') ok('不再固定卧推，当前是「' + d.rankName + '」')
  else if (d.rankName === '卧推') console.log('  · 最近有更新的恰好是卧推（正常）')
  if (d.rankNote === '最近有更新') ok('标注了「最近有更新」')
  else bad('缺少最近更新标记')

  console.log('\n[3] 点快捷入口 → 综合评分榜页')
  await (await page.$$('.q-rank'))[0].tap()
  await sleep(3500)
  let rank = await mp.currentPage()
  let rd = await rank.data()
  console.log('  页面 lift=' + rd.lift + ' liftName=' + (rd.board && rd.board.liftName))
  if (rd.lift === 'score') ok('进的是综合评分榜')
  else bad('进的不是综合评分榜', rd.lift)
  const scoreNote = String(await rank.$('.auto-note').catch(() => null) || '')
  await mp.navigateBack()
  await sleep(1500)

  console.log('\n[4] 点预览的「查看全部」→ 力量榜页（自动挑项目）')
  const page2 = await mp.currentPage()
  const viewAll = await page2.$$('.section-title text')
  let tapped = false
  for (const el of viewAll) {
    if (String(await el.text()).indexOf('查看全部') >= 0) { await el.tap(); tapped = true; break }
  }
  if (!tapped) {
    // 退而求其次：直接调方法
    await mp.evaluate(() => {
      const p = getCurrentPages()[getCurrentPages().length - 1]
      if (p && p.goRankLift) p.goRankLift()
    })
  }
  await sleep(3500)
  const rank2 = await mp.currentPage()
  const rd2 = await rank2.data()
  console.log('  页面 lift=' + (rd2.lift || '(自动)') + ' autoNote=' + (rd2.autoNote || ''))
  if (!rd2.lift || rd2.lift !== 'score') ok('力量榜（不指定项目，由服务端自动挑）')
  else bad('误进综合评分榜')

  console.log('\n[5] 报错')
  const real = errs.filter(e => !/code been used|登录失败/i.test(e))
  if (!real.length) ok('无 JS 报错')
  else bad('有报错', real.join(' | '))

  await mp.reLaunch('/pages/index/index')
  await sleep(600)
  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
