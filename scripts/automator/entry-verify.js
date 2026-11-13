// 门店核心流程：入场码 → 前台扫码核验（扣次 + 加分）
// 通过 mock wx.scanCode 把「扫码结果」喂给前台页，走完整 verifyEntry 链路
const automator = require('miniprogram-automator')
const crypto = require('crypto')
const fs = require('fs')

const ENDPOINT = process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421'
const SECRET_HEX = process.env.GYM_SECRET || ''
const OPENID = process.env.GYM_OPENID || ''
const LOG = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/automator/entry.log'

let lines = []
let failures = 0
const log = m => { lines.push(m); console.log(m) }
const ok = m => log('  \u2713 ' + m)
const bad = (m, d) => { log('  \u2717 ' + m + (d ? ' -> ' + d : '')); failures++ }
const sleep = ms => new Promise(r => setTimeout(r, ms))

function makeCode(openid, ts) {
  const sig = crypto.createHmac('sha256', SECRET_HEX).update(openid + '.' + ts).digest('hex').slice(0, 20)
  return ['FE1', openid, ts, sig].join('.')
}

async function main() {
  if (!SECRET_HEX || !OPENID) {
    console.error('缺少 GYM_SECRET / GYM_OPENID 环境变量')
    process.exit(2)
  }

  const mp = await automator.connect({ wsEndpoint: ENDPOINT })
  log('已连接')

  // 抓 toast / modal 文案
  await mp.evaluate(() => {
    if (global.__log2) return
    global.__log2 = []
    const rawToast = wx.showToast
    wx.showToast = function (o) { try { global.__log2.push('toast:' + ((o && o.title) || '')) } catch (e) {} return rawToast.apply(wx, arguments) }
    const rawModal = wx.showModal
    wx.showModal = function (o) {
      try {
        global.__log2.push('modal:' + ((o && o.title) || '') + '|' + ((o && o.content) || ''))
        if (o && typeof o.success === 'function') o.success({ confirm: true, cancel: false })
        if (o && typeof o.complete === 'function') o.complete({ confirm: true, cancel: false })
        return
      } catch (e) { return rawModal.apply(wx, arguments) }
    }
  })
  const drain = () => mp.evaluate(() => { const l = (global.__log2 || []).slice(); global.__log2 = []; return l })

  // ---------- 1. 会员端：生成入场码 ----------
  log('\n[1] 会员端入场码')
  const entry = await mp.navigateTo('/pages/entry/entry')
  await sleep(3000)
  const ed = await entry.data()
  if (ed.image && String(ed.image).indexOf('data:image') === 0) ok('入场码已生成')
  else bad('入场码未生成', JSON.stringify(ed).slice(0, 200))
  log('  卡片信息: ' + ed.cardInfo)
  await mp.navigateBack()
  await sleep(800)

  // ---------- 2. 前台端：扫码核验 ----------
  log('\n[2] 前台扫码核验')
  const code = makeCode(OPENID, Date.now())
  log('  构造入场码: ' + code.slice(0, 40) + '…')
  await mp.mockWxMethod('scanCode', { result: code, scanType: 'QR_CODE' })

  const staff = await mp.navigateTo('/pages/staff/index/index')
  await sleep(3000)
  const sd = await staff.data()
  log('  role=' + sd.role + ' isStaff=' + sd.isStaff + ' 今日统计=' + JSON.stringify(sd.stat))
  if (sd.isStaff) ok('工作台识别当前账号为员工/管理员')
  else bad('工作台未识别为员工')

  const buttons = await staff.$$('button')
  let scanBtn = null
  for (const b of buttons) {
    const t = String(await b.text()).trim()
    if (t.indexOf('扫码') >= 0) { scanBtn = b; break }
  }
  if (!scanBtn) {
    bad('找不到扫码核验按钮')
  } else {
    await drain()
    await scanBtn.tap()
    await sleep(4000)
    const logs = await drain()
    log('  页面反馈: ' + JSON.stringify(logs))
    const after = await staff.data()
    log('  last = ' + JSON.stringify(after.last))
    if (after.last && !after.last.denied) {
      ok('核验成功：' + (after.last.name || '') + ' / ' + (after.last.message || ''))
    } else {
      bad('核验未通过', JSON.stringify(after.last))
    }
  }
  await mp.navigateBack()
  await sleep(800)

  // ---------- 3. 重复核验（当天第二次不扣次） ----------
  log('\n[3] 当天再次核验')
  const code2 = makeCode(OPENID, Date.now())
  await mp.mockWxMethod('scanCode', { result: code2, scanType: 'QR_CODE' })
  const staff2 = await mp.navigateTo('/pages/staff/index/index')
  await sleep(2500)
  const b2 = await staff2.$$('button')
  let s2 = null
  for (const b of b2) { if (String(await b.text()).indexOf('扫码') >= 0) { s2 = b; break } }
  if (s2) {
    await s2.tap()
    await sleep(3500)
    const d2 = await staff2.data()
    log('  last = ' + JSON.stringify(d2.last))
    if (d2.last && String(d2.last.message).indexOf('不重复扣次') >= 0) ok('当天第二次入场不重复扣次')
    else bad('第二次核验提示不符', JSON.stringify(d2.last && d2.last.message))
  } else {
    bad('第二次找不到扫码按钮')
  }

  log('\n结果：' + (failures ? failures + ' 项失败' : '全部通过'))
  fs.writeFileSync(LOG, lines.join('\n'))
  await mp.disconnect()
  process.exit(failures ? 1 : 0)
}

main().catch(e => {
  console.error('入场核验回归异常：', e)
  try { fs.writeFileSync(LOG, lines.concat(['异常: ' + e.message]).join('\n')) } catch (x) {}
  process.exit(2)
})
