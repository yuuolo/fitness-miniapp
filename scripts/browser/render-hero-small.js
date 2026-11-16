// 按小程序里的真实尺寸（78px）看两个动作是否清楚
const fs = require('fs')
const puppeteer = require('puppeteer-core')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const mod = require(MP + '/utils/hero-anim.js')

const PHASES = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]

const row = key => {
  const pose = mod.BY_KEY[key]
  const cells = PHASES.map(p => `
    <div class="cell">
      <div class="banner">
        <div class="fig" style="background-image:url('${mod.figureUri(key, 'male', p)}')"></div>
      </div>
    </div>`).join('')
  return `<div class="row"><div class="lb">${pose.name}</div>${cells}</div>`
}

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 1120px; background: #f7f4f1; padding: 12px; font: 11px/1.4 -apple-system,"Microsoft YaHei",sans-serif; }
  .row { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
  .lb { width: 42px; flex: none; color: #6b645c; }
  .cell { flex: 1; }
  .banner { position: relative; border-radius: 10px; height: 44px;
    background: linear-gradient(135deg, #f0703f, #e9603a); overflow: hidden; }
  .fig { position: absolute; right: 4px; top: 50%; width: 39px; height: 39px; margin-top: -19.5px;
    background-repeat: no-repeat; background-position: center; background-size: contain; }
</style></head><body>${['lift', 'squat', 'curl', 'dip', 'run', 'pullup'].map(row).join('')}</body></html>`

const out = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
fs.writeFileSync(out + '/hero-small.html', html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1120, height: 200, deviceScaleFactor: 3 })
  await page.goto('file:///' + (out + '/hero-small.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' })
  await page.screenshot({ path: out + '/hero-small.png', fullPage: true })
  await browser.close()
  console.log('效果图: ' + out + '/hero-small.png')
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
