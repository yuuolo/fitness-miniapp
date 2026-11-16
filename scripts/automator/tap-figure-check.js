// 验证：点小人 → 1 秒内跑掉 → 换动作出现
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

const state = mp => mp.evaluate(() => {
  const p = getCurrentPages()[getCurrentPages().length - 1]
  return {
    key: p.data.heroPoseKey,
    name: p.data.heroPoseName,
    figureState: p.data.figureState,
    frames: p.heroFrames || 0,
    busy: !!p.figureBusy
  }
})

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  console.log('已连接')

  await mp.reLaunch('/pages/index/index')
  await sleep(5500)
  const page = await mp.currentPage()

  console.log('\n[1] 初始状态')
  const s0 = await state(mp)
  console.log('  ' + JSON.stringify(s0))
  const wrap = await page.$$('.hero-fig-wrap')
  console.log('  可点击容器数: ' + wrap.length)
  if (wrap.length === 1) ok('小人外层容器存在（可点击）')
  else bad('找不到可点击容器', wrap.length)
  if (!wrap.length) { await mp.disconnect(); process.exit(1) }

  const off0 = await wrap[0].offset()
  const size0 = await wrap[0].size()
  console.log('  容器位置: x=' + Math.round(off0.left) + ' 宽=' + Math.round(size0.width))

  console.log('\n[2] 点一下')
  await wrap[0].tap()
  await sleep(150)
  const s1 = await state(mp)
  console.log('  点击 150ms 后: ' + JSON.stringify(s1))
  if (s1.figureState === 'run') ok('进入「跑掉」状态')
  else bad('没有进入跑掉状态', s1.figureState)
  if (s1.key === 'run') ok('动作切成了跑步')
  else bad('动作没切成跑步', s1.key)

  const off1 = await wrap[0].offset()
  console.log('  容器位置: x=' + Math.round(off1.left) + '（初始 ' + Math.round(off0.left) + '）')
  if (off1.left > off0.left + 3) ok('容器正在向右移动')
  else bad('容器没往右移动', Math.round(off1.left) + ' vs ' + Math.round(off0.left))

  console.log('\n[3] 1 秒后换动作出现')
  await sleep(1100)
  const s2 = await state(mp)
  console.log('  ' + JSON.stringify(s2))
  if (s2.key && s2.key !== 'run') ok('换成了另一个动作：' + s2.name)
  else bad('动作没换', s2.key)

  await sleep(900)
  const s3 = await state(mp)
  console.log('  完全恢复后: ' + JSON.stringify(s3))
  if (s3.figureState === '') ok('位置已复位')
  else bad('没有复位', s3.figureState)
  const off2 = await wrap[0].offset()
  console.log('  容器位置: x=' + Math.round(off2.left))
  if (Math.abs(off2.left - off0.left) < 4) ok('回到原来的位置')
  else bad('位置没回到原点', Math.round(off2.left) + ' vs ' + Math.round(off0.left))
  if (!s3.busy) ok('可以再次点击')
  else bad('busy 没有释放')

  console.log('\n[4] 动画没有中断')
  const f1 = (await state(mp)).frames
  await sleep(1200)
  const f2 = (await state(mp)).frames
  console.log('  帧数: ' + f1 + ' → ' + f2)
  if (f2 > f1) ok('换动作后动画继续在跑')
  else bad('动画停了')

  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
