// 验证欢迎栏 Canvas 动画（用帧计数器确认真的在动）
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

const frames = mp => mp.evaluate(() => {
  const p = getCurrentPages()[getCurrentPages().length - 1]
  return { on: !!p.heroAnimOn, frames: p.heroFrames || 0, pose: p.data.heroPoseName, key: p.data.heroPoseKey }
})

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  console.log('已连接')

  await mp.reLaunch('/pages/index/index')
  await sleep(6000)
  const page = await mp.currentPage()
  const d = await page.data()

  console.log('\n[1] 今天的小人')
  console.log('  性别: ' + (d.me && d.me.gender ? d.me.gender : '(未填，按男性)'))
  console.log('  动作: ' + d.heroPoseName + ' (' + d.heroPoseKey + ')')
  if (d.heroPoseKey) ok('动作已确定')
  else bad('没有确定动作')

  const canvas = await page.$$('#heroFig')
  if (canvas.length === 1) {
    const s = await canvas[0].size()
    console.log('  canvas: ' + s.width + ' x ' + s.height)
    if (s.width > 40) ok('Canvas 尺寸正常')
    else bad('Canvas 尺寸异常')
  } else bad('没有 canvas')

  console.log('\n[2] 动画在跑（帧计数）')
  const f1 = await frames(mp)
  await sleep(1200)
  const f2 = await frames(mp)
  await sleep(1200)
  const f3 = await frames(mp)
  console.log('  帧数: ' + f1.frames + ' → ' + f2.frames + ' → ' + f3.frames)
  if (f2.frames > f1.frames && f3.frames > f2.frames) ok('持续在渲染新帧（动画在动）')
  else bad('帧数没有增长', JSON.stringify([f1, f2, f3]))

  console.log('\n[3] 动作一天固定，不会自己跳')
  const poses = new Set([f1.pose])
  for (let i = 0; i < 2; i++) {
    await sleep(5000)
    const f = await frames(mp)
    poses.add(f.pose)
  }
  console.log('  10 秒内出现过的动作: ' + [...poses].join(' / '))
  if (poses.size === 1) ok('动作保持不变（每天一个）')
  else bad('动作自己变了')

  console.log('\n[4] 按日期选题确定且每天换')
  const seeds = await mp.evaluate(() => {
    const mod = require('./utils/hero-anim.js')
    const days = ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']
    return {
      seq: days.map(d => d.slice(5) + '=' + mod.poseOfDay('', d).name),
      same: mod.poseOfDay('', '2026-11-16').key === mod.poseOfDay('', '2026-11-16').key
    }
  })
  console.log('  ' + seeds.seq.join(' | '))
  if (seeds.same) ok('同一天结果固定')
  else bad('同一天结果不一致')
  const names = new Set(seeds.seq.map(s => s.split('=')[1]))
  if (names.size >= 2) ok('不同日期会换动作（采样到 ' + names.size + ' 种）')
  else bad('每天都是同一个动作')

  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
