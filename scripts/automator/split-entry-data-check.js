// 用有数据的会员（Yu）确认三个 tab 的历史列表都有内容
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const page = await mp.navigateTo('/pages/staff/fitness/fitness?id=' + process.env.TARGET_OPENID + '&tab=body')
  await sleep(4000)
  let d = await page.data()
  console.log('会员: ' + (d.f && d.f.memberName))
  console.log('身体数据历史: ' + (d.f.bodyHistory || []).length + ' 条')
  console.log('力量成绩历史: ' + (d.strengthList || []).length + ' 条')
  console.log('运动记录: ' + (d.activityList || []).length + ' 条')
  ;(d.strengthList || []).slice(0, 3).forEach(s => {
    console.log('  · ' + s.liftName + ' ' + s.weight + 'kg×' + s.reps + ' → ' + s.oneRM + 'kg' + (s.isBest ? ' [最好]' : ''))
  })
  ;(d.activityList || []).slice(0, 3).forEach(a => {
    console.log('  · ' + a.typeName + ' ' + a.date + ' ' + a.detail)
  })
  await mp.navigateBack()
  await sleep(500)
  await mp.disconnect()
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
