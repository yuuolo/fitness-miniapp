// 读管理页角色 tab 的实际计算样式，判断是否“变色导致看不见”
const puppeteer = require('puppeteer-core')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const URL = process.env.ADMIN_URL || 'https://gym.novrein.com/admin'
const PASSWORD = process.env.ADMIN_PASSWORD || ''

async function inspect(page, label) {
  const info = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('#roleTabs .roleTab'))
    const pick = el => {
      const s = getComputedStyle(el)
      return { text: el.textContent.trim(), color: s.color, bg: s.backgroundColor, border: s.borderColor }
    }
    const bar = document.querySelector('.tabbar')
    const body = getComputedStyle(document.body)
    return {
      bodyBg: body.backgroundColor,
      bodyColor: body.color,
      colorScheme: body.colorScheme,
      tabs: tabs.map(pick)
    }
  })
  console.log('--- ' + label + ' ---')
  console.log('  body 背景: ' + info.bodyBg + '  文字: ' + info.bodyColor + '  color-scheme: ' + info.colorScheme)
  info.tabs.forEach(t => console.log('  ' + t.text + ': 文字 ' + t.color + ' / 背景 ' + t.bg + ' / 边框 ' + t.border))
}

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1000, height: 1200 })

  // 浅色（系统默认）
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
  await page.goto(URL, { waitUntil: 'networkidle0' })
  await page.type('#password', PASSWORD)
  await page.click('#loginBtn')
  await new Promise(r => setTimeout(r, 2200))
  await inspect(page, '浅色系统')

  // 深色（系统深色模式）
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
  await page.reload({ waitUntil: 'networkidle0' })
  await new Promise(r => setTimeout(r, 2500))
  // 重新登录（token 已存在会自动进）
  const needLogin = await page.evaluate(() => !document.getElementById('main').classList.contains('hidden') ? false : true)
  if (needLogin) {
    await page.type('#password', PASSWORD)
    await page.click('#loginBtn')
    await new Promise(r => setTimeout(r, 2200))
  }
  await inspect(page, '深色系统')

  await browser.close()
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
