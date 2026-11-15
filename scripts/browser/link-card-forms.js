// 生成快捷入口卡片两种形态的效果图：无图标 / 有图标
const puppeteer = require('puppeteer-core')
const fs = require('fs')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'

const card = (icon, title, desc) => `
  <div class="card">
    ${icon ? `<div class="link-icon">${icon}</div>` : ''}
    <div class="grow">
      <div class="t">${title}</div>
      <div class="d">${desc}</div>
    </div>
    <div class="chev">›</div>
  </div>`

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { margin: 0; background: #f7f4f1; padding: 22px; font: 14px/1.6 -apple-system,"Microsoft YaHei",sans-serif; width: 420px; }
  h1 { font-size: 15px; color: #23201d; margin-bottom: 4px; }
  .lead { font-size: 12px; color: #9c948c; margin-bottom: 16px; }
  .card {
    background: #fff; border-radius: 12px; padding: 14px; margin-bottom: 12px;
    display: flex; align-items: center; box-shadow: 0 2px 10px rgba(35,32,29,.05);
  }
  .link-icon {
    width: 36px; height: 36px; flex: none; border-radius: 9px;
    background: #fdf0ea; display: flex; align-items: center; justify-content: center;
    font-size: 18px; margin-right: 10px;
  }
  .grow { flex: 1; min-width: 0; }
  .t { font-size: 15px; font-weight: 600; color: #23201d; }
  .d { font-size: 12px; color: #9c948c; }
  .chev { color: #c3bab1; font-size: 16px; margin-left: 8px; }
  .note { font-size: 11px; color: #9c948c; margin: -4px 0 14px; }
</style></head><body>
  <h1>快捷入口卡片</h1>
  <div class="lead">图标留空就不显示，不会再套一个统一的链接图标</div>

  ${card('', '无图标入口', '这个不显示图标')}
  <div class="note">↑ 管理页「图标」留空的效果：文字直接顶到左边</div>

  ${card('🏆', '带图标入口', '这个有图标')}
  <div class="note">↑ 填了图标的效果</div>
</body></html>`

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(OUT + '/link-card-forms.html', html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 420, height: 360, deviceScaleFactor: 3 })
  await page.goto('file:///' + (OUT + '/link-card-forms.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' })
  await page.screenshot({ path: OUT + '/link-card-forms.png', fullPage: true })
  await browser.close()
  console.log('效果图: ' + OUT + '/link-card-forms.png')
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
