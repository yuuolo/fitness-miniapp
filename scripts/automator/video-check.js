// 验证竞赛详情里带视频的成绩：视频入口是否出现、点击是否正常
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

const COMP_ID = process.env.COMP_ID || 'd65ead40ac91ace1151d411b99863a4d'

async function main() {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  const page = await mp.reLaunch('/pages/competition-detail/competition-detail?id=' + COMP_ID)
  await sleep(5000)

  const d = await page.data()
  console.log('排名：')
  for (const r of d.ranking || []) {
    console.log('  #' + r.rank, r.memberName, r.valueText, r.hasVideo ? '[有视频]' : '', r.note ? '(' + r.note + ')' : '')
  }
  const withVideo = (d.ranking || []).filter(r => r.hasVideo)
  console.log('带视频条数:', withVideo.length)

  const links = await page.$$('.video-link')
  console.log('视频入口元素数:', links.length)

  if (links.length) {
    await links[0].tap()
    await sleep(1500)
    console.log('✓ 点击视频入口无异常（模拟器会拉起原生播放器）')
  }

  await mp.disconnect()
  console.log(withVideo.length && links.length ? '\n视频功能验证通过' : '\n注意：没有可点的视频入口')
  process.exit(withVideo.length && links.length ? 0 : 1)
}

main().catch(e => { console.error('异常:', e.message); process.exit(2) })
