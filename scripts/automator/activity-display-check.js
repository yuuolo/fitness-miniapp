// 验证会员侧「最近运动」展示
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  console.log('已连接')

  await mp.reLaunch('/pages/fitness/fitness')
  await sleep(4500)
  const page = await mp.currentPage()
  const d = await page.data()

  console.log('\n[1] 我的身体数据页')
  console.log('  actList: ' + JSON.stringify(d.actList))
  if ((d.actList || []).length >= 2) ok('最近运动 ' + d.actList.length + ' 条')
  else bad('没有最近运动数据', (d.actList || []).length)

  ;(d.actList || []).forEach(a => console.log('    ' + a.typeName + ' ' + a.date + ' —— ' + a.detail))

  const texts = []
  for (const el of await page.$$('view')) {
    try { const t = String(await el.text()).trim(); if (t && t.length < 40) texts.push(t) } catch (e) {}
  }
  const uniq = [...new Set(texts)]
  console.log('  页面含「最近运动」: ' + uniq.some(t => t.indexOf('最近运动') >= 0))
  if (uniq.some(t => t.indexOf('最近运动') >= 0)) ok('页面上有「最近运动」区块')
  else bad('页面上没有最近运动区块')
  console.log('  含骑行: ' + uniq.some(t => t.indexOf('骑行') >= 0) + '，含公里: ' + uniq.some(t => t.indexOf('公里') >= 0))
  if (uniq.some(t => t.indexOf('骑行') >= 0)) ok('骑行记录显示出来了')
  else bad('骑行记录没显示')
  if (uniq.some(t => t.indexOf('公里') >= 0)) ok('距离带单位显示')
  else bad('没有距离显示')

  console.log('\n[2] 会员资料页也有最近运动')
  const ADM = 'o5bjc4qI1ME8eNUtWE09sLqOE4aE'
  const mpage = await mp.navigateTo('/pages/member/member?openid=' + ADM)
  await sleep(3500)
  const md = await mpage.data()
  console.log('  actList: ' + JSON.stringify((md.actList || []).map(a => a.typeName + ' ' + a.detail)))
  if ((md.actList || []).length >= 2) ok('会员资料页也有最近运动')
  else bad('会员资料页没有最近运动')

  await mp.navigateBack()
  await sleep(600)
  await mp.reLaunch('/pages/index/index')
  await sleep(600)
  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
