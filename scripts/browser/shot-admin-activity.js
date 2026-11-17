// 截图管理页「运动记录」卡片
const fs = require('fs')
const puppeteer = require('puppeteer-core')

const token = fs.readFileSync('C:/Users/yuuolo/Documents/deepseek/.dsh-tools/admin-token.txt', 'utf8').trim()
const out = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--ignore-certificate-errors']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1000, height: 1500, deviceScaleFactor: 2 })
  await page.goto('https://gym.novrein.com/admin', { waitUntil: 'networkidle2', timeout: 45000 })
  await page.evaluate(t => localStorage.setItem('gym-admin-token', t), token)
  await page.reload({ waitUntil: 'networkidle2', timeout: 45000 })
  await new Promise(r => setTimeout(r, 3000))

  const card = await page.$('#activityCard')
  if (!card) {
    console.log('⚠ 没找到运动记录卡片')
  } else {
    await card.evaluate(el => el.scrollIntoView({ block: 'center' }))
    await new Promise(r => setTimeout(r, 800))
    await card.screenshot({ path: out + '/admin-activity.png' })
    const msg = await page.evaluate(() => {
      const el = document.getElementById('actMsg')
      return el ? el.textContent.trim() : ''
    })
    const rows = await page.evaluate(() => document.querySelectorAll('#actList tbody tr').length)
    console.log('卡片状态: ' + msg)
    console.log('表格行数: ' + rows)
  }
  await browser.close()
  console.log('截图: ' + out + '/admin-activity.png')
})().catch(e => { console.error('失败: ' + e.message); process.exit(1) })
