// 验证首页布局编辑器修复：角色 tab、恢复默认三种反馈、未保存高亮
const puppeteer = require('puppeteer-core')
const fs = require('fs')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
const URL = process.env.ADMIN_URL || 'https://gym.novrein.com/admin'
const PASSWORD = process.env.ADMIN_PASSWORD || ''

let failures = 0
const log = m => console.log(m)
const ok = m => log('  ✓ ' + m)
const bad = (m, d) => { log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1000, height: 1700, deviceScaleFactor: 1.5 })
  const errors = []
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.slice(0, 200)))
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)) })
  page.on('dialog', async d => { await d.accept() })

  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 })
  await page.type('#password', PASSWORD)
  await page.click('#loginBtn')
  await new Promise(r => setTimeout(r, 2500))

  log('[1] 角色 tab')
  const tabInfo = await page.evaluate(() => {
    const el = document.getElementById('roleTabs')
    const tag = document.getElementById('layoutRoleTag')
    return {
      count: el.querySelectorAll('.roleTab').length,
      labels: Array.from(el.querySelectorAll('.roleTab')).map(t => t.textContent.trim()),
      titleTag: tag ? tag.textContent : null
    }
  })
  log('  ' + JSON.stringify(tabInfo))
  if (tabInfo.count === 3) ok('三个角色 tab 都在')
  else bad('角色 tab 数量不对')
  if (tabInfo.titleTag) ok('标题显示当前角色：' + tabInfo.titleTag)

  log('\n[2] 切换角色 tab')
  await page.evaluate(() => {
    const tabs = document.querySelectorAll('#roleTabs .roleTab')
    tabs[tabs.length - 1].click()
  })
  await new Promise(r => setTimeout(r, 800))
  const afterSwitch = await page.evaluate(() => ({
    active: (document.querySelector('#roleTabs .roleTab.on') || {}).textContent,
    tag: document.getElementById('layoutRoleTag').textContent,
    blocks: document.querySelectorAll('#layoutList .blk').length
  }))
  log('  ' + JSON.stringify(afterSwitch))
  if (afterSwitch.tag === '管理员') ok('切到管理员后标题同步')
  else bad('标题没同步')

  log('\n[3] 恢复默认（当前应已是默认 → 应提示"已经是默认布局"）')
  await page.evaluate(() => document.getElementById('layoutResetBtn').click())
  await new Promise(r => setTimeout(r, 900))
  let resetMsg = await page.evaluate(() => ({
    cls: document.getElementById('layoutMsg').className,
    text: document.getElementById('layoutMsg').textContent
  }))
  log('  ' + JSON.stringify(resetMsg))
  if (/已经是默认|已恢复默认/.test(resetMsg.text)) ok('恢复默认有明确反馈')
  else bad('恢复默认没有反馈')

  log('\n[4] 改动后应出现未保存高亮')
  await page.evaluate(() => {
    const btns = document.querySelectorAll('#layoutList [data-act="toggle"]')
    if (btns.length) btns[0].click()
  })
  await new Promise(r => setTimeout(r, 600))
  const dirty = await page.evaluate(() => {
    const btn = document.getElementById('layoutSaveBtn')
    return { cls: btn.className, text: btn.textContent.trim() }
  })
  log('  ' + JSON.stringify(dirty))
  if (dirty.cls.indexOf('dirty') >= 0) ok('「保存布局」出现未保存高亮')
  else bad('未保存高亮没出现')

  log('\n[5] 再点恢复默认（这次应真的恢复并提示未保存）')
  await page.evaluate(() => document.getElementById('layoutResetBtn').click())
  await new Promise(r => setTimeout(r, 900))
  const reset2 = await page.evaluate(() => ({
    cls: document.getElementById('layoutMsg').className,
    text: document.getElementById('layoutMsg').textContent,
    blocks: document.querySelectorAll('#layoutList .blk').length
  }))
  log('  ' + JSON.stringify(reset2))
  if (/已恢复默认/.test(reset2.text)) ok('恢复默认生效并有提示')
  else bad('恢复默认仍无反馈')

  log('\n[6] 快捷入口表单不再有 emoji 输入')
  const formInfo = await page.evaluate(() => {
    const icon = document.getElementById('linkIcon')
    const disabled = icon ? icon.disabled : null
    const labels = Array.from(document.querySelectorAll('label')).map(l => l.textContent.trim())
    return { iconExists: !!icon, disabled, iconLabels: labels.filter(l => l.indexOf('图标') >= 0) }
  })
  log('  ' + JSON.stringify(formInfo))
  if (!formInfo.iconExists || formInfo.disabled) ok('emoji 输入框已改为只读说明')
  else bad('emoji 输入框仍可编辑')

  await page.screenshot({ path: OUT + '/layout-fixed.png', fullPage: false })
  log('\n截图: ' + OUT + '/layout-fixed.png')

  log('\n[7] 页面错误')
  const real = errors.filter(e => !/favicon/.test(e))
  if (real.length) { real.slice(0, 5).forEach(e => log('  ' + e)); bad('有 ' + real.length + ' 个错误') }
  else ok('无页面错误')

  await browser.close()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常:', e.message); process.exit(2) })
