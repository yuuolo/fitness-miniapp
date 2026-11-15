// 验证「任何人都能看会员资料」页：从排行榜/友圈进入，看资料与历史身体数据
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const log = m => console.log(m)
const ok = m => log('  ✓ ' + m)
const bad = (m, d) => { log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

const TARGET = process.env.TARGET_OPENID || ''

async function main() {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  log('已连接')

  log('\n[1] 直接打开会员资料页')
  const page = await mp.navigateTo('/pages/member/member?openid=' + TARGET)
  await sleep(3500)
  const d = await page.data()
  log('  member: ' + JSON.stringify(d.member))
  log('  hasBody=' + d.hasBody + ' score=' + d.score + ' metrics=' + (d.metrics || []).length + ' history=' + (d.bodyList || []).length)

  if (d.member && d.member.nickName) ok('资料加载成功：' + d.member.nickName + ' / ' + d.member.roleName)
  else bad('资料没加载')
  if (d.member && d.member.phone) ok('当前账号能看到手机号（管理员/教练视角）')
  else log('  （当前账号看不到手机号，属于普通会员视角）')

  log('\n[2] 身体数据')
  if (d.hasBody) ok('最新身体数据已展示')
  else bad('没有最新身体数据')
  if ((d.metrics || []).length >= 6) ok('身体指标 ' + d.metrics.length + ' 项')
  else bad('指标太少', (d.metrics || []).length)
  log('  指标: ' + (d.metrics || []).map(m => m.name + '=' + m.value).join(' '))
  if (d.score > 0) ok('身体评分 ' + d.score)
  else bad('没有评分')

  log('\n[3] 历史身体资料')
  if ((d.bodyList || []).length >= 2) ok('历史记录 ' + d.bodyList.length + ' 条')
  else bad('历史记录不足', (d.bodyList || []).length)
  ;(d.bodyList || []).slice(0, 3).forEach(b => log('    ' + b.date + ' 体重' + b.weight + ' 体脂' + b.bodyFat + ' 评分' + b.score))
  const rows = await page.$$('.list-item')
  log('  列表项元素数: ' + rows.length)
  if (rows.length > 0) ok('历史列表已渲染')
  else bad('历史列表没渲染')

  log('\n[4] 力量成绩')
  log('  bestList: ' + JSON.stringify((d.bestList || []).map(b => b.name + '=' + (b.has ? b.oneRM : '无'))))

  log('\n[5] 排行榜入口可点击')
  await mp.navigateBack()
  await sleep(600)
  await mp.switchTab('/pages/index/index')
  await sleep(1000)
  const rank = await mp.navigateTo('/pages/rank/rank')
  await sleep(3000)
  const rd = await rank.data()
  const board = (rd.board && rd.board.top) || []
  log('  榜单人数: ' + board.length)
  if (board.length) {
    const row = await rank.$$('.rank-row')
    if (row.length) {
      await row[0].tap()
      await sleep(3000)
      const cur = (await mp.currentPage()).path || ''
      log('  点第一行后: ' + cur)
      if (cur.indexOf('member/member') >= 0) ok('从排行榜进入会员资料页')
      else bad('跳转不对', cur)
      await mp.navigateBack()
      await sleep(600)
    }
  } else {
    log('  榜单为空（还没有力量成绩），跳过点击测试')
    // 直接验证 goMember 方法存在
    const hasFn = await mp.evaluate(() => {
      const stack = getCurrentPages()
      const p = stack[stack.length - 1]
      return typeof p.goMember === 'function'
    })
    if (hasFn) ok('排行榜页已挂 goMember 跳转方法')
    else bad('排行榜页没有 goMember')
  }

  await mp.reLaunch('/pages/index/index')
  await sleep(600)
  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => { console.error('异常:', e.message); process.exit(2) })
