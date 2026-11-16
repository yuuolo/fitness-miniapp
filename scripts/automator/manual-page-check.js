// 验证「我的 → 算法说明」页面
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  console.log('已连接')

  await mp.reLaunch('/pages/mine/mine')
  await sleep(3500)

  console.log('\n[1] 我的页面入口')
  const page = await mp.currentPage()
  let target = null
  const items = await page.$$('.menu-item')
  const labels = []
  for (const el of items) {
    const t = String(await el.text()).replace(/\s+/g, '').trim()
    labels.push(t)
    if (t.indexOf('算法说明') >= 0) target = el
  }
  console.log('  菜单: ' + JSON.stringify(labels))
  if (target) ok('「算法说明」入口存在')
  else bad('没有算法说明入口')

  if (!target) { await mp.disconnect(); process.exit(1) }

  console.log('\n[2] 进入说明页')
  await target.tap()
  await sleep(3000)
  const mp2 = await mp.currentPage()
  console.log('  当前页: ' + mp2.path)
  if (mp2.path.indexOf('manual') >= 0) ok('跳到了算法说明页')
  else bad('跳转不对', mp2.path)

  const d = await mp2.data()
  const sections = d.sections || []
  console.log('  章节数: ' + sections.length)
  sections.forEach((s, i) => console.log('    ' + (i + 1) + '. ' + s.title))
  if (sections.length >= 5) ok('章节齐全')
  else bad('章节太少', sections.length)

  // 关键算法数字必须在
  const blob = JSON.stringify(sections)
  const must = [
    ['Epley 公式', blob.indexOf('Epley') >= 0],
    ['体脂理想区间 15–20', blob.indexOf('15–20') >= 0],
    ['相对力量 3.0 / 2.2', blob.indexOf('3.0') >= 0 && blob.indexOf('2.2') >= 0],
    ['BMI 18.5–24', blob.indexOf('18.5') >= 0],
    ['打分权重 40/40/20', blob.indexOf('40 分') >= 0 && blob.indexOf('20 分') >= 0],
    ['六边形区间 0.3/1.4', blob.indexOf('0.3') >= 0 && blob.indexOf('1.4') >= 0],
    ['相对体重榜规则', blob.indexOf('相对体重') >= 0]
  ]
  must.forEach(([name, hit]) => hit ? ok('含「' + name + '」') : bad('缺「' + name + '」'))

  console.log('\n[3] 展开 / 收起')
  const cards = await mp2.$$('.card')
  console.log('  .card 数量: ' + cards.length)
  const openNow = (d.open || {})
  console.log('  默认展开: ' + JSON.stringify(openNow))
  if (openNow.score === true) ok('默认展开第一节（身体评分）')
  else bad('默认展开状态不对')

  // 点第二张卡片头部展开
  const head = await mp2.$$('.head')
  console.log('  可点击标题数: ' + head.length)
  if (head.length >= 6) ok('6 个章节都可点击')
  else bad('标题数量不对', head.length)

  await head[1].tap()
  await sleep(800)
  const d2 = await mp2.data()
  const secondId = sections[1].id
  if (d2.open[secondId]) ok('点击后第二节展开')
  else bad('点击没展开')

  // 全部展开
  const btns = await mp2.$$('.mini-btn')
  console.log('  按钮: ' + btns.length)
  if (btns.length >= 2) {
    await btns[0].tap()
    await sleep(800)
    const d3 = await mp2.data()
    const allOpen = sections.every(s => d3.open[s.id])
    if (allOpen) ok('「全部展开」生效')
    else bad('全部展开没生效')
    const num = await mp2.$$('.tr')
    console.log('  表格行元素数: ' + num.length)
    if (num.length > 10) ok('内容表格已渲染（' + num.length + ' 行）')
    else bad('表格没渲染', num.length)

    await btns[1].tap()
    await sleep(600)
    const d4 = await mp2.data()
    if (Object.keys(d4.open).length === 0) ok('「全部收起」生效')
    else bad('全部收起没生效')
  }

  await mp.navigateBack()
  await sleep(700)
  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
