// 截挑战榜 + 详情评论效果图
const automator = require('miniprogram-automator')
const fs = require('fs')
const sleep = ms => new Promise(r => setTimeout(r, ms))

const OUT = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview/challenge'
const id = fs.readFileSync('C:/Users/yuuolo/Documents/deepseek/.dsh-tools/challenge-created-ids.txt', 'utf8').trim().split('\n')[0].trim()

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  await mp.reLaunch('/pages/index/index')
  await sleep(2500)

  await mp.navigateTo('/pages/challenges/board/board')
  await sleep(3000)
  await mp.screenshot({ path: OUT + '/06-board.png' })
  console.log('✓ 06 挑战榜')

  const detail = await mp.navigateTo('/pages/challenges/detail/detail?id=' + id)
  await sleep(2500)
  // 发两条评论，截图更好看
  for (const text of ['这场我看好发起方，动作标准', '裁判记得看完整视频']) {
    await mp.evaluate(t => {
      const p = getCurrentPages()[getCurrentPages().length - 1]
      p.setData({ commentText: t })
      p.sendComment()
    }, text)
    await sleep(1600)
  }
  // 点赞第一条
  await mp.evaluate(() => {
    const p = getCurrentPages()[getCurrentPages().length - 1]
    const c = (p.data.c.comments || [])[0]
    if (c) p.toggleLike({ currentTarget: { dataset: { id: c._id } } })
  })
  await sleep(1500)
  await mp.screenshot({ path: OUT + '/07-detail-comments.png' })
  console.log('✓ 07 详情评论')

  await mp.reLaunch('/pages/index/index')
  await sleep(400)
  await mp.disconnect()
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
