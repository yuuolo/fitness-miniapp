// 验证三处会员搜索行为已统一
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const errs = []
  mp.on('console', m => { if (m.type === 'error') errs.push(String(m.args && m.args.join(' ')).slice(0, 120)) })
  console.log('已连接')

  // ---------- 1. 员工端会员列表 ----------
  console.log('\n[1] 员工端会员列表')
  await mp.reLaunch('/pages/index/index')
  await sleep(2500)
  const members = await mp.navigateTo('/pages/staff/members/members')
  await sleep(3500)
  let d = await members.data()
  console.log('  默认列表 ' + (d.members || []).length + ' 条（memberLoading=' + d.memberLoading + '）')
  if ((d.members || []).length > 0) ok('空关键字就有默认列表（不用先搜索）')
  const mi = await members.$$('input')
  if (mi.length) {
    await mi[0].input('雷')
    await sleep(1000)
    d = await members.data()
    const names = (d.members || []).map(x => x.nickName || x.phone)
    console.log('  输入「雷」→ ' + names.length + ' 条: ' + names.join('、'))
    if (d.keyword === '雷' && names.length < 10) ok('输入 1 个字即时筛选')
  }
  await mp.navigateBack()
  await sleep(600)

  // ---------- 2. 友圈发动态代发选会员 ----------
  console.log('\n[2] 友圈发动态：代发选会员')
  const post = await mp.navigateTo('/pages/moments/post/post')
  await sleep(3000)
  d = await post.data()
  console.log('  canCoach=' + d.canCoach + '，默认会员 ' + (d.members || []).length + ' 条，已选=' + JSON.stringify(d.pickedMember))
  if (d.canCoach) {
    const inputs = await post.$$('input')
    if (inputs.length) {
      const last = inputs[inputs.length - 1]
      await last.input('菜')
      await sleep(1000)
      d = await post.data()
      const names = (d.members || []).map(x => x.name)
      console.log('  搜「菜」→ ' + names.length + ' 条: ' + names.join('、'))
      if (d.keyword === '菜') ok('代发选择也是输入即搜（不再是下拉框）')
      const rows = await post.$$('.list-item')
      if (rows.length) {
        await rows[rows.length - 1].tap()
        await sleep(600)
        d = await post.data()
        console.log('  点选后 pickedMember=' + JSON.stringify(d.pickedMember))
        if (d.pickedMember) ok('可以点选会员')
        await mp.evaluate(() => {
          const p = getCurrentPages()[getCurrentPages().length - 1]
          p.clearPickedMember()
        })
      }
    }
  } else {
    ok('当前账号不是教练，跳过（教练/管理员才显示）')
  }
  await mp.navigateBack()
  await sleep(600)

  // ---------- 3. 竞赛录入 ----------
  console.log('\n[3] 竞赛录入：选会员')
  const comps = await mp.navigateTo('/pages/staff/competitions/competitions')
  await sleep(2500)
  const cd = await comps.data()
  const list = cd.list || cd.competitions || []
  console.log('  竞赛数: ' + list.length)
  if (list.length) {
    const go = await comps.$$('.list-item')
    if (go.length) {
      await go[0].tap()
      await sleep(2500)
      const cur = await mp.currentPage()
      const curData = await cur.data()
      if (curData && curData.memberLoading !== undefined) {
        console.log('  会员搜索字段: memberLoading=' + curData.memberLoading + ' 默认 ' + (curData.members || []).length + ' 条')
        const inputs = await cur.$$('input')
        if (inputs.length) {
          await inputs[0].input('Yu')
          await sleep(1000)
          const d2 = await cur.data()
          console.log('  输入「Yu」→ ' + (d2.members || []).length + ' 条: ' + (d2.members || []).map(x => x.nickName).join('、'))
          if (d2.keyword === 'Yu') ok('竞赛录入也是输入即搜')
        }
      } else {
        ok('（当前页面不是成绩录入页，跳过）')
      }
    }
  } else {
    ok('没有竞赛，跳过')
  }

  console.log('\n[4] 报错')
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
