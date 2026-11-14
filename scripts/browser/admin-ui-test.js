// 用无头 Chrome 真跑管理页：登录 → 等状态加载 → 检查渲染 → 截图
const puppeteer = require('puppeteer-core')

const URL = process.env.ADMIN_URL || 'http://192.168.1.31/admin'
const PASSWORD = process.env.ADMIN_PASSWORD || ''
const OUT = process.env.OUT_DIR || 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/browser'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const sleep = ms => new Promise(r => setTimeout(r, ms))
let failures = 0
const log = m => console.log(m)
const ok = m => log('  ✓ ' + m)
const bad = (m, d) => { log('  ✗ ' + m + (d ? ' -> ' + d : '')); failures++ }

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--ignore-certificate-errors']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1200, height: 1400, deviceScaleFactor: 1.5 })

  const errors = []
  page.on('pageerror', e => errors.push('pageerror: ' + e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

  log('打开 ' + URL)
  const resp = await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 })
  log('  HTTP ' + (resp && resp.status()))
  if (!resp || resp.status() !== 200) bad('页面打不开')
  else ok('页面返回 200')

  // 登录页
  const title = await page.title()
  log('  标题: ' + title)
  if (title.indexOf('服务器管理') >= 0) ok('标题正确')
  else bad('标题不符', title)

  const hasLogin = await page.$('#loginCard')
  if (hasLogin) ok('未登录时显示登录卡片')
  else bad('没有登录卡片')

  await page.screenshot({ path: OUT + '/admin-login.png', fullPage: true })
  log('  截图: admin-login.png')

  // 登录
  if (!PASSWORD) {
    bad('没有提供 ADMIN_PASSWORD，跳过登录')
  } else {
    await page.type('#password', PASSWORD)
    await page.click('#loginBtn')
    await page.waitForFunction(
      () => !document.getElementById('main').classList.contains('hidden'),
      { timeout: 20000 }
    ).catch(() => {})
    await sleep(2500)

    const mainVisible = await page.evaluate(
      () => !document.getElementById('main').classList.contains('hidden')
    )
    if (mainVisible) ok('密码正确，进入管理面板')
    else {
      const msg = await page.evaluate(() => (document.getElementById('loginMsg') || {}).textContent || '')
      bad('登录失败', msg)
    }
  }

  if (failures === 0) {
    // 状态渲染
    const statCount = await page.$$eval('#stats .stat', els => els.length)
    log('  状态卡片数量: ' + statCount)
    if (statCount >= 4) ok('系统状态已渲染')
    else bad('系统状态没渲染出来')

    const bizText = await page.$eval('#bizData', el => el.innerText)
    if (bizText.includes('会员总数')) ok('业务数据已渲染：' + bizText.split('\n')[0])
    else bad('业务数据没渲染')

    const rtText = await page.$eval('#runtimeConfig', el => el.innerText)
    if (rtText.includes('最小值') || rtText.includes('小程序 AppID')) ok('运行配置已渲染')
    else bad('运行配置没渲染')

    const curDriver = await page.$eval('#curDriver', el => el.textContent)
    log('  当前存储: ' + curDriver)
    if (curDriver && curDriver !== '—') ok('存储驱动已显示')
    else bad('存储驱动没显示')

    const cosHidden = await page.$eval('#sec-cos', el => el.classList.contains('hidden'))
    const pgHidden = await page.$eval('#sec-postgres', el => el.classList.contains('hidden'))
    if (cosHidden && !pgHidden) ok('默认只显示数据库驱动的表单')
    else bad('驱动表单显隐不正确')

    // 切到 COS，确认表单切换
    await page.select('#driver', 'cos')
    await sleep(400)
    const cosNow = await page.$eval('#sec-cos', el => el.classList.contains('hidden'))
    if (!cosNow) ok('切到 COS 后显示 COS 表单')
    else bad('切到 COS 表单没显示')

    await page.select('#driver', 'postgres')
    await sleep(400)

    // 点一次测试连接
    await page.click('#testBtn')
    await sleep(3000)
    const storageMsg = await page.$eval('#storageMsg', el => ({
      cls: el.className, text: el.textContent
    }))
    log('  测试连接结果: ' + JSON.stringify(storageMsg))
    if (storageMsg.cls.includes('ok')) ok('“测试连接”按钮工作正常')
    else bad('测试连接失败', storageMsg.text)

    await page.screenshot({ path: OUT + '/admin-panel.png', fullPage: true })
    log('  截图: admin-panel.png')
  }

  if (errors.length) {
    log('\n页面 JS 错误:')
    errors.slice(0, 10).forEach(e => log('  ' + e))
    failures++
  } else {
    ok('页面无 JS 报错')
  }

  await browser.close()
  log('\n结果：' + (failures ? failures + ' 项失败' : '全部通过'))
  process.exit(failures ? 1 : 0)
}

main().catch(e => {
  console.error('浏览器测试异常：', e.message)
  process.exit(2)
})
