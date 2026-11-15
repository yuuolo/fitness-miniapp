// 诊断首页布局编辑器：抓控制台错误、检查角色 tab、点恢复默认按钮
const puppeteer = require('puppeteer-core')
const fs = require('fs')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
const URL = process.env.ADMIN_URL || 'https://gym.novrein.com/admin'
const PASSWORD = process.env.ADMIN_PASSWORD || ''

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1000, height: 1600, deviceScaleFactor: 1.5 })

  const errors = []
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.slice(0, 300)))
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)) })
  page.on('requestfailed', r => errors.push('REQFAIL: ' + r.url().slice(0, 160)))

  // 自动确认所有 confirm
  page.on('dialog', async d => { await d.accept() })

  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 })
  await page.type('#password', PASSWORD)
  await page.click('#loginBtn')
  await new Promise(r => setTimeout(r, 2500))

  console.log('=== 登录 ===')
  const logged = await page.evaluate(() => !document.getElementById('main').classList.contains('hidden'))
  console.log('  登录成功: ' + logged)

  // 1. 角色 tab
  console.log('\n=== 角色 tab ===')
  const tabs = await page.evaluate(() => {
    const el = document.getElementById('roleTabs')
    if (!el) return { missing: true }
    return {
      html: el.innerHTML.slice(0, 400),
      count: el.querySelectorAll('.roleTab').length,
      labels: Array.from(el.querySelectorAll('.roleTab')).map(t => t.textContent.trim())
    }
  })
  console.log('  ' + JSON.stringify(tabs, null, 2))

  // 2. 布局列表
  console.log('\n=== 布局列表 ===')
  const listInfo = await page.evaluate(() => {
    const el = document.getElementById('layoutList')
    return { blocks: el.querySelectorAll('.blk').length, html: el.innerHTML.slice(0, 300) }
  })
  console.log('  ' + JSON.stringify(listInfo, null, 2))

  // 3. 后端返回的 meta
  console.log('\n=== 接口返回的 meta ===')
  const meta = await page.evaluate(async () => {
    const res = await fetch('/api/admin/layout', {
      headers: { 'x-admin-token': localStorage.getItem('gym-admin-token') || '' }
    })
    const d = await res.json()
    const m = (d.data || {}).meta || {}
    return {
      roles: (m.roles || []).map(r => r.key + ':' + r.name),
      defaultKeys: Object.keys(m.defaults || {}),
      hasStaffKey: !!(m.defaults || {}).staff
    }
  })
  console.log('  ' + JSON.stringify(meta, null, 2))

  // 4. 点「恢复默认」
  console.log('\n=== 点击「恢复默认」 ===')
  const beforeCount = await page.evaluate(() => document.querySelectorAll('#layoutList .blk').length)
  await page.evaluate(() => document.getElementById('layoutResetBtn').click())
  await new Promise(r => setTimeout(r, 1200))
  const afterReset = await page.evaluate(() => {
    const msg = document.getElementById('layoutMsg')
    return {
      blocks: document.querySelectorAll('#layoutList .blk').length,
      msgClass: msg.className,
      msgText: msg.textContent.slice(0, 120)
    }
  })
  console.log('  点之前模块数: ' + beforeCount)
  console.log('  点之后: ' + JSON.stringify(afterReset, null, 2))

  await page.screenshot({ path: OUT + '/layout-editor.png', fullPage: false })
  console.log('\n截图: ' + OUT + '/layout-editor.png')

  console.log('\n=== 页面错误 ===')
  if (errors.length) errors.slice(0, 10).forEach(e => console.log('  ' + e))
  else console.log('  无')

  await browser.close()
})().catch(e => { console.error('诊断失败:', e.message); process.exit(1) })
