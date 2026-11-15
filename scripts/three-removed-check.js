// 验证三个功能整条线删除后的界面状态
const automator = require('miniprogram-automator')
const puppeteer = require('puppeteer-core')
const sleep = ms => new Promise(r => setTimeout(r, ms))

let failures = 0
const log = m => console.log(m)
const ok = m => log('  ✓ ' + m)
const bad = (m, d) => { log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

const BANNED = ['约课', '娱乐预约', '会员卡', '入场码', '我的预约', '团课', '私教']

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

  // ---------- tabBar 只有 3 个 ----------
  log('\n[1] 底部 tab')
  await mp.reLaunch('/pages/index/index')
  await sleep(4000)
  const bar = await mp.evaluate(() => {
    const stack = getCurrentPages()
    const cur = stack[stack.length - 1]
    const b = cur.getTabBar()
    return (b.data.tabs || []).map(t => t.text)
  })
  log('  ' + JSON.stringify(bar))
  if (bar.length === 3 && bar.join('/') === '首页/友圈/我的') ok('tab 只剩 首页/友圈/我的')
  else bad('tab 不对', bar.join('/'))

  // ---------- 首页 ----------
  log('\n[2] 首页')
  const home = await mp.currentPage()
  const homeText = await allText(home)
  const homeHits = BANNED.filter(b => homeText.some(t => t.indexOf(b) >= 0))
  if (!homeHits.length) ok('首页没有约课/娱乐/会员卡/入场码字样')
  else bad('首页仍有：' + homeHits.join('、'))

  // ---------- 我的 ----------
  log('\n[3] 我的')
  const mine = await mp.switchTab('/pages/mine/mine')
  await sleep(3000)
  const mineText = await allText(mine)
  const mineHits = BANNED.filter(b => mineText.some(t => t.indexOf(b) >= 0))
  if (!mineHits.length) ok('「我的」没有相关菜单')
  else bad('「我的」仍有：' + mineHits.join('、'))
  const items = []
  for (const el of await mine.$$('.menu-item')) {
    try { items.push(String(await el.text()).trim()) } catch (e) {}
  }
  log('  菜单: ' + JSON.stringify(items))

  // ---------- 员工工作台 ----------
  log('\n[4] 员工工作台')
  await mp.switchTab('/pages/index/index')
  await sleep(800)
  const staff = await mp.navigateTo('/pages/staff/index/index')
  await sleep(3000)
  const staffText = await allText(staff)
  const staffHits = BANNED.filter(b => staffText.some(t => t.indexOf(b) >= 0))
  if (!staffHits.length) ok('员工工作台没有扫码核验等入口')
  else bad('员工工作台仍有：' + staffHits.join('、'))
  const smenu = []
  for (const el of await staff.$$('.list-item')) {
    try { smenu.push(String(await el.text()).trim()) } catch (e) {}
  }
  log('  菜单: ' + JSON.stringify(smenu))
  await mp.navigateBack()
  await sleep(600)

  // ---------- 其它页面可正常打开 ----------
  log('\n[5] 页面可访问')
  for (const [path, name] of [
    ['/pages/fitness/fitness', '身体数据'],
    ['/pages/rank/rank', '排行榜'],
    ['/pages/competitions/competitions', '竞赛'],
    ['/pages/moments/moments', '友圈']
  ]) {
    try {
      if (path === '/pages/moments/moments') await mp.switchTab(path)
      else { await mp.switchTab('/pages/index/index'); await sleep(700); await mp.navigateTo(path) }
      await sleep(1800)
      ok(name + ' 正常')
    } catch (e) { bad(name + ' 异常', e.message) }
  }

  // ---------- 管理页 ----------
  log('\n[6] 管理页功能开关')
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

  const feat = await page.evaluate(async () => {
    const res = await fetch('/api/admin/features', { headers: { 'x-admin-token': localStorage.getItem('gym-admin-token') || '' } })
    const d = await res.json()
    const data = d.data || {}
    return {
      keys: Object.keys(data.state || {}),
      names: (data.features || []).map(f => f.name)
    }
  })
  log('  开关: ' + JSON.stringify(feat.names))
  if (feat.names.length === 3) ok('只剩 3 个开关（友圈/身体数据/排行榜）')
  else bad('开关数量不对：' + feat.names.length)
  const still = feat.names.filter(n => n.indexOf('会员卡') >= 0 || n.indexOf('团课') >= 0 || n.indexOf('娱乐') >= 0)
  if (!still.length) ok('会员卡/团课/娱乐开关已消失')
  else bad('仍有残留开关：' + still.join('、'))

  const layout = await page.evaluate(async () => {
    const res = await fetch('/api/admin/layout', { headers: { 'x-admin-token': localStorage.getItem('gym-admin-token') || '' } })
    const d = await res.json()
    return ((d.data || {}).meta || {}).pages || []
  })
  log('  首页自定义入口可选页面: ' + layout.length + ' 个')
  const badPages = layout.filter(p => /cards|schedule|venues|bookings|entry/.test(p.path))
  if (!badPages.length) ok('可选页面里没有已删页面')
  else bad('可选页面仍有已删页面：' + badPages.map(p => p.path).join(','))

  await browser.close()
  await mp.disconnect()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch(e => { console.error('异常:', e.message); process.exit(2) })
