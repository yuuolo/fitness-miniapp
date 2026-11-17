// 验证：力量成绩页的视频上传字段与历史视频标记
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

const OPENID = process.env.TARGET_OPENID

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const errs = []
  mp.on('console', m => { if (m.type === 'error') errs.push(String(m.args && m.args.join(' ')).slice(0, 120)) })

  const page = await mp.navigateTo('/pages/staff/fitness/fitness?id=' + OPENID + '&tab=strength')
  await sleep(4500)
  const d = await page.data()
  console.log('\n[1] 力量成绩 tab')
  console.log('  strengthVideo=' + JSON.stringify(d.strengthVideo) + ' videoUploading=' + d.videoUploading)
  if (d.strengthVideo === '' && d.videoUploading === false) ok('视频状态字段已就位')
  else bad('字段不对')

  const probe = await mp.evaluate(() => {
    const p = getCurrentPages()[getCurrentPages().length - 1]
    return {
      choose: typeof p.chooseStrengthVideo === 'function',
      clear: typeof p.clearStrengthVideo === 'function',
      preview: typeof p.previewStrengthVideo === 'function',
      play: typeof p.playStrengthVideo === 'function'
    }
  })
  console.log('  方法: ' + JSON.stringify(probe))
  if (probe.choose && probe.clear && probe.preview && probe.play) ok('拍/选、预览、移除、历史播放都在')
  else bad('方法缺失')

  console.log('\n[2] 历史列表字段')
  const list = d.strengthList || []
  console.log('  记录 ' + list.length + ' 条')
  const keys = list.length ? Object.keys(list[0]).join(',') : '（无记录）'
  console.log('  字段: ' + keys)
  if (!list.length || list[0].videoUrl !== undefined) ok('历史记录带 videoUrl 字段')
  else bad('缺 videoUrl')

  console.log('\n[3] 报错')
  const real = errs.filter(e => !/code been used|登录失败/i.test(e))
  if (!real.length) ok('无 JS 报错')
  else bad('有报错', real.join(' | '))

  await mp.navigateBack()
  await sleep(500)
  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
