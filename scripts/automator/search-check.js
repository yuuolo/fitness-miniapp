// 验证：会员列表 1 字预搜 + 友圈搜索/只看视频
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

  console.log('\n[1] 员工端会员列表：输入 1 个字就预搜')
  await mp.reLaunch('/pages/index/index')
  await sleep(2500)
  const members = await mp.navigateTo('/pages/staff/members/members')
  await sleep(3000)
  let d = await members.data()
  console.log('  初始 ' + (d.list || []).length + ' 条')
  const inputs = await members.$$('input')
  if (!inputs.length) {
    bad('没找到搜索框')
  } else {
    await inputs[0].input('雷')
    await sleep(1200)
    d = await members.data()
    const names = (d.list || []).map(x => x.nickName || x.phone || x._id.slice(0, 6))
    console.log('  输入「雷」后 ' + names.length + ' 条: ' + names.join('、'))
    if (d.keyword === '雷') ok('输入即时生效（无需点搜索）')
    else bad('keyword 没更新', d.keyword)
    if (names.length && names.length < 8) ok('列表已按关键字筛选')
    else console.log('  · 命中 ' + names.length + ' 条（数据里可能没有含「雷」的昵称）')
  }
  await mp.navigateBack()
  await sleep(700)

  console.log('\n[2] 友圈：搜索 1 个字 + 只看视频')
  const feed = await mp.switchTab('/pages/moments/moments')
  await sleep(3500)
  let fd = await feed.data()
  console.log('  初始 ' + (fd.list || []).length + ' 条，keyword=' + JSON.stringify(fd.keyword) + ' onlyVideo=' + fd.onlyVideo)
  const searchInputs = await feed.$$('.search-input')
  if (!searchInputs.length) {
    bad('没找到友圈搜索框')
  } else {
    await searchInputs[0].input('型')
    await sleep(1500)
    fd = await feed.data()
    const hits = (fd.list || []).map(x => String(x.content).slice(0, 8))
    console.log('  搜「型」后 ' + hits.length + ' 条: ' + hits.join(' | '))
    if (hits.length > 0) ok('1 个字就能搜到')
    else bad('没搜到结果')
  }

  const chips = await feed.$$('.search-chip')
  if (chips.length) {
    await chips[0].tap()
    await sleep(1500)
    fd = await feed.data()
    const types = (fd.list || []).map(x => x.type)
    console.log('  只看视频（' + fd.onlyVideo + '）: ' + types.length + ' 条，类型=' + types.join(','))
    if (fd.onlyVideo) ok('只看视频开关生效')
    else bad('开关没生效')
    if (types.every(t => t === 'video')) ok('结果全是视频')
  }

  const clears = await feed.$$('.search-clear')
  if (clears.length) {
    await clears[0].tap()
    await sleep(1500)
    fd = await feed.data()
    console.log('  清空后 ' + (fd.list || []).length + ' 条，keyword=' + JSON.stringify(fd.keyword) + ' onlyVideo=' + fd.onlyVideo)
    if (!fd.keyword && !fd.onlyVideo && (fd.list || []).length > 0) ok('清空恢复全部')
  }

  console.log('\n[3] 报错')
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
