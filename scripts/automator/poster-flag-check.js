// 验证：友圈详情页「生成海报」是小按钮，且受管理端开关控制
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const log = m => console.log(m)
const ok = m => log('  ✓ ' + m)
const bad = (m, d) => { log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

const MOMENT_ID = process.env.MOMENT_ID || ''

async function openDetail(mp) {
  await mp.reLaunch('/pages/index/index')
  await sleep(3000)
  const page = await mp.navigateTo('/pages/moments/detail/detail?id=' + MOMENT_ID)
  await sleep(3200)
  return page
}

async function main() {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  log('已连接')

  log('\n[1] 开关开启时：应显示小按钮')
  let page = await openDetail(mp)
  let d = await page.data()
  log('  posterOn=' + d.posterOn + '  m=' + (d.m ? d.m.authorName : 'null'))
  if (d.posterOn === true) ok('posterOn = true')
  else bad('posterOn 不是 true', d.posterOn)

  const btns = await page.$$('.mini-btn')
  log('  .mini-btn 数量: ' + btns.length)
  let posterBtn = null
  for (const b of btns) {
    const t = String(await b.text()).trim()
    log('    按钮: "' + t + '"')
    if (t.indexOf('生成海报') >= 0) posterBtn = b
  }
  if (posterBtn) ok('找到「生成海报」小按钮')
  else bad('没有生成海报按钮')

  if (posterBtn) {
    const size = await posterBtn.size()
    log('  按钮尺寸: ' + size.width + ' x ' + size.height)
    // 56rpx ≈ 28px 高，明显小于原来的整行大按钮
    if (size.height <= 40) ok('是小按钮（高度 ' + size.height + 'px，原来的整行按钮会更高）')
    else bad('按钮偏大', size.height)
  }

  // 旧的大按钮不应存在
  const bigBtn = await page.$$('.btn.block')
  const bigTexts = []
  for (const b of bigBtn) bigTexts.push(String(await b.text()).trim())
  log('  .btn.block 里的文本: ' + JSON.stringify(bigTexts))
  if (bigTexts.some(t => t.indexOf('生成分享海报') >= 0)) bad('旧的大按钮还在')
  else ok('旧的大按钮已移除')

  await mp.navigateBack()
  await sleep(600)

  log('\n[2] 关掉开关后：按钮应消失')
  const { execSync } = require('child_process')
  execSync('node toggle-poster.js off', { cwd: __dirname, stdio: 'inherit' })
  await sleep(6500) // 等服务端 5 秒缓存过期

  page = await openDetail(mp)
  d = await page.data()
  log('  posterOn=' + d.posterOn)
  if (d.posterOn === false) ok('开关已生效 posterOn=false')
  else bad('开关没生效', d.posterOn)
  const btns2 = await page.$$('.mini-btn')
  const texts2 = []
  for (const b of btns2) texts2.push(String(await b.text()).trim())
  log('  按钮: ' + JSON.stringify(texts2))
  if (!texts2.some(t => t.indexOf('生成海报') >= 0)) ok('「生成海报」按钮已隐藏')
  else bad('按钮仍在')
  const hints = await page.$$('.muted')
  let hintHit = false
  for (const h of hints) {
    if (String(await h.text()).indexOf('海报带这张动态') >= 0) hintHit = true
  }
  if (!hintHit) ok('海报说明文案也一起隐藏')
  else bad('说明文案还在')

  await mp.navigateBack()
  await sleep(500)

  log('\n[3] 恢复开关')
  execSync('node toggle-poster.js on', { cwd: __dirname, stdio: 'inherit' })
  await sleep(6500)
  page = await openDetail(mp)
  d = await page.data()
  log('  posterOn=' + d.posterOn)
  if (d.posterOn === true) ok('已恢复开启')
  else bad('恢复失败')

  await mp.reLaunch('/pages/index/index')
  await sleep(600)
  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => { console.error('异常:', e.message); process.exit(2) })
