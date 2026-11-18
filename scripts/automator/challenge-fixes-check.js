// 验证：会员搜索 + 订阅页布局 + 上传视频不用等裁判（UI 层）
const automator = require('miniprogram-automator')
const fs = require('fs')
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
  await sleep(3500)

  // ---------- 1. 发起挑战：会员搜索 ----------
  console.log('\n[1] 发起挑战：会员搜索')
  const nu = await mp.navigateTo('/pages/challenges/new/new')
  await sleep(3000)
  let d = await nu.data()
  console.log('  初始会员 ' + (d.members || []).length + ' 条')
  const btns = await nu.$$('.pick-btn')
  if (btns.length) {
    await btns[0].tap()
    await sleep(1000)
    const inputs = await nu.$$('input')
    console.log('  输入框 ' + inputs.length + ' 个')
    if (inputs.length) {
      await inputs[0].input('菜')
      await sleep(1300)
      d = await nu.data()
      console.log('  搜「菜」→ ' + (d.members || []).length + ' 条：' + (d.members || []).map(x => x.name).join('、'))
      // 点确认键（原来会把关键字清空）
      await inputs[0].trigger('confirm', { value: '菜' })
      await sleep(1200)
      d = await nu.data()
      console.log('  按键盘搜索键后 keyword=' + JSON.stringify(d.keyword) + '，会员 ' + (d.members || []).length + ' 条')
      if (d.keyword === '菜' && (d.members || []).length) ok('搜索确认键不再清空关键字')
      else bad('确认键仍有问题')
      // 选中
      const rows = await nu.$$('.list-item')
      if (rows.length) {
        await rows[0].tap()
        await sleep(700)
        d = await nu.data()
        console.log('  选中: ' + JSON.stringify(d.opponent && d.opponent.name))
        if (d.opponent) ok('可以选中会员')
      }
    }
  }

  // 选裁判 + 发出挑战
  const pickBtns = await nu.$$('.pick-btn')
  if (pickBtns.length) {
    await pickBtns[0].tap()
    await sleep(900)
    const refRows = await nu.$$('.list-item')
    if (refRows.length) { await refRows[0].tap(); await sleep(600) }
  }
  await mp.evaluate(() => {
    const p = getCurrentPages()[getCurrentPages().length - 1]
    p.submit()
  })
  await sleep(6000)
  const cur = await mp.currentPage()
  const curData = await cur.data()
  if (curData && curData.id) {
    created.push(curData.id)
    console.log('  挑战 id=' + curData.id + '，状态=' + (curData.c && curData.c.status))
    ok('发起挑战成功')
  } else {
    bad('发起挑战失败')
  }

  // ---------- 2. 详情页：等待应战阶段不应有上传按钮 ----------
  console.log('\n[2] 详情页状态')
  if (curData && curData.c) {
    console.log('  canSubmitVideo=' + curData.c.canSubmitVideo + '（发起人，待应战，应为 false）')
    if (!curData.c.canSubmitVideo) ok('待应战时不能上传视频（正常）')
  }

  // ---------- 3. 订阅页布局 ----------
  console.log('\n[3] 订阅页布局')
  const sub = await mp.navigateTo('/pages/subscribe/subscribe')
  await sleep(3500)
  const groups = await sub.$$('.sub-group')
  const sbtns = await sub.$$('button')
  console.log('  分组卡片 ' + groups.length + ' 个，按钮 ' + sbtns.length + ' 个')
  if (groups.length === 2 && sbtns.length === 2) ok('内容提醒 / 挑战提醒分成两张卡')
  else bad('订阅页结构不对')
  await mp.screenshot({ path: 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview/challenge/12-subscribe-v2.png' })
  console.log('  ✓ 截图')
  await mp.navigateBack()
  await sleep(600)

  console.log('\n[4] 报错')
  const real = errs.filter(e => !/code been used|登录失败|requestSubscribeMessage|subscribe|fail/i.test(e))
  if (!real.length) ok('无 JS 报错')
  else bad('有报错', real.slice(0, 3).join(' | '))

  await mp.reLaunch('/pages/index/index')
  await sleep(500)
  await mp.disconnect()
  fs.writeFileSync('C:/Users/yuuolo/Documents/deepseek/.dsh-tools/challenge-created-ids.txt', created.join('\n'))
  console.log('\n创建的挑战: ' + (created.join(',') || '(无)'))
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
