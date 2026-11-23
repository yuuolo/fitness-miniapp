// 验证裁判代传按钮（打开刚造的裁判挑战）
const fs = require('fs')
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

const id = fs.readFileSync('C:/Users/yuuolo/Documents/deepseek/.dsh-tools/refcheck-id.txt', 'utf8').trim()

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const errs = []
  mp.on('console', m => { if (m.type === 'error') errs.push(String(m.args && m.args.join(' ')).slice(0, 140)) })

  await mp.reLaunch('/pages/index/index')
  await sleep(3000)
  const page = await mp.navigateTo('/pages/challenges/detail/detail?id=' + id)
  await sleep(3000)
  const d = await page.data()
  console.log('状态=' + (d.c && d.c.status) +
    '，我是裁判=' + (d.c && d.c.referee.isMe) +
    '，canProxy=' + (d.c && d.c.canProxyVideo) +
    '，videoLimit=' + (d.c && d.c.videoLimit))
  console.log('双方: ' + JSON.stringify((d.sides || []).map(s =>
    s.name + '：可上传=' + s.canUpload + (s.proxy ? '（代传）' : '（本人）'))))

  const adds = await page.$$('.video-add')
  console.log('上传按钮数: ' + adds.length + '（裁判应为 2 个：双方各一个代传）')
  for (const b of adds) {
    console.log('  按钮文案: ' + (await b.text()).trim())
  }
  await mp.screenshot({ path: 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview/challenge/19-referee-proxy.png' })
  console.log('报错: ' + (errs.length ? errs.slice(0, 2).join(' | ') : '无'))
  await mp.disconnect()
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
