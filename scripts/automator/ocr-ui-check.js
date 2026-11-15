// 验证小程序里的「从体测报告识别」区块（图片识别入口 + 粘贴解析）
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const log = m => console.log(m)
const ok = m => log('  ✓ ' + m)
const bad = (m, d) => { log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

const TEXT = `人体成分分析报告
名称: 小赵 性别: 男 年龄: 31 岁 身高: 175cm 测量时间: 2026/07/19
体重 80.25kg 偏高 BMI 26.2 偏高
体脂率 27.6% 过高 心率 122次/分 偏高
肌肉量 55.0kg 标准 骨骼肌量 31.2kg 标准
内脏脂肪等级 9.0 警戒
身体形态 倒三角型
推测腰臀比 0.9 身体年龄 30 岁
基础代谢率 1625kcal 去脂体重 58.1kg
节段脂肪分析
1.5kg 左上肢  1.5kg 右上肢
11.5kg 躯干
3.3kg 左下肢  3.3kg 右下肢
节段肌肉分析
2.9kg 左上肢  2.9kg 右上肢
25.4kg 躯干
9.1kg 左下肢  9.1kg 右下肢
身体得分
74 分`

async function main() {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  await mp.reLaunch('/pages/index/index')
  await sleep(3500)

  const members = await mp.navigateTo('/pages/staff/members/members?manage=1&admin=1')
  await sleep(3200)
  const list = (await members.data()).list || []
  if (!list.length) { bad('没有会员'); await mp.disconnect(); process.exit(1) }
  await mp.navigateBack()
  await sleep(800)

  const page = await mp.navigateTo('/pages/staff/fitness/fitness?id=' + list[0]._id)
  await sleep(3500)

  log('[1] 展开识别区')
  let d = await page.data()
  if (!d.showRecognize) {
    for (const h of await page.$$('.between')) {
      if (String(await h.text()).indexOf('从体测报告识别') >= 0) { await h.tap(); break }
    }
    await sleep(1500)
    d = await page.data()
  }
  if (d.showRecognize) ok('识别区已展开')
  else bad('识别区没展开')

  log('\n[2] 图片识别按钮存在')
  const btns = await page.$$('button')
  let ocrBtn = null
  let pasteBtn = null
  for (const b of btns) {
    const t = String(await b.text()).trim()
    if (t.indexOf('选择报告图') >= 0) ocrBtn = b
    if (t.indexOf('解析粘贴的文字') >= 0) pasteBtn = b
  }
  if (ocrBtn) ok('有「选择报告图，自动识别」按钮')
  else bad('缺图片识别按钮')
  if (pasteBtn) ok('有「解析粘贴的文字」按钮')
  else bad('缺粘贴解析按钮')

  log('\n[3] 粘贴解析仍然可用')
  const areas = await page.$$('textarea')
  if (!areas.length) { bad('没有粘贴框') }
  else {
    await areas[0].input(TEXT)
    await sleep(900)
    const bs = await page.$$('button')
    for (const b of bs) {
      if (String(await b.text()).trim() === '解析粘贴的文字') { await b.tap(); break }
    }
    await sleep(4500)
    d = await page.data()
    log('  ' + (d.recognizeMsg || '(无提示)'))
    if (String(d.body.weight) === '80.25') ok('体重填入 80.25')
    else bad('体重没填对', d.body.weight)
    if (String(d.body.bodyFat) === '27.6') ok('体脂率填入 27.6')
    else bad('体脂率没填对', d.body.bodyFat)
    if (String(d.body.segmentMuscle.trunk) === '25.4') ok('节段肌肉-躯干填入 25.4')
    else bad('节段肌肉没填对', JSON.stringify(d.body.segmentMuscle))
  }

  await mp.navigateBack()
  await sleep(600)
  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => { console.error('异常:', e.message); process.exit(2) })
