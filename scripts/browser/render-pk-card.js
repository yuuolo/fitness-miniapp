// 生成「和我 PK」卡片效果图
const fs = require('fs')
const puppeteer = require('puppeteer-core')

const ME = { nick: '雷阵雨', score: 68, weight: 80, bodyFat: 22, muscle: 36, skeletal: 32, visceral: 8, bmi: 26.1, date: '2026-11-12' }
const TA = { nick: '小菜菜', score: 84, weight: 57.7, bodyFat: 26.4, muscle: 40.1, skeletal: 22.5, visceral: 7, bmi: 23.1, date: '2026-11-10' }

const METRICS = [
  { key: 'weight', name: '体重', unit: 'kg', dir: 'none', a: 80, b: 57.7 },
  { key: 'bodyFat', name: '体脂率', unit: '%', dir: 'low', a: 22, b: 26.4 },
  { key: 'muscle', name: '肌肉量', unit: 'kg', dir: 'high', a: 36, b: 40.1 },
  { key: 'skeletal', name: '骨骼肌量', unit: 'kg', dir: 'high', a: 32, b: 22.5 },
  { key: 'visceral', name: '内脏脂肪', unit: '级', dir: 'low', a: 8, b: 7 },
  { key: 'bmi', name: 'BMI', unit: '', dir: 'none', a: 26.1, b: 23.1 },
  { key: 'score', name: '身体评分', unit: '分', dir: 'high', a: 68, b: 84 }
]

const round1 = n => Math.round(n * 10) / 10
let myWins = 0
let theirWins = 0
const rows = METRICS.map(m => {
  const diff = round1(m.b - m.a)
  let win = ''
  if (m.dir === 'high') win = diff > 0.05 ? 'them' : (diff < -0.05 ? 'me' : 'tie')
  if (m.dir === 'low') win = diff < -0.05 ? 'them' : (diff > 0.05 ? 'me' : 'tie')
  if (win === 'me') myWins++
  if (win === 'them') theirWins++
  const diffText = m.dir === 'none'
    ? (diff === 0 ? '一样' : (diff > 0 ? 'TA 多 ' + Math.abs(diff) : '我多 ' + Math.abs(diff)))
    : (win === 'tie' ? '持平' : (win === 'me' ? '我胜 ' + Math.abs(diff) : 'TA 胜 ' + Math.abs(diff)))
  return Object.assign({}, m, { diffText, win })
})
const scoreGap = TA.score - ME.score

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 400px; background: #f7f4f1; padding: 18px; font: 14px/1.5 -apple-system,"Microsoft YaHei",sans-serif; }
  .card { background: #fff; border-radius: 14px; padding: 16px; box-shadow: 0 2px 10px rgba(35,32,29,.06); }
  .between { display: flex; align-items: center; justify-content: space-between; }
  .title { font-size: 16px; font-weight: 600; color: #23201d; }
  .muted { font-size: 12px; color: #9c948c; }
  .pk-score { display: flex; align-items: center; margin-top: 12px; }
  .pk-side { flex: 1; text-align: center; padding: 8px 0; border-radius: 10px; }
  .pk-side.win { background: #fdf0ea; }
  .pk-who { font-size: 12px; color: #9c948c; }
  .pk-side.win .pk-who { color: #cf4f2b; }
  .pk-num { font-size: 30px; font-weight: 600; color: #23201d; }
  .pk-side.win .pk-num { color: #e9603a; }
  .pk-vs { width: 90px; text-align: center; }
  .pk-vs-t { font-size: 14px; font-weight: 600; color: #9c948c; }
  .pk-vs-d { display: block; font-size: 11px; color: #cf4f2b; }
  .pk-rows { margin-top: 12px; border-top: 1px solid #f5f0ea; }
  .pk-row { display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #f5f0ea; }
  .pk-row:last-child { border-bottom: none; }
  .pk-name { width: 78px; color: #6b645c; font-size: 13px; }
  .pk-val { width: 62px; text-align: center; font-size: 14px; color: #23201d; }
  .pk-val.better { color: #e9603a; font-weight: 600; }
  .pk-diff { flex: 1; text-align: center; font-size: 11px; color: #9c948c; }
  .pk-diff.me { color: #e9603a; }
  .pk-diff.them { color: #e2685f; }
  .note { font-size: 11px; color: #9c948c; margin-top: 8px; }
</style></head><body>
  <div class="card">
    <div class="between">
      <span class="title">和我 PK</span>
      <span class="muted">我 ${myWins} 胜 · TA ${theirWins} 胜</span>
    </div>
    <div class="pk-score">
      <div class="pk-side${scoreGap < 0 ? ' win' : ''}"><div class="pk-who">我</div><div class="pk-num">${ME.score}</div></div>
      <div class="pk-vs"><span class="pk-vs-t">VS</span><span class="pk-vs-d">${scoreGap === 0 ? '平分' : (scoreGap > 0 ? 'TA 高 ' + scoreGap + ' 分' : '我高 ' + (-scoreGap) + ' 分')}</span></div>
      <div class="pk-side${scoreGap > 0 ? ' win' : ''}"><div class="pk-who">${TA.nick}</div><div class="pk-num">${TA.score}</div></div>
    </div>
    <div class="pk-rows">
      ${rows.map(r => `<div class="pk-row">
        <span class="pk-name">${r.name}</span>
        <span class="pk-val${r.win === 'me' ? ' better' : ''}">${r.a}${r.unit}</span>
        <span class="pk-diff ${r.win === 'me' ? 'me' : (r.win === 'them' ? 'them' : '')}">${r.diffText}</span>
        <span class="pk-val${r.win === 'them' ? ' better' : ''}">${r.b}${r.unit}</span>
      </div>`).join('')}
    </div>
    <div class="note">我 ${ME.date} 测量 · TA ${TA.date} 测量</div>
    <div class="note">体脂率、内脏脂肪越低越好；肌肉量、骨骼肌、身体评分越高越好；体重和 BMI 只比差值。</div>
  </div>
</body></html>`

const out = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
fs.writeFileSync(out + '/pk-card.html', html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 400, height: 640, deviceScaleFactor: 3 })
  await page.goto('file:///' + (out + '/pk-card.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' })
  await page.screenshot({ path: out + '/pk-card.png', fullPage: true })
  await browser.close()
  console.log('PK 效果图: ' + out + '/pk-card.png')
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
