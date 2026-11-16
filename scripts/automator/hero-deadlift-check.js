// 验证硬拉加入后的动画（7 个动作）
const automator = require('miniprogram-automator')
const mod = require('C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/utils/hero-anim.js')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

const frames = mp => mp.evaluate(() => {
  const p = getCurrentPages()[getCurrentPages().length - 1]
  return { n: p.heroFrames || 0, key: p.data.heroPoseKey, name: p.data.heroPoseName, state: p.data.figureState }
})

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const errs = []
  mp.on('console', m => { if (m.type === 'error') errs.push(String(m.args && m.args.join(' ')).slice(0, 100)) })
  mp.on('exception', e => errs.push(String(JSON.stringify(e)).slice(0, 100)))
  console.log('已连接')

  console.log('\n[1] 动作清单')
  console.log('  共 ' + mod.POSES.length + ' 个: ' + mod.POSES.map(p => p.name).join(' / '))
  if (mod.BY_KEY.deadlift) ok('硬拉已加入')
  else bad('没有硬拉')

  console.log('\n[2] 首页动画')
  await mp.reLaunch('/pages/index/index')
  await sleep(5500)
  const page = await mp.currentPage()
  const d = await page.data()
  console.log('  今日动作: ' + d.heroPoseName + ' (' + d.heroPoseKey + ')')
  const f1 = await frames(mp)
  await sleep(1500)
  const f2 = await frames(mp)
  console.log('  帧数: ' + f1.n + ' → ' + f2.n)
  if (f2.n > f1.n) ok('动画在跑')
  else bad('动画停了')

  console.log('\n[3] 连点换动作（多次）')
  const wrap = await page.$$('.hero-fig-wrap')
  const seen = new Set([d.heroPoseKey])
  for (let i = 0; i < 5; i++) {
    await wrap[0].tap()
    await sleep(1700)
    const s = await frames(mp)
    seen.add(s.key)
    console.log('  第 ' + (i + 1) + ' 次后: ' + s.name)
  }
  console.log('  出现过: ' + [...seen].join(' / '))
  const f3 = await frames(mp)
  console.log('  帧数: ' + f3.n)
  if (f3.n > f2.n) ok('连续换动作后动画仍在跑')
  else bad('动画中断')

  console.log('\n[4] 报错检查')
  const real = errs.filter(e => !/code been used|登录失败/i.test(e))
  real.forEach(e => console.log('    ' + e))
  if (!real.length) ok('无 JS 报错')
  else bad('有报错', real.length)

  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
