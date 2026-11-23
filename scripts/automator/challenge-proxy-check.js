// 逐个打开挑战，检查裁判代传场景（canProxyVideo / video-add 按钮）
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  await mp.reLaunch('/pages/index/index')
  await sleep(3000)

  for (let i = 0; i < 3; i++) {
    const list = await mp.navigateTo('/pages/challenges/list/list')
    await sleep(2500)
    const cards = await list.$$('.challenge-card')
    if (i >= cards.length) break
    await cards[i].tap()
    await sleep(2600)
    const cur = await mp.currentPage()
    const cd = await cur.data()
    const adds = await cur.$$('.video-add')
    console.log('#' + (i + 1) + ' ' + (cd.c && cd.c.status) +
      ' 我是:' + [cd.c && cd.c.challenger.isMe ? '发起方' : '', cd.c && cd.c.opponent.isMe ? '应战方' : '', cd.c && cd.c.referee.isMe ? '裁判' : ''].filter(Boolean).join('/') +
      ' canProxy=' + (cd.c && cd.c.canProxyVideo) +
      ' 上传按钮=' + adds.length +
      ' 双方=' + JSON.stringify((cd.sides || []).map(s => s.name + (s.proxy ? '(代传)' : '') + (s.canUpload ? '✓' : ''))))
    await mp.navigateBack()
    await sleep(800)
  }
  await mp.disconnect()
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
