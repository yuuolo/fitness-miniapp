// 验证：身体数据页「最新 vs 上一次」对比 + 指标历史曲线页
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const errs = []
  mp.on('console', m => { if (m.type === 'error') errs.push(String(m.args && m.args.join(' ')).slice(0, 160)) })

  await mp.reLaunch('/pages/index/index')
  await sleep(3500)

  console.log('\n[1] 身体数据页：指标对比')
  const page = await mp.navigateTo('/pages/fitness/fitness')
  await sleep(3500)
  let d = await page.data()
  console.log('  对比指标数: ' + (d.compare || []).length)
  const sample = (d.compare || []).slice(0, 5).map(x =>
    x.name + ' 最新' + x.value + (x.hasPrev ? ' / 上次' + x.prev + ' (' + x.deltaText + ',' + x.tone + ')' : ' (无上次)')
  )
  sample.forEach(s => console.log('    ' + s))
  if ((d.compare || []).length > 0) ok('指标对比数据已生成')
  else bad('没有对比数据')
  if ((d.compare || []).some(x => x.hasPrev)) ok('有「最新 vs 上一次」对比')
  else console.log('  （当前只有一份报告，暂时没有上次数据）')

  const rows = await page.$$('.metric-row')
  console.log('  指标行元素: ' + rows.length)
  if (rows.length) ok('指标行可点击')
  else bad('没有指标行')

  await mp.screenshot({ path: 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview/challenge/14-body-compare.png' })

  console.log('\n[2] 点指标 → 历史曲线页')
  if (rows.length) {
    await rows[0].tap()
    await sleep(3000)
    const cur = await mp.currentPage()
    const cd = await cur.data()
    console.log('  当前页: ' + cur.path)
    console.log('  指标: ' + (cd.meta && cd.meta.name) + '，记录条数: ' + cd.count +
      '，最新: ' + JSON.stringify(cd.latest) + '，有曲线: ' + !!cd.svg)
    if (cur.path.indexOf('fitness-metric') >= 0) ok('跳转到指标历史页')
    else bad('没有跳转')
    if (cd.meta && cd.meta.name) ok('指标名正确')
    if (cd.latest) ok('显示最新值')
    await mp.screenshot({ path: 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview/challenge/15-metric-chart.png' })

    // 看曲线元素
    const chart = await cur.$$('.chart')
    console.log('  曲线元素: ' + chart.length)
    if (chart.length) ok('曲线区域已渲染')
    await mp.navigateBack()
    await sleep(800)
  }

  console.log('\n[3] 报错')
  const real = errs.filter(e => !/code been used|登录失败|subscribe|fail/i.test(e))
  if (!real.length) ok('无 JS 报错')
  else bad('有报错', real.slice(0, 3).join(' | '))

  await mp.reLaunch('/pages/index/index')
  await sleep(500)
  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
