// 验证硬拉停顿：打印整周期的 k 曲线与各阶段时长
const fs = require('fs')
const puppeteer = require('puppeteer-core')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const mod = require(MP + '/utils/hero-anim.js')

const CYCLE = mod.cycleOf('deadlift')
const steps = 40
const rows = []
for (let i = 0; i <= steps; i++) {
  const phase = i / steps
  const ms = Math.round(phase * CYCLE)
  // 用 paint 反推：记录手（杠铃）的 y 坐标
  const ys = []
  const be = {
    line: (x1, y1, x2, y2, w) => { if (Math.abs(y1 - y2) < 0.01 && Math.abs(x2 - x1) > 60) ys.push(y1) },
    poly: () => {}, circle: () => {}, rect: () => {}, path: () => {}
  }
  mod.paint(be, 'deadlift', 'male', phase)
  rows.push({ phase: phase.toFixed(3), ms, barY: ys.length ? Number(ys[0].toFixed(1)) : null })
}

// 找出「杠铃位置不变」的区间 = 停顿
let holdStart = null, holdEnd = null
for (let i = 1; i < rows.length; i++) {
  if (rows[i].barY === rows[i - 1].barY) {
    if (holdStart === null) holdStart = i - 1
    holdEnd = i
  }
}
const holdMs = holdStart !== null ? rows[holdEnd].ms - rows[holdStart].ms : 0
console.log('循环时长: ' + CYCLE + 'ms')
console.log('停顿区间: phase ' + rows[holdStart].phase + ' → ' + rows[holdEnd].phase +
  '（' + rows[holdStart].ms + 'ms → ' + rows[holdEnd].ms + 'ms，约 ' + holdMs + 'ms）')
console.log('停顿高度（杠铃 y）: ' + rows[holdStart].barY)

const top = rows[holdStart].barY
const bottom = Math.max(...rows.map(r => r.barY))
console.log('最低点 y=' + bottom + '，最高点 y=' + top + '，行程 ' + (bottom - top).toFixed(1))

// 关键相位
console.log('\n相位采样：')
;[0, 0.17, 0.34, 0.5, 0.66, 0.83, 1].forEach(p => {
  const r = rows[Math.round(p * steps)]
  console.log('  phase ' + r.phase + ' (' + r.ms + 'ms) 杠铃 y=' + r.barY)
})

// 渲染停顿前后的帧，肉眼看是否停住
const phases = [0, 0.2, 0.34, 0.4, 0.5, 0.6, 0.66, 0.8]
const cells = phases.map(p => `
  <div class="cell"><div class="fig" style="background-image:url('${mod.figureUri('deadlift', 'male', p)}')"></div>
  <div class="lb">${Math.round(p * CYCLE)}ms</div></div>`).join('')

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 1100px; background: #f7f4f1; padding: 12px; font: 12px/1.4 -apple-system,"Microsoft YaHei",sans-serif; }
  .row { display: flex; gap: 8px; }
  .cell { flex: 1; text-align: center; }
  .fig { width: 100%; height: 210px; border-radius: 12px; background-color: #e8632f;
    background-repeat: no-repeat; background-position: center; background-size: contain; }
  .lb { color: #9c948c; margin-top: 4px; }
</style></head><body><div class="row">${cells}</div></body></html>`

const out = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
fs.writeFileSync(out + '/deadlift-hold.html', html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1100, height: 300, deviceScaleFactor: 2 })
  await page.goto('file:///' + (out + '/deadlift-hold.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' })
  await page.screenshot({ path: out + '/deadlift-hold.png', fullPage: true })
  await browser.close()
  console.log('\n效果图: ' + out + '/deadlift-hold.png')
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
