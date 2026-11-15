// 验证首页快捷入口：六边形能力图 + 友圈缩略图
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const log = m => console.log(m)
const ok = m => log('  ✓ ' + m)
const bad = (m, d) => { log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

async function main() {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  log('已连接')

  await mp.reLaunch('/pages/index/index')
  await sleep(5000)
  const page = await mp.currentPage()
  const d = await page.data()

  log('\n[1] 快捷入口数据')
  log('  radarSvg 长度: ' + String(d.radarSvg || '').length)
  log('  radarScore: ' + d.radarScore + '  radarEmpty: ' + d.radarEmpty)
  log('  缩略图数量: ' + (d.momentThumbs || []).length)
  ;(d.momentThumbs || []).forEach((t, i) => log('    #' + (i + 1) + ' video=' + t.video + ' src=' + String(t.src).slice(0, 60)))

  if (d.radarSvg && d.radarSvg.indexOf('data:image/svg+xml;base64,') === 0) ok('雷达图 SVG 已生成')
  else bad('雷达图没生成', String(d.radarSvg).slice(0, 40))
  if (typeof d.radarScore === 'number') ok('综合能力分: ' + d.radarScore)
  else bad('没有综合分')
  if ((d.momentThumbs || []).length === 2) ok('友圈缩略图 2 张')
  else bad('缩略图数量不对', (d.momentThumbs || []).length)
  if ((d.momentThumbs || []).every(t => t.video === true)) ok('两张都是视频缩略图')

  log('\n[2] 雷达图元素')
  const radar = await page.$$('.radar')
  log('  .radar 数量: ' + radar.length)
  if (radar.length === 1) {
    const size = await radar[0].size()
    log('  尺寸: ' + size.width + 'x' + size.height)
    if (size.width > 40 && size.height > 40) ok('雷达图有实际尺寸')
    else bad('雷达图尺寸为 0')
  } else bad('雷达图元素数量不对')

  const empty = await page.$$('.radar-empty')
  if (!empty.length) ok('已显示真实图形（不是占位）')
  else bad('还在显示「还没有数据」占位')

  log('\n[3] 友圈缩略图元素')
  const thumbs = await page.$$('.thumb')
  log('  .thumb 数量: ' + thumbs.length)
  if (thumbs.length === 2) {
    const s1 = await thumbs[0].size()
    log('  第一张尺寸: ' + s1.width + 'x' + s1.height)
    if (s1.width > 20 && s1.height > 20) ok('缩略图有实际尺寸')
    else bad('缩略图尺寸为 0')
  } else bad('缩略图元素数量不对')
  const plays = await page.$$('.thumb-play')
  log('  播放角标数量: ' + plays.length)
  if (plays.length === 2) ok('两张都有视频播放角标')
  else bad('播放角标数量不对')

  log('\n[4] 标题与文案')
  const texts = []
  for (const el of await page.$$('view')) {
    try { const t = String(await el.text()).trim(); if (t && t.length < 30) texts.push(t) } catch (e) {}
  }
  const joined = texts.join(' | ')
  if (joined.indexOf('排行榜') >= 0 && joined.indexOf('健身友圈') >= 0) ok('两个入口标题都在')
  else bad('标题缺失')
  if (/综合能力\s*\d+/.test(joined)) ok('显示「综合能力 N」')
  else log('  文案里没有「综合能力 N」，实际片段: ' + joined.slice(0, 120))

  log('\n[5] 点击仍可跳转')
  const qs = await page.$$('.q')
  log('  快捷入口格子数: ' + qs.length)
  if (qs.length === 2) {
    await qs[0].tap()
    await sleep(2200)
    const cur = (await mp.currentPage()).path || ''
    log('  点第一个后: ' + cur)
    if (cur.indexOf('rank') >= 0) ok('排行榜格子跳到排行榜页')
    else bad('跳转不对', cur)
  } else bad('格子数量不对')

  await mp.reLaunch('/pages/index/index')
  await sleep(800)
  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => { console.error('异常:', e.message); process.exit(2) })
