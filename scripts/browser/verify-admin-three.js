// 只验证管理页：功能开关、首页布局可选模块/页面
const puppeteer = require('puppeteer-core')

let failures = 0
const log = m => console.log(m)
const ok = m => log('  ✓ ' + m)
const bad = (m, d) => { log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1000, height: 1500 })
  await page.goto(process.env.ADMIN_URL || 'https://gym.novrein.com/admin', { waitUntil: 'networkidle0', timeout: 30000 })
  await page.type('#password', process.env.ADMIN_PASSWORD || '')
  await page.click('#loginBtn')
  await new Promise(r => setTimeout(r, 2500))

  const token = await page.evaluate(() => localStorage.getItem('gym-admin-token'))

  // ---------- 功能开关 ----------
  const feat = await page.evaluate(async tok => {
    const res = await fetch('/api/admin/features', { headers: { 'x-admin-token': tok } })
    const d = await res.json()
    const data = d.data || {}
    return { names: (data.features || []).map(f => f.name), keys: Object.keys(data.state || {}).filter(k => k !== 'updatedAt' && k !== 'updatedBy') }
  }, token)
  log('\n[1] 功能开关')
  log('  ' + JSON.stringify(feat.names))
  if (feat.names.length === 3) ok('只剩 3 个开关')
  else bad('开关数量不对：' + feat.names.length)
  const still = feat.names.filter(n => /会员卡|团课|娱乐/.test(n))
  if (!still.length) ok('会员卡 / 团课与私教预约 / 娱乐项目预约 已彻底消失')
  else bad('仍有残留：' + still.join('、'))

  // ---------- 管理页 DOM 上的开关 ----------
  const domFeat = await page.evaluate(() => {
    const txt = document.body.innerText
    return {
      hasCards: /会员卡/.test(txt),
      hasClasses: /团课与私教预约/.test(txt),
      hasVenues: /娱乐项目预约/.test(txt)
    }
  })
  log('\n[2] 管理页正文')
  Object.entries(domFeat).forEach(([k, v]) => log('  ' + k + ': ' + (v ? '仍然出现 ⚠' : '没有 ✓')))
  if (!domFeat.hasCards && !domFeat.hasClasses && !domFeat.hasVenues) ok('页面上看不到这三个开关')
  else bad('页面上还有残留文案')

  // ---------- 首页布局 ----------
  const layout = await page.evaluate(async tok => {
    const res = await fetch('/api/admin/layout', { headers: { 'x-admin-token': tok } })
    const d = await res.json()
    const meta = (d.data || {}).meta || {}
    return {
      blocks: (meta.blocks || []).map(b => b.name),
      pages: (meta.pages || []).map(p => p.path),
      roles: Object.keys((d.data || {}).roles || {})
    }
  }, token)
  log('\n[3] 首页布局')
  log('  模块: ' + JSON.stringify(layout.blocks))
  log('  可选页面: ' + layout.pages.length + ' 个')
  log('  角色: ' + JSON.stringify(layout.roles))
  if (layout.blocks.length === 6) ok('6 种模块')
  else bad('模块数不对：' + layout.blocks.length)
  const badPages = layout.pages.filter(p => /cards|schedule|venues|bookings|entry/.test(p))
  if (!badPages.length) ok('可选页面里没有已删页面')
  else bad('可选页面仍有：' + badPages.join(', '))
  if (layout.roles.length === 3) ok('三个角色')
  else bad('角色数不对')

  // ---------- 业务数据 ----------
  const counts = await page.evaluate(async tok => {
    const res = await fetch('/api/admin/status', { headers: { 'x-admin-token': tok } })
    const d = await res.json()
    return d.data || d
  }, token).catch(() => null)
  log('\n[4] 业务数据接口')
  if (counts) log('  ' + JSON.stringify(counts).slice(0, 300))
  else log('  （跳过）')

  await browser.close()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常:', e.message); process.exit(2) })
