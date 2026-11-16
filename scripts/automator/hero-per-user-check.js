// 验证：每个会员的动作各自不同（按 openid + 日期）
const automator = require('miniprogram-automator')
const heroAnim = require('C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/utils/hero-anim.js')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

const IDS = [
  'o5bjc4qI1ME8eNUtWE09sLqOE4aE',
  'o5bjc4jdaajzZZs582B7ao6qUagM',
  'o5bjc4pvbv2MQ_v6Vim7d-Melt8Y',
  'o5bjc4oPISG_OF_uYwAtHx4n9JJ0',
  'o5bjc4s7RIV9jq9lErxwTy5gdQao',
  'o5bjc4vcZFTAjOIoEUnfMT43rAKo',
  'o5bjc4pPJztbTnM4yPQYhxfJnN6Q',
  'o5bjc4kPyR8JOQjiqHohU2aPVgZc'
]

function todayStr() {
  const d = new Date(Date.now() + 8 * 3600e3)
  const p = n => (n < 10 ? '0' + n : '' + n)
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate())
}

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  console.log('已连接')

  await mp.reLaunch('/pages/index/index')
  await sleep(6500)
  const d = await mp.currentPage().then(p => p.data())

  console.log('\n[1] 当前账号')
  console.log('  me._id: ' + (d.me && d.me._id))
  console.log('  性别: ' + (d.me && d.me.gender ? d.me.gender : '(未填，按男性)'))
  console.log('  今日动作: ' + d.heroPoseName + ' (' + d.heroPoseKey + ')')
  if (d.me && d.me._id) ok('home 返回会员自己的 openid')
  else bad('me._id 缺失')

  console.log('\n[2] 页面动作 = 自己 openid + 日期的散列结果')
  const day = todayStr()
  const expect = heroAnim.poseOfDay((d.me && d.me._id) || '', day)
  console.log('  日期: ' + day + ' → 期望: ' + expect.name)
  if (expect.name === d.heroPoseName) ok('一致')
  else bad('不一致', d.heroPoseName + ' vs ' + expect.name)

  console.log('\n[3] 不同会员的动作各不相同')
  const names = IDS.map(id => heroAnim.poseOfDay(id, day).name)
  const uniq = [...new Set(names)]
  console.log('  8 个真实会员: ' + names.join(' / '))
  console.log('  不重复动作数: ' + uniq.length)
  if (uniq.length >= 3) ok('不同会员确实不一样（' + uniq.length + ' 种）')
  else bad('动作重复太多')

  console.log('\n[4] 1000 人分布')
  const count = {}
  for (let i = 0; i < 1000; i++) {
    const n = heroAnim.poseOfDay('o5bjc4' + i.toString(36) + 'xyz', day).name
    count[n] = (count[n] || 0) + 1
  }
  const vals = Object.values(count)
  console.log('  覆盖 ' + Object.keys(count).length + ' 种，最少 ' + Math.min(...vals) + ' / 最多 ' + Math.max(...vals))
  if (Object.keys(count).length === 6 && Math.max(...vals) - Math.min(...vals) < 80) ok('分布均匀')
  else bad('分布不均')

  console.log('\n[5] 动画仍在跑')
  const f1 = await mp.evaluate(() => {
    const p = getCurrentPages()[getCurrentPages().length - 1]
    return p.heroFrames || 0
  })
  await sleep(1200)
  const f2 = await mp.evaluate(() => {
    const p = getCurrentPages()[getCurrentPages().length - 1]
    return p.heroFrames || 0
  })
  console.log('  帧数: ' + f1 + ' → ' + f2)
  if (f2 > f1) ok('动画持续渲染')
  else bad('动画没在跑')

  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
