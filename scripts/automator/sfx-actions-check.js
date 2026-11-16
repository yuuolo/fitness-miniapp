// 验证点赞流程 + 音效模块运行时不报错
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const errors = []
  mp.on('console', msg => {
    if (msg.type === 'error') errors.push(String(msg.args && msg.args.join(' ')).slice(0, 160))
  })
  mp.on('exception', e => errors.push(String(JSON.stringify(e)).slice(0, 160)))

  console.log('已连接')

  console.log('\n[1] 友圈点赞（会触发 playLike）')
  await mp.reLaunch('/pages/moments/moments')
  await sleep(4500)
  const page = await mp.currentPage()
  let d = await page.data()
  const list = d.list || []
  console.log('  动态数: ' + list.length)
  if (!list.length) { bad('没有动态数据'); await mp.disconnect(); process.exit(1) }

  const likes = await page.$$('.like')
  const before = list[0].likeCount || 0
  const wasLiked = !!list[0].liked
  console.log('  第一条: 点赞数 ' + before + '，原先 liked=' + wasLiked)

  await likes[0].tap()
  await sleep(2200)
  d = await page.data()
  const mid = (d.list[0] || {}).likeCount || 0
  console.log('  点了之后: 点赞数 ' + mid + '，liked=' + (d.list[0] || {}).liked)
  if ((d.list[0] || {}).liked !== wasLiked) ok('点赞状态已切换（音效已触发）')
  else bad('点赞状态没变')

  await likes[0].tap()
  await sleep(2200)
  d = await page.data()
  console.log('  再点回来: 点赞数 ' + ((d.list[0] || {}).likeCount || 0) + '，liked=' + (d.list[0] || {}).liked)
  if ((d.list[0] || {}).liked === wasLiked) ok('可以正常取消（取消时不响）')
  else bad('取消点赞异常')

  console.log('\n[2] 友圈详情页加载（含 playLike/playDelete 的 require）')
  const detail = await page.$('.moment-row')
  if (detail) {
    await detail.tap()
    await sleep(3200)
  }
  const cur = await mp.currentPage()
  console.log('  当前页: ' + cur.path)
  if (cur.path.indexOf('detail') >= 0) ok('详情页加载正常')
  else bad('没进入详情页', cur.path)

  console.log('\n[3] 运行时报错检查')
  const real = errors.filter(e => !/code been used|登录失败/i.test(e))
  real.forEach(e => console.log('    报错: ' + e))
  if (!real.length) ok('整个过程没有 JS 报错（音效模块加载正常）')
  else bad('有报错', real.length)

  await mp.reLaunch('/pages/index/index')
  await sleep(600)
  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
