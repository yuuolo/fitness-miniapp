// 截图：管理页排行榜项目的「编辑」表单（并实测保存）
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
  await new Promise(r => setTimeout(r, 3000))

  // 找到「深蹲」那一行的编辑按钮并点开
  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#liftList [data-edit]'))
    const row = btns.find(b => {
      const feat = b.closest('.feat')
      return feat && feat.textContent.indexOf('深蹲') >= 0
    })
    if (!row) return false
    row.click()
    return true
  })
  console.log('点开编辑: ' + clicked)
  await new Promise(r => setTimeout(r, 800))

  const card = await page.evaluate(() => {
    const el = document.getElementById('liftList')
    return el ? el.parentElement : null
  })
  // 截图整个排行榜项目卡片
  const liftCard = await page.evaluateHandle(() => {
    const list = document.getElementById('liftList')
    return list ? list.closest('.card') : null
  })
  const el = liftCard.asElement()
  if (el) {
    await el.evaluate(n => n.scrollIntoView({ block: 'center' }))
    await new Promise(r => setTimeout(r, 500))
    await el.screenshot({ path: out + '/admin-lift-edit.png' })
  }
  const state = await page.evaluate(() => {
    const name = document.getElementById('editLiftName')
    const metric = document.getElementById('editLiftMetric')
    return {
      editing: !!name,
      name: name ? name.value : '',
      metricLocked: metric ? metric.disabled : null,
      metricValue: metric ? metric.value : ''
    }
  })
  console.log('编辑态: ' + JSON.stringify(state))
  await browser.close()
  console.log('截图: ' + out + '/admin-lift-edit.png')
})().catch(e => { console.error('失败: ' + e.message); process.exit(1) })
