// 验证挑战详情：双方视频分列、每方 9 段、裁判代传按钮
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const errs = []
  mp.on('console', m => { if (m.type === 'error') errs.push(String(m.args && m.args.join(' ')).slice(0, 140)) })

  await mp.reLaunch('/pages/index/index')
  await sleep(3500)
  const list = await mp.navigateTo('/pages/challenges/list/list')
  await sleep(3200)
  const d = await list.data()
  console.log('大厅挑战数: ' + (d.list || []).length)

  const cards = await list.$$('.challenge-card')
  if (!cards.length) {
    console.log('（当前没有挑战，跳过详情检查）')
    await mp.disconnect()
    return
  }
  await cards[0].tap()
  await sleep(3000)
  const cur = await mp.currentPage()
  const cd = await cur.data()
  console.log('页面: ' + cur.path)
  console.log('状态=' + (cd.c && cd.c.status) +
    '，videoLimit=' + (cd.c && cd.c.videoLimit) +
    '，canSubmit=' + (cd.c && cd.c.canSubmitVideo) +
    '，canProxy=' + (cd.c && cd.c.canProxyVideo))
  console.log('双方: ' + JSON.stringify((cd.sides || []).map(s => s.name + ' ' + s.count + '段 可上传=' + s.canUpload + (s.proxy ? ' 代传' : ''))))

  const blocks = await cur.$$('.video-block')
  const adds = await cur.$$('.video-add')
  console.log('视频区块: ' + blocks.length + '，上传按钮: ' + adds.length)

  // 检查 api 模块导出
  const hasUpload = await mp.evaluate(() => {
    const api = require('../../utils/api')
    return typeof api.uploadVideo === 'function'
  }).catch(e => 'evaluate 不可用: ' + e.message)
  console.log('api.uploadVideo 导出: ' + hasUpload)

  await mp.screenshot({ path: 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview/challenge/18-challenge-videos.png' })
  console.log('报错: ' + (errs.length ? errs.slice(0, 2).join(' | ') : '无'))
  await mp.disconnect()
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
