// 验证体测录入页的「从报告识别」：粘贴文字 → 解析 → 自动填表
const automator = require('miniprogram-automator')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const log = m => console.log(m)
const ok = m => log('  ✓ ' + m)
const bad = (m, d) => { log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

const TEXT = `人体成分分析报告
名称: 小赵  性别: 男  年龄: 31 岁  身高: 175cm  测量时间: 2026/07/19
体重 80.25kg 偏高
BMI 26.2 偏高
体脂率 27.6% 过高
心率 122次/分 偏高
肌肉量 55.0kg 标准
骨骼肌量 31.2kg 标准
内脏脂肪等级 9.0 警戒
身体形态 倒三角型
身体类型 肥胖
推测腰臀比 0.9
身体年龄 30 岁
基础代谢率 1625kcal
去脂体重 58.1kg
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
  log('已连接')

  // 先拿到一个会员的 openid（员工工作台 → 会员列表）
  await mp.reLaunch('/pages/index/index')
  await sleep(3500)
  const members = await mp.navigateTo('/pages/staff/members/members?manage=1&admin=1')
  await sleep(3000)
  const md = await members.data()
  const list = md.list || []
  log('会员数: ' + list.length)
  if (!list.length) { bad('没有会员可用于测试'); await mp.disconnect(); process.exit(1) }
  const target = list[0]
  log('测试对象: ' + (target.nickName || target.phone))
  await mp.navigateBack()
  await sleep(800)

  // 打开体测录入页
  const page = await mp.navigateTo('/pages/staff/fitness/fitness?id=' + target._id)
  await sleep(3500)

  log('\n[1] 识别卡片')
  let found = false
  for (const el of await page.$$('view')) {
    try {
      const t = String(await el.text()).trim()
      if (t.indexOf('从体测报告识别') === 0) { found = true; break }
    } catch (e) {}
  }
  if (found) ok('「从体测报告识别」卡片存在')
  else bad('没找到识别卡片')

  // 展开
  const cards = await page.$$('.card')
  log('  卡片数: ' + cards.length)
  // 点第一张卡片头部展开
  try {
    const heads = await page.$$('.between')
    for (const h of heads) {
      const t = String(await h.text()).trim()
      if (t.indexOf('从体测报告识别') >= 0) { await h.tap(); break }
    }
  } catch (e) { bad('展开失败', e.message) }
  await sleep(1500)

  let d = await page.data()
  log('  showRecognize=' + d.showRecognize)
  if (d.showRecognize === true) ok('识别区已展开')
  else bad('识别区没展开')

  log('\n[2] 粘贴文字并解析')
  const textareas = await page.$$('textarea')
  log('  textarea 数量: ' + textareas.length)
  if (!textareas.length) { bad('找不到粘贴框'); }
  else {
    await textareas[0].input(TEXT)
    await sleep(900)
    const btns = await page.$$('button')
    let parseBtn = null
    for (const b of btns) {
      if (String(await b.text()).trim() === '解析文字') { parseBtn = b; break }
    }
    if (!parseBtn) bad('找不到「解析文字」按钮')
    else {
      await parseBtn.tap()
      await sleep(4000)
      d = await page.data()
      log('  识别结果提示: ' + (d.recognizeMsg || '(空)'))
      log('  体重输入框: ' + d.body.weight + ' 体脂率: ' + d.body.bodyFat + ' 骨骼肌量: ' + d.body.skeletalMuscle)
      log('  内脏脂肪: ' + d.body.visceral + ' 身体年龄: ' + d.body.bodyAge + ' 得分: ' + d.body.deviceScore)
      log('  节段脂肪: ' + JSON.stringify(d.body.segmentFat))
      log('  节段肌肉: ' + JSON.stringify(d.body.segmentMuscle))

      if (String(d.body.weight) === '80.25') ok('体重已填入 80.25')
      else bad('体重没填对', d.body.weight)
      if (String(d.body.bodyFat) === '27.6') ok('体脂率已填入 27.6')
      else bad('体脂率没填对', d.body.bodyFat)
      if (String(d.body.height) === '175') ok('身高已填入 175')
      else bad('身高没填对', d.body.height)
      if (String(d.body.skeletalMuscle) === '31.2') ok('骨骼肌量已填入 31.2')
      else bad('骨骼肌量没填对', d.body.skeletalMuscle)
      if (String(d.body.segmentFat.trunk) === '11.5') ok('节段脂肪-躯干已填入 11.5')
      else bad('节段脂肪没填对', JSON.stringify(d.body.segmentFat))
      if (String(d.body.deviceScore) === '74') ok('身体得分已填入 74')
      else bad('身体得分没填对', d.body.deviceScore)
    }
  }

  log('\n[3] 其它字段没被误填')
  if (!d.body.reportImage) ok('报告图字段仍是空的（等用户自己上传）')
  if (String(d.body.steps || '') === '') ok('运动步数没被误填')

  await mp.navigateBack()
  await sleep(600)
  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => { console.error('异常:', e.message); process.exit(2) })
