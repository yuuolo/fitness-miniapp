// 截图管理页的「上传与展示限制」卡片
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
  await page.setViewport({ width: 1000, height: 1400, deviceScaleFactor: 2 })
  await page.goto('https://gym.novrein.com/admin', { waitUntil: 'networkidle2', timeout: 45000 })
  await page.evaluate(t => localStorage.setItem('gym-admin-token', t), token)
  await page.reload({ waitUntil: 'networkidle2', timeout: 45000 })
  await new Promise(r => setTimeout(r, 2500))

  const card = await page.$('#mediaLimitsCard')
  if (!card) {
    console.log('⚠ 没找到卡片')
    await page.screenshot({ path: out + '/admin-limits.png', fullPage: false })
  } else {
    await card.evaluate(el => el.scrollIntoView({ block: 'center' }))
    await new Promise(r => setTimeout(r, 600))
    await card.screenshot({ path: out + '/admin-limits.png' })
    const msg = await page.evaluate(() => {
      const el = document.getElementById('limMsg')
      return el ? el.textContent.trim() : ''
    })
    const vals = await page.evaluate(() => {
      const o = {}
      ;['maxDuration', 'maxVideoMB', 'maxCount', 'maxTotalMB', 'feedThumbs'].forEach(k => {
        const el = document.getElementById('lim-' + k)
        o[k] = el ? el.value : null
      })
      return o
    })
    console.log('卡片状态: ' + msg)
    console.log('表单值: ' + JSON.stringify(vals))
  }
  await browser.close()
  console.log('截图: ' + out + '/admin-limits.png')
})().catch(e => { console.error('失败: ' + e.message); process.exit(1) })
