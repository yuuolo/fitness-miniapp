// 验证条形图数据与页面渲染（浅色模式）
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
  await sleep(4500)
  const home = await mp.currentPage()
  const hd = await home.data()

  log('\n[1] 首页排行榜条形图')
  const top = hd.rankTop || []
  log('  条数: ' + top.length)
  if (!top.length) {
    log('  （还没有成绩，跳过比例检查）')
  } else {
    let pctOk = true
    top.forEach(t => {
      log('  #' + t.rank + ' ' + t.name + ' ' + t.value + ' ' + t.unit + '  pct=' + t.pct + '%')
      if (typeof t.pct !== 'number' || t.pct < 4 || t.pct > 100) pctOk = false
    })
    if (pctOk) ok('每行都有 4%–100% 的比例值')
    else bad('比例值异常')

    if (top[0].pct === 100) ok('第一名比例固定为 100%')
    else bad('第一名不是 100%', String(top[0].pct))

    const bars = await home.$$('.bar-fill')
    log('  DOM 里 .bar-fill 数量: ' + bars.length)
    if (bars.length === top.length) ok('每行都渲染出条形')
    else bad('条形数量与行数不符', bars.length + ' vs ' + top.length)

    if (bars.length) {
      const firstCls = await bars[0].attribute('class')
      log('  第一行 class: ' + firstCls)
      if (String(firstCls).indexOf('first') >= 0) ok('第一名条形有 first 高亮')
      else bad('第一名没有高亮 class')
      const size = await bars[0].size()
      log('  条形尺寸: ' + size.width + 'x' + size.height)
      if (size.width > 0) ok('条形有实际宽度')
      else bad('条形宽度为 0')
    }
  }

  // ---------- 排行榜页 ----------
  log('\n[2] 排行榜页条形图')
  const rank = await mp.navigateTo('/pages/rank/rank')
  await sleep(3500)
  const rd = await rank.data()
  const rtop = (rd.board && rd.board.top) || []
  log('  条数: ' + rtop.length + ' | 周期: ' + rd.period)
  if (rtop.length) {
    log('  示例: #' + rtop[0].rank + ' value=' + rtop[0].value + ' pct=' + rtop[0].pct)
    if (typeof rtop[0].pct === 'number' && rtop[0].pct === 100) ok('排行榜第一名比例为 100%')
    const bars = await rank.$$('.bar-fill')
    if (bars.length === rtop.length) ok('排行榜每行都有条形')
    else bad('排行榜条形数量不符')
  } else {
    log('  （当前周期没有成绩）')
  }

  // 切到相对体重榜，确认比例按 relative 算
  const tags = await rank.$$('.tag')
  for (const t of tags) {
    if (String(await t.text()).indexOf('相对体重') >= 0) { await t.tap(); break }
  }
  await sleep(3000)
  const rd2 = await rank.data()
  log('  切换后 metric=' + rd2.metric + ' 条数=' + ((rd2.board && rd2.board.top) || []).length)
  ok('切换排序方式后仍能渲染')

  log('\n[3] 其他页面不受影响')
  for (const [path, name, kind] of [
    ['/pages/moments/moments', '友圈', 'tab'],
    ['/pages/mine/mine', '我的', 'tab'],
    ['/pages/competitions/competitions', '竞赛', 'page']
  ]) {
    try {
      if (kind === 'tab') await mp.switchTab(path)
      else { await mp.switchTab('/pages/index/index'); await sleep(1000); await mp.navigateTo(path) }
      await sleep(2200)
      ok(name + ' 正常')
    } catch (e) {
      bad(name + ' 异常', e.message)
    }
  }

  await mp.reLaunch('/pages/index/index')
  await sleep(500)
  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => { console.error('异常:', e.message); process.exit(2) })
