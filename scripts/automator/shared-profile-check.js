// 分享出去的资料页是否显示报告图（并确认看不到手机号以外的隐私）
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const p = await mp.navigateTo('/pages/member/member?openid=o5bjc4qI1ME8eNUtWE09sLqOE4aE')
  await sleep(4500)

  const imgs = await p.$$('.report')
  console.log('资料页报告图数量: ' + imgs.length)
  if (imgs.length) {
    const s = await imgs[0].size()
    console.log('尺寸: ' + Math.round(s.width) + ' x ' + Math.round(s.height))
  }

  const d = await p.data()
  console.log('会员: ' + (d.member && d.member.nickName))
  console.log('手机号: ' + JSON.stringify(d.member && d.member.phone))
  console.log('有 body 数据: ' + d.hasBody + '，历史 ' + (d.bodyList || []).length + ' 条')

  await mp.navigateBack()
  await sleep(600)
  await mp.disconnect()
  process.exit(imgs.length ? 0 : 1)
})().catch(e => { console.error('ERR ' + e.message); process.exit(2) })
