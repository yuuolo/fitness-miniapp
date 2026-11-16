// 探测动画帧率与硬拉循环是否正常（排除窗口节流干扰）
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

const frames = mp => mp.evaluate(() => {
  const p = getCurrentPages()[getCurrentPages().length - 1]
  return { n: p.heroFrames || 0, key: p.data.heroPoseKey, name: p.data.heroPoseName }
})

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const errs = []
  mp.on('console', m => { if (m.type === 'error') errs.push(String(m.args && m.args.join(' ')).slice(0, 120)) })
  mp.on('exception', e => errs.push(String(JSON.stringify(e)).slice(0, 120)))

  await mp.reLaunch('/pages/index/index')
  await sleep(4000)

  const a = await frames(mp)
  await sleep(1000)
  const b = await frames(mp)
  await sleep(1000)
  const c = await frames(mp)
  console.log('动作: ' + a.name + ' (' + a.key + ')')
  console.log('帧数采样: ' + a.n + ' → ' + b.n + ' → ' + c.n)
  console.log('第 1 秒帧率: ' + (b.n - a.n) + ' fps，第 2 秒: ' + (c.n - b.n) + ' fps')

  // 强制切到硬拉，观察它的循环
  await mp.evaluate(() => {
    const p = getCurrentPages()[getCurrentPages().length - 1]
    p.prevFigureKey = ''
    p.setData({ heroPoseKey: 'deadlift', heroPoseName: '硬拉' })
  })
  await sleep(1200)
  const d = await frames(mp)
  await sleep(1000)
  const e = await frames(mp)
  console.log('\n切到硬拉: ' + d.name + '，帧数 ' + d.n + ' → ' + e.n + '（' + (e.n - d.n) + ' fps）')
  console.log('硬拉循环时长: ' + await mp.evaluate(() => {
    const m = require('utils/hero-anim.js')
    return m.cycleOf ? m.cycleOf('deadlift') : 'no cycleOf'
  }).catch(() => '（evaluate 无法 require，跳过）'))

  console.log('报错: ' + (errs.length ? errs.join(' | ') : '无'))
  await mp.reLaunch('/pages/index/index')
  await sleep(500)
  await mp.disconnect()
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
