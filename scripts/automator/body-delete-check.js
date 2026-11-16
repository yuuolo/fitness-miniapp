// 验证：教练端删除历史体测 + OCR 自动保存报告图
const fs = require('fs')
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const ok = m => console.log('  ✓ ' + m)
const bad = (m, d) => { console.log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

const TARGET = 'uitest-bodydel'

;(async () => {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  console.log('已连接')

  console.log('\n[1] 打开这个会员的体测页')
  const page = await mp.navigateTo('/pages/staff/fitness/fitness?id=' + TARGET + '&name=test')
  await sleep(4500)
  const d = await page.data()
  const hist = (d.f && d.f.bodyHistory) || []
  console.log('  历史记录: ' + hist.length + ' 条 -> ' + hist.map(h => h.date + '(' + h.weight + 'kg)').join(', '))
  if (hist.length === 2) ok('读到 2 条历史记录')
  else bad('历史记录数不对', hist.length)

  console.log('\n[2] 每条记录都有删除按钮')
  const delBtns = await page.$$('button')
  let deleteCount = 0
  for (const b of delBtns) {
    const t = String(await b.text()).trim()
    if (t === '删除') deleteCount++
  }
  console.log('  删除按钮数: ' + deleteCount)
  if (deleteCount === 2) ok('每条历史记录都有「删除」按钮')
  else bad('删除按钮数量不对', deleteCount)

  console.log('\n[3] 删除最新那条（2026-04-01）')
  // 自动确认弹窗
  await mp.evaluate(() => {
    wx.showModal = opts => { if (opts && opts.success) opts.success({ confirm: true, cancel: false }) }
  })
  let target = null
  for (const b of delBtns) {
    if (String(await b.text()).trim() === '删除') { target = b; break }
  }
  if (!target) { bad('没有可点的删除按钮'); await mp.disconnect(); process.exit(1) }
  await target.tap()
  await sleep(4000)

  const d2 = await page.data()
  const hist2 = (d2.f && d2.f.bodyHistory) || []
  console.log('  删除后历史: ' + hist2.length + ' 条 -> ' + hist2.map(h => h.date).join(', '))
  if (hist2.length === 1) ok('记录已删除（剩 1 条）')
  else bad('删除没有生效', hist2.length)

  const latestDate = d2.f && d2.f.latestBody && d2.f.latestBody.date
  console.log('  最新身体数据日期: ' + latestDate)
  if (latestDate === '2026-03-01') ok('最新档案自动换成了剩下那条')
  else bad('最新档案没更新', latestDate)

  console.log('\n[4] OCR 后自动保存报告图（源码断言）')
  const srcFile = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/staff/fitness/fitness.js'
  const src = fs.readFileSync(srcFile, 'utf8')
  const setsReportImage = src.indexOf("'body.reportImage': fileID") >= 0
  const callsOcr = src.indexOf('ocrBodyReport') >= 0
  const tip = src.indexOf('报告照片已保存') >= 0
  console.log('  识别前写入 reportImage: ' + setsReportImage + '，调用 OCR: ' + callsOcr + '，提示: ' + tip)
  if (setsReportImage && callsOcr && tip) ok('识别用的图片会自动存成「体测报告照片」')
  else bad('识别后没有保存报告图')

  await mp.navigateBack()
  await sleep(800)
  await mp.reLaunch('/pages/index/index')
  await sleep(600)
  await mp.disconnect()
  console.log('')
  console.log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
