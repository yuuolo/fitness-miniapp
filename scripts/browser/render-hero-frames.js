// 密集帧预览：看举重、跑步每一帧的形态
const fs = require('fs')
const puppeteer = require('puppeteer-core')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const mod = require(MP + '/utils/hero-anim.js')

const PHASES = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]
const KEYS = process.env.KEYS ? process.env.KEYS.split(',') : ['lift', 'run']

const row = key => {
  const pose = mod.BY_KEY[key]
  const cells = PHASES.map(p => `<div class="cell"><div class="fig" style="background-image:url('${mod.figureUri(key, 'male', p)}')"></div></div>`).join('')
  return `<div class="row"><div class="lb">${pose.name}</div>${cells}</div>`
}

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 940px; background: #f7f4f1; padding: 12px; font: 12px/1.4 -apple-system,"Microsoft YaHei",sans-serif; }
  .row { display: flex; align-items: center; gap: 5px; margin-bottom: 8px; }
  .lb { width: 70px; flex: none; color: #6b645c; }
  .cell { flex: 1; border-radius: 10px; padding: 3px; background: linear-gradient(135deg, #f0703f, #e9603a); }
  .fig { width: 100%; height: 100px; background-repeat: no-repeat; background-position: center; background-size: contain; }
</style></head><body>${KEYS.map(row).join('')}</body></html>`

const out = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
fs.writeFileSync(out + '/hero-frames.html', html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 940, height: 300, deviceScaleFactor: 2 })
  await page.goto('file:///' + (out + '/hero-frames.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' })
  await page.screenshot({ path: out + '/hero-frames.png', fullPage: true })
  await browser.close()
  console.log('效果图: ' + out + '/hero-frames.png')
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
