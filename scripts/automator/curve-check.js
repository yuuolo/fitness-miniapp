// 验证：指标最新值颜色 + 曲线图
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const errs = []
  mp.on('console', m => { if (m.type === 'error') errs.push(String(m.args && m.args.join(' ')).slice(0, 140)) })

  await mp.reLaunch('/pages/index/index')
  await sleep(3500)
  const page = await mp.navigateTo('/pages/fitness/fitness')
  await sleep(3500)
  const d = await page.data()
  console.log('对比指标数: ' + (d.compare || []).length)
  const nowEls = await page.$$('.metric-now')
  console.log('最新值元素: ' + nowEls.length)
  await mp.screenshot({ path: 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview/challenge/16-body-compare-v2.png' })
  console.log('✓ 身体数据页截图')

  const rows = await page.$$('.metric-row')
  if (rows.length) {
    await rows[0].tap()
    await sleep(3000)
    const cur = await mp.currentPage()
    const cd = await cur.data()
    console.log('曲线页: ' + cur.path + '，指标=' + (cd.meta && cd.meta.name) + '，记录=' + cd.count + '，有曲线=' + !!cd.svg)
    // 检查 SVG 里是否用了 path（曲线）而不是 polyline（折线）
    const decoded = cd.svg ? decodeURIComponent(String(cd.svg).replace('data:image/svg+xml;charset=utf-8,', '')) : ''
    console.log('用 curve path: ' + (decoded.indexOf('<path') >= 0) + '，还有 polyline: ' + (decoded.indexOf('polyline') >= 0))
    console.log('路径命令含 C（贝塞尔）: ' + / C[\d.-]/.test(decoded))
    await mp.screenshot({ path: 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview/challenge/17-metric-curve.png' })
    console.log('✓ 指标曲线页截图')
  }

  const real = errs.filter(e => !/code been used|登录失败|subscribe|fail/i.test(e))
  console.log(real.length ? '报错: ' + real.slice(0, 2).join(' | ') : '✓ 无 JS 报错')
  await mp.reLaunch('/pages/index/index')
  await sleep(500)
  await mp.disconnect()
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
