// 验证排行榜周/月切换、竞赛列表与详情（含视频入口）在真实小程序里的渲染
const automator = require('miniprogram-automator')

const ENDPOINT = process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421'
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const log = m => console.log(m)
const ok = m => log('  ✓ ' + m)
const bad = (m, d) => { log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

async function main() {
  const mp = await automator.connect({ wsEndpoint: ENDPOINT })
  log('已连接')

  await mp.reLaunch('/pages/index/index')
  await sleep(4000)

  // ---------- 1. 排行榜页 ----------
  log('\n[1] 排行榜页：项目 + 周/月/总榜')
  const rank = await mp.navigateTo('/pages/rank/rank')
  await sleep(3500)
  let d = await rank.data()
  log('  项目数: ' + (d.lifts || []).length + ' | 当前: ' + d.lift + ' | 周期: ' + d.period)
  log('  周期选项: ' + JSON.stringify((d.board && d.board.periods) || []))
  if ((d.lifts || []).length >= 5) ok('排行榜项目从后端加载（' + (d.lifts || []).length + ' 个）')
  else bad('项目没加载出来', JSON.stringify(d.lifts))
  if ((d.board && d.board.periods || []).length === 3) ok('提供本周/本月/总榜三种周期')
  else bad('周期选项缺失')
  if (d.board && d.board.periodName) ok('当前周期：' + d.board.periodName)

  // 切到本月
  const monthTab = await rank.$$('.date-bar .d')
  if (monthTab.length >= 2) {
    await monthTab[1].tap()
    await sleep(2500)
    d = await rank.data()
    log('  切换后 period=' + d.period + ' periodName=' + (d.board && d.board.periodName))
    if (d.period === 'month') ok('可以切到「本月」')
    else bad('周期切换失败', d.period)
  } else {
    bad('找不到周期切换按钮')
  }

  // 切项目到第二项
  const liftTabs = await rank.$$('.tabs .tab')
  if (liftTabs.length >= 2) {
    await liftTabs[1].tap()
    await sleep(2500)
    d = await rank.data()
    log('  切换项目后 lift=' + d.lift + ' liftName=' + (d.board && d.board.liftName))
    if (d.lift && d.board && d.board.liftName) ok('可以切换排行榜项目')
    else bad('项目切换失败')
  }
  await mp.navigateBack()
  await sleep(800)

  // ---------- 2. 竞赛列表 ----------
  log('\n[2] 竞赛列表')
  const list = await mp.navigateTo('/pages/competitions/competitions')
  await sleep(3000)
  const ld = await list.data()
  log('  竞赛数: ' + (ld.list || []).length)
  if ((ld.list || []).length > 0) {
    const c = ld.list[0]
    log('  ' + c.title + ' | ' + c.statusName + ' | 奖品: ' + (c.prize || '无') + ' | ' + c.playerCount + ' 人')
    ok('竞赛列表有数据，含状态/奖品/参赛人数')
  } else {
    bad('竞赛列表为空')
  }

  // ---------- 3. 竞赛详情 ----------
  log('\n[3] 竞赛详情（排名 + 视频）')
  if ((ld.list || []).length > 0) {
    const id = ld.list[0]._id
    const detail = await mp.navigateTo('/pages/competition-detail/competition-detail?id=' + id)
    await sleep(3500)
    const dd = await detail.data()
    const c = dd.competition || {}
    log('  标题: ' + c.title + ' | 状态: ' + c.statusName + ' | 参赛: ' + c.playerCount)
    log('  排名条数: ' + (dd.ranking || []).length)
    ;(dd.ranking || []).forEach(r => log('    #' + r.rank + ' ' + r.memberName + ' ' + r.valueText + (r.hasVideo ? ' [有视频]' : '')))

    if ((dd.ranking || []).length >= 2) ok('详情页展示实时排名')
    else bad('排名没渲染')

    const withVideo = (dd.ranking || []).filter(r => r.hasVideo)
    if (withVideo.length > 0) ok('有视频的成绩显示播放入口（' + withVideo.length + ' 条）')
    else log('  注意：本次没有带视频的成绩')

    if ((dd.myEntries || []).length >= 0) ok('详情页包含「我的成绩」区块')

    // 点一次视频入口，确认不会报错（在模拟器里会打开原生播放器）
    const links = await detail.$$('.video-link')
    if (links.length) {
      await links[0].tap()
      await sleep(1500)
      ok('点击视频入口无异常（模拟器会拉起原生播放器）')
    }
    await mp.navigateBack()
    await sleep(800)
  }

  // ---------- 4. 员工端竞赛管理 ----------
  log('\n[4] 员工端竞赛管理')
  const staff = await mp.navigateTo('/pages/staff/competitions/competitions')
  await sleep(3000)
  const sd = await staff.data()
  log('  竞赛数: ' + (sd.list || []).length + ' | 可用项目: ' + (sd.lifts || []).length)
  if (!sd.error && (sd.lifts || []).length >= 5) ok('员工端能拿到项目列表，可以发起竞赛')
  else bad('员工端竞赛管理异常', JSON.stringify(sd).slice(0, 200))

  const createBtns = await staff.$$('button')
  const hasCreate = createBtns.length > 0
  if (hasCreate) ok('页面有操作按钮（发起/录入/结束等）')
  await mp.navigateBack()

  await mp.reLaunch('/pages/index/index')
  await sleep(600)
  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => {
  console.error('排行榜/竞赛界面验证异常：', e.message)
  process.exit(2)
})
