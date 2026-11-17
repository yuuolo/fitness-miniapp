// 验证：会员选择默认收起，点「选择会员」图标才展开（竞赛录入 + 友圈代发）
const fs = require('fs')
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

const CID = (() => {
  try { return fs.readFileSync('C:/Users/yuuolo/Documents/deepseek/.dsh-tools/competition-id.txt', 'utf8').trim() } catch (e) { return '' }
})()

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const errs = []
  mp.on('console', m => { if (m.type === 'error') errs.push(String(m.args && m.args.join(' ')).slice(0, 130)) })

  await mp.reLaunch('/pages/index/index')
  await sleep(2500)

  // ---------- 1. 竞赛录入 ----------
  console.log('\n[1] 竞赛录入：会员选择')
  const page = await mp.navigateTo('/pages/staff/competition-entry/competition-entry?id=' + CID)
  await sleep(3500)
  let d = await page.data()
  console.log('  memberOpen=' + d.memberOpen + '，会员列表 ' + (d.members || []).length + ' 条')
  let pickBtns = await page.$$('.pick-btn')
  let rows = await page.$$('.list-item')
  console.log('  「选择会员」按钮: ' + pickBtns.length + '，列表行: ' + rows.length)
  if (d.memberOpen === false) ok('默认收起')
  else bad('默认没收起')
  if (rows.length === 0) ok('收起时不渲染会员列表')
  else bad('收起时还显示了列表')

  if (pickBtns.length) {
    await pickBtns[0].tap()
    await sleep(1000)
    d = await page.data()
    rows = await page.$$('.list-item')
    console.log('  点开后 memberOpen=' + d.memberOpen + '，列表行 ' + rows.length)
    if (d.memberOpen && rows.length > 0) ok('点图标后展开列表')
    else bad('没展开')

    // 点选一个会员 → 应自动收起并显示已选
    await rows[0].tap()
    await sleep(800)
    d = await page.data()
    console.log('  点选后 picked=' + JSON.stringify(d.picked && (d.picked.nickName || d.picked.phone)) +
      '，memberOpen=' + d.memberOpen)
    if (d.picked && d.memberOpen === false) ok('选中后自动收起并显示已选')
    else bad('选中后状态不对')
  }

  await mp.navigateBack()
  await sleep(700)

  // ---------- 2. 友圈代发 ----------
  console.log('\n[2] 友圈发动态：代发会员选择')
  const post = await mp.navigateTo('/pages/moments/post/post')
  await sleep(3000)
  d = await post.data()
  console.log('  canCoach=' + d.canCoach + '，memberOpen=' + d.memberOpen)
  if (d.canCoach) {
    let btns = await post.$$('.pick-btn')
    rows = await post.$$('.list-item')
    console.log('  「选择会员」按钮: ' + btns.length + '，列表行: ' + rows.length)
    if (d.memberOpen === false && rows.length === 0) ok('默认收起，不显示列表')
    else bad('默认状态不对')
    if (btns.length) {
      await btns[0].tap()
      await sleep(1200)
      d = await post.data()
      rows = await post.$$('.list-item')
      console.log('  点开后 memberOpen=' + d.memberOpen + '，列表行 ' + rows.length)
      if (d.memberOpen && rows.length > 0) ok('点图标后展开')
      if (rows.length) {
        await rows[0].tap()
        await sleep(700)
        d = await post.data()
        console.log('  点选后 pickedMember=' + JSON.stringify(d.pickedMember && d.pickedMember.name) + '，memberOpen=' + d.memberOpen)
        if (d.pickedMember && d.memberOpen === false) ok('选中后收起')
      }
    }
  } else {
    ok('当前账号不是教练，跳过')
  }
  await mp.navigateBack()
  await sleep(600)

  console.log('\n[3] 报错')
  const real = errs.filter(e => !/code been used|登录失败/i.test(e))
  if (!real.length) ok('无 JS 报错')
  else bad('有报错', real.join(' | '))

  await mp.reLaunch('/pages/index/index')
  await sleep(500)
  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
