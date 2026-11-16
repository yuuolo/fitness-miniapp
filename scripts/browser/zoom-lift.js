// 放大看举重的 4 个关键相位 + 打印几何数值
const fs = require('fs')
const puppeteer = require('puppeteer-core')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const mod = require(MP + '/utils/hero-anim.js')

// 抓取 lift 绘制出的图元，验证横杆高度
function probe(poseKey, phase) {
  const lines = []
  const be = {
    line: (x1, y1, x2, y2, w) => lines.push({ t: 'line', x1, y1, x2, y2, w }),
    poly: () => lines.push({ t: 'poly' }),
    circle: (cx, cy, r) => lines.push({ t: 'circle', cx, cy, r }),
    rect: (x, y, w, h) => lines.push({ t: 'rect', x, y, w, h }),
    path: () => lines.push({ t: 'path' })
  }
  mod.paint(be, poseKey, 'male', phase)
  const bar = lines.find(l => l.t === 'line' && Math.abs(l.y1 - l.y2) < 0.01 && Math.abs(l.x2 - l.x1) > 60)
  const head = lines.find(l => l.t === 'circle')
  return { phase, barY: bar ? bar.y1 : null, barX: bar ? [bar.x1, bar.x2] : null, head }
}

const PH = [0, 0.25, 0.5, 0.75]
PH.forEach(p => console.log(JSON.stringify(probe('lift', p))))

const cells = PH.map(p => `
  <div class="cell"><div class="fig" style="background-image:url('${mod.figureUri('lift', 'male', p)}')"></div>
  <div class="lb">phase ${p}</div></div>`).join('')

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 760px; background: #f7f4f1; padding: 12px; font: 12px/1.4 -apple-system,"Microsoft YaHei",sans-serif; }
  .row { display: flex; gap: 10px; }
  .cell { flex: 1; text-align: center; }
  .fig { width: 100%; height: 320px; border-radius: 12px; background-color: #e8632f;
    background-repeat: no-repeat; background-position: center; background-size: contain; }
  .lb { color: #9c948c; margin-top: 4px; }
</style></head><body><div class="row">${cells}</div></body></html>`

const out = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
fs.writeFileSync(out + '/hero-lift-zoom.html', html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 760, height: 420, deviceScaleFactor: 2 })
  await page.goto('file:///' + (out + '/hero-lift-zoom.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' })
  await page.screenshot({ path: out + '/hero-lift-zoom.png', fullPage: true })
  await browser.close()
  console.log('效果图: ' + out + '/hero-lift-zoom.png')
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
