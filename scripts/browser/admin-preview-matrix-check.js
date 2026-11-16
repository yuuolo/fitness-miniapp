// 验证管理页「预览模块 × 角色」开关矩阵 + 添加模块
const puppeteer = require('puppeteer-core')
const https = require('https')
const fs = require('fs')

const BASE = process.env.ADMIN_URL || 'https://gym.novrein.com'
const PASSWORD = process.env.ADMIN_PASSWORD || ''

let failures = 0
const log = m => console.log(m)
const ok = m => log('  ✓ ' + m)
const bad = (m, d) => { log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }
const sleep = ms => new Promise(r => setTimeout(r, ms))

function req(url, method, body, token) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body)
    const opts = { method, headers: { 'content-type': 'application/json' } }
    if (data) opts.headers['content-length'] = Buffer.byteLength(data)
    if (token) opts.headers['x-admin-token'] = token
    const r = https.request(url, opts, res => {
      let raw = ''
      res.on('data', c => (raw += c))
      res.on('end', () => {
        try { resolve(JSON.parse(raw)) } catch (e) { reject(new Error('非 JSON: ' + raw.slice(0, 120))) }
      })
    })
    r.on('error', reject)
    r.setTimeout(15000, () => r.destroy(new Error('超时')))
    if (data) r.write(data)
    r.end()
  })
}

async function getLayout() {
  const login = await req(BASE + '/api/admin/login', 'POST', { password: PASSWORD })
  const token = login.data && login.data.token
  const d = await req(BASE + '/api/admin/layout', 'GET', undefined, token)
  return d.data
}

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1180, height: 1400, deviceScaleFactor: 2 })

  log('[1] 打开管理页并登录')
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle2', timeout: 30000 })
  await page.waitForSelector('#loginCard', { timeout: 10000 })
  const cards = await page.$$eval('#loginCard input', els => els.map(e => e.id))
  log('  登录输入框: ' + JSON.stringify(cards))
  await page.type('#loginCard input#password', PASSWORD)
  await page.evaluate(() => { const b = document.querySelector('#loginCard button'); if (b) b.click() })
  await sleep(3000)
  const loggedIn = await page.evaluate(() => !!document.querySelector('#previewMatrix') || !!document.querySelector('#logoutBtn'))
  if (loggedIn) ok('登录成功')
  else bad('登录失败')

  log('\n[2] 找到「首页布局」与预览矩阵')
  await page.evaluate(() => {
    const h2s = [...document.querySelectorAll('h2')]
    const hit = h2s.find(h => h.textContent.indexOf('首页布局') >= 0)
    if (hit) hit.scrollIntoView({ block: 'center' })
  })
  await sleep(800)
  const hasMatrix = await page.$('#previewMatrix')
  if (hasMatrix) ok('矩阵容器存在')
  else bad('没有矩阵容器')

  const matrix = await page.evaluate(() => {
    const t = document.querySelector('#previewMatrix table')
    if (!t) return null
    const head = [...t.querySelectorAll('thead th')].map(th => th.textContent.trim())
    const rows = [...t.querySelectorAll('tbody tr')].map(tr => ({
      name: tr.querySelector('td').textContent.trim(),
      cells: [...tr.querySelectorAll('td button')].map(b => ({ role: b.getAttribute('data-pv-role'), type: b.getAttribute('data-pv-type'), label: b.textContent.trim() }))
    }))
    return { head, rows }
  })
  if (!matrix) { bad('矩阵没渲染'); await browser.close(); process.exit(1) }
  log('  表头: ' + JSON.stringify(matrix.head))
  log('  行数: ' + matrix.rows.length)
  matrix.rows.forEach(r => log('    ' + r.name + ': ' + r.cells.map(c => c.role + '=' + c.label).join(' ')))
  if (matrix.rows.length === 3) ok('3 个预览模块都在矩阵里')
  else bad('预览模块数量不对', matrix.rows.length)
  if (matrix.head.length === 4) ok('矩阵含 3 个角色列')
  else bad('角色列数不对', matrix.head.length)

  log('\n[3] 添加模块下拉是否有可选项')
  const addOptions = await page.$$eval('#blockAddSelect option', els => els.map(e => e.value + ':' + e.textContent.trim().slice(0, 12)))
  log('  可选模块: ' + JSON.stringify(addOptions))

  log('\n[4] 切换「会员」的竞赛预览 → 隐藏 → 保存')
  const before = await getLayout()
  const wasOn = (before.roles.member.find(b => b.type === 'competitions') || {}).enabled
  log('  线上当前 member.competitions.enabled = ' + wasOn)
  await page.evaluate(() => {
    const btn = document.querySelector('#previewMatrix [data-pv-role="member"][data-pv-type="competitions"]')
    if (btn) btn.click()
  })
  await sleep(600)
  const afterClick = await page.evaluate(() => {
    const btn = document.querySelector('#previewMatrix [data-pv-role="member"][data-pv-type="competitions"]')
    return btn ? btn.textContent.trim() : ''
  })
  log('  点击后按钮文案: ' + afterClick)
  if (afterClick !== (wasOn ? '显示' : '已隐藏')) ok('矩阵按钮已切换')
  else bad('按钮没切换')

  await page.evaluate(() => document.querySelector('#layoutSaveBtn').click())
  await sleep(2500)
  const msg = await page.evaluate(() => (document.querySelector('#layoutMsg') || {}).textContent || '')
  log('  保存提示: ' + msg.trim())
  const after = await getLayout()
  const nowOn = (after.roles.member.find(b => b.type === 'competitions') || {}).enabled
  log('  保存后 member.competitions.enabled = ' + nowOn)
  if (nowOn === !wasOn) ok('只改了「会员」的竞赛预览，接口已生效')
  else bad('保存没生效')

  // 其他角色不该被影响
  const coachOn = (after.roles.coach.find(b => b.type === 'competitions') || {}).enabled
  if (coachOn === true) ok('教练的竞赛预览未受影响')
  else bad('教练的也被改了', coachOn)

  log('\n[5] 恢复原状')
  await page.evaluate(() => {
    const btn = document.querySelector('#previewMatrix [data-pv-role="member"][data-pv-type="competitions"]')
    if (btn) btn.click()
  })
  await sleep(500)
  await page.evaluate(() => document.querySelector('#layoutSaveBtn').click())
  await sleep(2500)
  const final = await getLayout()
  const finalOn = (final.roles.member.find(b => b.type === 'competitions') || {}).enabled
  log('  恢复后 member.competitions.enabled = ' + finalOn)
  if (finalOn === wasOn) ok('已恢复原状')
  else bad('恢复失败')

  // 截图存档
  const out = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
  fs.mkdirSync(out, { recursive: true })
  const card = await page.evaluateHandle(() => {
    const h2s = [...document.querySelectorAll('h2')]
    const hit = h2s.find(h => h.textContent.indexOf('首页布局') >= 0)
    return hit ? hit.closest('.card') : null
  })
  const el = card.asElement()
  if (el) {
    await el.scrollIntoView()
    await sleep(500)
    await el.screenshot({ path: out + '/admin-preview-matrix.png' })
    log('\n截图: ' + out + '/admin-preview-matrix.png')
  }

  await browser.close()
  log('')
  log(failures ? failures + ' 项失败' : '全部通过')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('异常: ' + e.message); process.exit(2) })
