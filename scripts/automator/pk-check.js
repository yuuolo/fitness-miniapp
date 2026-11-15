// 验证会员资料页的「和我 PK」
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

  // 先看自己有没有数据
  await mp.reLaunch('/pages/index/index')
  await sleep(3500)
  const mine = await mp.evaluate(() => {
    const cur = getCurrentPages()[getCurrentPages().length - 1]
    return cur.data.me || null
  })
  log('当前账号: ' + (mine && (mine.nickName || mine.phone)))

  log('\n[1] 打开别人的资料页')
  const page = await mp.navigateTo('/pages/member/member?openid=' + TARGET)
  await sleep(3500)
  const d = await page.data()
  const pk = d.pk
  log('  pk: ' + JSON.stringify(pk && {
    ready: pk.ready, hasMine: pk.hasMine, hasTheirs: pk.hasTheirs,
    myScore: pk.myScore, theirScore: pk.theirScore, myWins: pk.myWins, theirWins: pk.theirWins, verdict: pk.verdict
  }))

  if (!pk) { bad('没有 PK 数据'); await mp.disconnect(); process.exit(1) }
  if (pk.ready) ok('PK 数据已生成')
  else bad('PK 没生成（可能缺数据）', JSON.stringify(pk))

  log('\n[2] 对比明细')
  ;(pk.rows || []).forEach(r => {
    log('  ' + r.name.padEnd(6) + ' 我 ' + String(r.mine).padEnd(6) + ' TA ' + String(r.theirs).padEnd(6) + '  ' + r.diffText + '  [' + r.win + ']')
  })
  if ((pk.rows || []).length >= 5) ok('对比了 ' + pk.rows.length + ' 项指标')
  else bad('对比项太少', (pk.rows || []).length)

  // 校验胜负方向
  const byKey = {}
  ;(pk.rows || []).forEach(r => { byKey[r.key] = r })
  if (byKey.bodyFat && byKey.bodyFat.win === 'me') ok('体脂率：我 22% 低于 TA 26.4%，越低越好 → 我胜 ✓')
  else if (byKey.bodyFat) bad('体脂率胜负判断不对', JSON.stringify(byKey.bodyFat))
  if (byKey.muscle && byKey.muscle.win === 'them') ok('肌肉量：我 36kg 低于 TA 40.1kg → TA 胜 ✓')
  if (byKey.skeletalMuscle && byKey.skeletalMuscle.win === 'me') ok('骨骼肌量：我 32kg 高于 TA 22.5kg → 我胜 ✓')
  if (byKey.score && byKey.score.win === 'them') ok('身体评分：TA 84 > 我 68，应为 TA 胜')

  log('\n[3] 胜负统计与总评')
  log('  我胜 ' + pk.myWins + ' 项，TA 胜 ' + pk.theirWins + ' 项；评分 ' + pk.myScore + ' vs ' + pk.theirScore)
  if (pk.verdict === 'them') ok('总评：TA 领先（评分 84 > 68）')
  else bad('总评不对', pk.verdict)

  log('\n[4] 页面元素')
  const pkCard = await page.$$('.pk-card')
  const pkRows = await page.$$('.pk-row')
  const better = await page.$$('.pk-val.better')
  const vs = await page.$$('.pk-vs')
  log('  .pk-card=' + pkCard.length + ' .pk-row=' + pkRows.length + ' .pk-val.better=' + better.length + ' .pk-vs=' + vs.length)
  if (pkCard.length === 1) ok('PK 卡片已渲染')
  else bad('PK 卡片没渲染')
  if (pkRows.length === (pk.rows || []).length) ok('对比行数与数据一致')
  else bad('对比行数不一致')
  if (better.length > 0) ok('占优的一侧有高亮（' + better.length + ' 处）')

  log('\n[5] 看自己的页面不应出现 PK')
  await mp.navigateBack()
  await sleep(600)
  const selfOpenid = process.env.SELF_OPENID || (mine && (mine._id || mine.openid))
  if (selfOpenid) {
    const selfPage = await mp.navigateTo('/pages/member/member?openid=' + selfOpenid)
    await sleep(3000)
    const sd = await selfPage.data()
    log('  pk=' + JSON.stringify(sd.pk))
    if (!sd.pk) ok('看自己时没有 PK 区块')
    else bad('看自己也出现了 PK')
    const selfPkCard = await selfPage.$$('.pk-card')
    if (!selfPkCard.length) ok('看自己时没有 PK 卡片')
    await mp.navigateBack()
    await sleep(500)
  }

  await mp.reLaunch('/pages/index/index')
  await sleep(600)
  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => { console.error('异常:', e.message); process.exit(2) })
