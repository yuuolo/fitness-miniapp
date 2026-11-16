// 验证重做后的举重/跑步动画在真机渲染里正常
const automator = require('miniprogram-automator')
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
  mp.on('console', m => { if (m.type === 'error') errs.push(String(m.args && m.args.join(' ')).slice(0, 120)) })
  mp.on('exception', e => errs.push(String(JSON.stringify(e)).slice(0, 120)))
  console.log('已连接')

  await mp.reLaunch('/pages/index/index')
  await sleep(5500)
  const page = await mp.currentPage()
  const d = await page.data()
  console.log('\n[1] 今日动作: ' + d.heroPoseName + ' (' + d.heroPoseKey + ')')

  const f1 = await frames(mp)
  await sleep(1400)
  const f2 = await frames(mp)
  console.log('  帧数: ' + f1.n + ' → ' + f2.n)
  if (f2.n > f1.n) ok('动画在跑')
  else bad('动画停了')

  console.log('\n[2] 点一下换动作（含新绘制的跑步）')
  const wrap = await page.$$('.hero-fig-wrap')
  if (wrap.length) {
    await wrap[0].tap()
    await sleep(300)
    const mid = await frames(mp)
    console.log('  点击后: ' + mid.key + ' / ' + mid.state)
    if (mid.key === 'run') ok('切成跑步姿势（新的程序化绘制）')
    else bad('没有切成跑步', mid.key)
    await sleep(1200)
    const after = await frames(mp)
    console.log('  换完: ' + after.name + ' (' + after.key + ')')
    if (after.key && after.key !== 'run') ok('换成了另一个动作')
    else bad('没有换动作')
    await sleep(1200)
    const f3 = await frames(mp)
    console.log('  帧数: ' + f3.n)
    if (f3.n > after.n) ok('换动作后动画继续')
    else bad('动画中断')
  } else bad('找不到小人')

  console.log('\n[3] 六个动作的绘制方式')
  const mod = require('C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/utils/hero-anim.js')
  console.log('  ' + mod.POSES.map(p => p.name + (typeof p.custom === 'function' ? '(程序化)' : '(关键帧)')).join(' / '))

  console.log('\n[4] 运行时报错')
  const real = errs.filter(e => !/code been used|登录失败/i.test(e))
  real.forEach(e => console.log('    ' + e))
  if (!real.length) ok('没有 JS 报错')
  else bad('有报错', real.length)

  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
