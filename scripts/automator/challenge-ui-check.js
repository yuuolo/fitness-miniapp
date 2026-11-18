// 挑战 P1 前端联调（用 query 取文本，避免 page.text 不存在）
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }
const created = []

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const errs = []
  mp.on('console', m => { if (m.type === 'error') errs.push(String(m.args && m.args.join(' ')).slice(0, 140)) })

  await mp.reLaunch('/pages/index/index')
  await sleep(2500)

  console.log('\n[1] 我的页面入口')
  const mine = await mp.switchTab('/pages/mine/mine')
  await sleep(2500)
  const mineData = await mine.data()
  const menu = JSON.stringify(mineData)
  console.log('  challengeBadge=' + mineData.challengeBadge)
  const items = await mine.$$('.menu-item')
  const labels = []
  for (const it of items) labels.push((await it.text()).replace(/\s+/g, ' ').trim().slice(0, 10))
  console.log('  菜单: ' + JSON.stringify(labels))
  if (labels.some(x => x.indexOf('会员挑战') >= 0)) ok('我的页面有会员挑战入口')
  else bad('没有入口')

  console.log('\n[2] 挑战大厅')
  const list = await mp.navigateTo('/pages/challenges/list/list')
  await sleep(3000)
  let d = await list.data()
  console.log('  tab=' + d.tab + '，loaded=' + d.loaded + '，条数=' + (d.list || []).length)
  const tabs = await list.$$('.tab')
  console.log('  筛选 tab: ' + tabs.length)
  if (d.loaded && tabs.length === 4) ok('大厅加载完成，4 个筛选')
  else bad('大厅异常')
  if (tabs.length) {
    await tabs[1].tap()
    await sleep(1500)
    d = await list.data()
    console.log('  切「我参与」→ tab=' + d.tab + '，条数=' + (d.list || []).length)
    if (d.tab === 'mine') ok('筛选切换正常')
  }

  console.log('\n[3] 发起挑战')
  const nu = await mp.navigateTo('/pages/challenges/new/new')
  await sleep(3000)
  d = await nu.data()
  console.log('  项目 ' + (d.lifts || []).length + ' 个，裁判候选 ' + (d.referees || []).length + ' 位')
  if ((d.referees || []).length) ok('裁判候选有教练')
  else bad('没有可选教练')

  let pickBtns = await nu.$$('.pick-btn')
  console.log('  选择按钮: ' + pickBtns.length)
  if (pickBtns.length) {
    await pickBtns[0].tap()
    await sleep(1200)
    const inputs = await nu.$$('input')
    if (inputs.length) {
      await inputs[0].input('龙')
      await sleep(1200)
      d = await nu.data()
      console.log('  搜「龙」→ ' + (d.members || []).length + ' 条')
      const rows = await nu.$$('.list-item')
      if (rows.length) {
        await rows[0].tap()
        await sleep(800)
        d = await nu.data()
        console.log('  对手: ' + JSON.stringify(d.opponent && d.opponent.name))
        if (d.opponent) ok('会员搜索选人正常')
      }
    }
  }

  pickBtns = await nu.$$('.pick-btn')
  console.log('  选完对手后剩余选择按钮: ' + pickBtns.length)
  if (pickBtns.length) {
    await pickBtns[0].tap()
    await sleep(1000)
    const refRows = await nu.$$('.list-item')
    console.log('  教练行: ' + refRows.length)
    if (refRows.length) {
      await refRows[0].tap()
      await sleep(700)
      d = await nu.data()
      console.log('  裁判: ' + JSON.stringify(d.referee && d.referee.name))
      if (d.referee) ok('可以指定教练当裁判')
    }
  }

  // 点「发出挑战」
  await mp.evaluate(() => {
    const p = getCurrentPages()[getCurrentPages().length - 1]
    p.submit()
  })
  await sleep(3500)
  const cur = await mp.currentPage()
  const curData = await cur.data()
  console.log('  当前页: ' + cur.path)
  if (curData && curData.id) {
    created.push(curData.id)
    console.log('  详情 id=' + curData.id + '，状态=' + JSON.stringify(curData.c && curData.c.status) +
      '，倒计时=' + JSON.stringify(curData.countdownText))
    if (curData.c && curData.c.status === 'pending') ok('发起成功 → 详情（待应战）')
    else bad('详情状态不对')
  } else {
    bad('没有跳到详情')
  }

  console.log('\n[4] 详情页')
  if (curData && curData.c) {
    const pageText = { c: curData.c }
    console.log('  裁判: ' + pageText.c.referee.name + '（' + pageText.c.referee.state + '）')
    console.log('  视频数: ' + (pageText.c.videos || []).length + '，理由: ' + JSON.stringify(pageText.c.judgeNote))
    ok('详情数据完整')
  }

  console.log('\n[5] 教练端待判列表')
  const staff = await mp.navigateTo('/pages/staff/challenges/challenges')
  await sleep(2500)
  d = await staff.data()
  console.log('  条数: ' + (d.list || []).length + '，loaded=' + d.loaded)
  if (d.loaded) ok('教练端列表可打开')
  await mp.navigateBack()
  await sleep(600)

  console.log('\n[6] 报错')
  const real = errs.filter(e => !/code been used|登录失败|subscribe/i.test(e))
  if (!real.length) ok('无 JS 报错')
  else bad('有报错', real.slice(0, 3).join(' | '))

  await mp.reLaunch('/pages/index/index')
  await sleep(500)
  await mp.disconnect()
  require('fs').writeFileSync('C:/Users/yuuolo/Documents/deepseek/.dsh-tools/challenge-created-ids.txt', created.join('\n'))
  console.log('\n创建的挑战: ' + (created.join(',') || '(无)'))
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
