// 验证 5 个模块已彻底移除：首页、我的、员工工作台、管理页布局
const automator = require('miniprogram-automator')
const puppeteer = require('puppeteer-core')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const log = m => console.log(m)
const ok = m => log('  ✓ ' + m)
const bad = (m, d) => { log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

const BANNED = ['入场码', '今日概况', '我的会员卡', '今日预约', '积分']

async function allText(page) {
  const out = []
  for (const el of await page.$$('view')) {
    try { const t = String(await el.text()).trim(); if (t) out.push(t) } catch (e) {}
  }
  return out
}

async function main() {
  const mp = await automator.connect({ wsEndpoint: process.env.AUTO_ENDPOINT || 'ws://127.0.0.1:9421' })
  log('已连接')

  // ---------- 1. 首页 ----------
  log('\n[1] 首页')
  const home = await mp.switchTab('/pages/index/index')
  await sleep(4000)
  const hd = await home.data()
  log('  布局模块: ' + JSON.stringify((hd.layout || []).map(b => b.type)))
  const types = (hd.layout || []).map(b => b.type)
  const removed = ['entry', 'stats', 'cards', 'bookings']
  if (!types.some(t => removed.indexOf(t) >= 0)) ok('布局里没有被删的 4 种模块')
  else bad('布局里还有：' + types.filter(t => removed.indexOf(t) >= 0).join(','))

  const homeText = await allText(home)
  const hits = BANNED.filter(b => homeText.some(t => t.indexOf(b) >= 0))
  if (!hits.length) ok('首页整页没有「' + BANNED.join('/') + '」字样')
  else bad('首页仍有：' + hits.join('、'))

  if (hd.cards === undefined && hd.stat === undefined && hd.bookings === undefined) {
    ok('首页 data 里不再有 cards / stat / bookings')
  } else bad('首页 data 仍有残留字段')

  // ---------- 2. 我的 ----------
  log('\n[2] 我的')
  const mine = await mp.switchTab('/pages/mine/mine')
  await sleep(3000)
  const mineText = await allText(mine)
  const mineHits = BANNED.filter(b => mineText.some(t => t.indexOf(b) >= 0))
  if (!mineHits.length) ok('「我的」没有积分等字样')
  else bad('「我的」仍有：' + mineHits.join('、'))

  const card = await mine.$$('.points-card')
  if (!card.length) ok('积分卡片已删除')
  const seg = await mine.$$('.points-n')
  if (!seg.length) ok('积分数字样式节点已删除')

  // ---------- 3. 员工工作台 ----------
  log('\n[3] 员工工作台')
  await mp.switchTab('/pages/index/index')
  await sleep(800)
  const staff = await mp.navigateTo('/pages/staff/index/index')
  await sleep(3000)
  const sd = await staff.data()
  log('  role=' + sd.role + ' isStaff=' + sd.isStaff + ' isCoach=' + sd.isCoach)
  // 模拟器登录的账号可能是会员/教练/管理员：只校验角色能被解析、权限标志与角色一致
  const roleOk = !!sd.role && ['会员', '教练', '管理员'].indexOf(sd.role) >= 0
  const staffOk = sd.isStaff === (sd.role === '管理员')
  const coachOk = sd.isCoach === (sd.role === '管理员' || sd.role === '教练')
  if (roleOk && staffOk && coachOk) ok('角色识别正常（role=' + sd.role + '）')
  else bad('角色识别异常', 'role=' + sd.role + ' isStaff=' + sd.isStaff + ' isCoach=' + sd.isCoach)
  const staffText = await allText(staff)
  const staffHits = BANNED.filter(b => staffText.some(t => t.indexOf(b) >= 0))
  if (!staffHits.length) ok('员工工作台没有「今日概况」等内容')
  else bad('员工工作台仍有：' + staffHits.join('、'))
  const menu = []
  for (const el of await staff.$$('.list-item')) {
    try { menu.push(String(await el.text()).trim()) } catch (e) {}
  }
  log('  菜单: ' + JSON.stringify(menu))

  await mp.navigateBack()
  await sleep(600)

  // ---------- 4. 管理页布局 ----------
  log('\n[4] 管理页首页布局')
  const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1000, height: 1400 })
  await page.goto(process.env.ADMIN_URL || 'https://gym.novrein.com/admin', { waitUntil: 'networkidle0', timeout: 30000 })
  await page.type('#password', process.env.ADMIN_PASSWORD || '')
  await page.click('#loginBtn')
  await sleep(2500)

  const blocks = await page.evaluate(async () => {
    const res = await fetch('/api/admin/layout', { headers: { 'x-admin-token': localStorage.getItem('gym-admin-token') || '' } })
    const d = await res.json()
    const meta = (d.data || {}).meta || {}
    return { names: (meta.blocks || []).map(b => b.name), types: (meta.blocks || []).map(b => b.type) }
  })
  log('  可选模块: ' + JSON.stringify(blocks.names))
  if (blocks.types.length === 6) ok('管理页只剩 6 种可选模块')
  else bad('模块数量不对：' + blocks.types.length)
  const badTypes = blocks.types.filter(t => ['entry', 'stats', 'cards', 'bookings'].indexOf(t) >= 0)
  if (!badTypes.length) ok('被删模块不在可选项里')
  else bad('可选项里还有：' + badTypes.join(','))

  const featureNames = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#featureList input, .feature-row')).length
  })
  log('  功能开关控件数: ' + featureNames)

  await browser.close()
  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => { console.error('异常:', e.message); process.exit(2) })
