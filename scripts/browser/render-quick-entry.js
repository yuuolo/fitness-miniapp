// 生成快捷入口效果图：六边形能力图 + 友圈视频缩略图
const fs = require('fs')
const puppeteer = require('puppeteer-core')

const src = fs.readFileSync('C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/index/index.js', 'utf8')
const start = src.indexOf('const B64CHARS')
const end = src.indexOf('Page({')
const api = new Function(src.slice(start, end) + '\nreturn { radarValues, radarSvg }')()

const values = api.radarValues({
  latestBody: { weight: 80, bodyFat: 22, muscleRate: 45, score: 68 },
  bestLift: { bench: 80, squat: 110, deadlift: 130 }
})
const radarUri = api.radarSvg(values)
const score = Math.round(values[values.length - 1].value)

// 用线上真实的两个视频封面
const THUMBS = [
  'https://gym.novrein.com/api/media/8d5a4bc53f9e6d4721f7c94035a32a3f',
  'https://gym.novrein.com/api/media/213092ac37cc92650995343794ccee17'
]

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f7f4f1; padding: 22px; font: 14px/1.5 -apple-system, "Microsoft YaHei", sans-serif; width: 480px; }
  h1 { font-size: 15px; color: #23201d; margin-bottom: 4px; }
  .lead { font-size: 12px; color: #9c948c; margin-bottom: 14px; }
  .quick { display: flex; }
  .q {
    flex: 1; background: #fff; border-radius: 14px; padding: 14px;
    box-shadow: 0 2px 10px rgba(35,32,29,.06);
    display: flex; flex-direction: column; align-items: center;
  }
  .q + .q { margin-left: 12px; }
  .radar {
    width: 90px; height: 90px; margin: 6px 0 10px;
    background-repeat: no-repeat; background-position: center; background-size: contain;
  }
  .thumbs { display: flex; gap: 6px; height: 90px; width: 100%; margin: 6px 0 10px; }
  .thumb-wrap { flex: 1; position: relative; border-radius: 8px; overflow: hidden; background: #f4efea; }
  .thumb { width: 100%; height: 100%; object-fit: cover; display: block; }
  .play {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
    width: 22px; height: 22px; border-radius: 50%; background: rgba(0,0,0,.45);
    color: #fff; font-size: 11px; line-height: 22px; text-align: center;
  }
  .t { font-size: 15px; font-weight: 600; color: #23201d; }
  .d { font-size: 12px; color: #9c948c; }
</style></head><body>
  <h1>首页快捷入口</h1>
  <div class="lead">左：排行榜显示六边形能力图（真实数据算出）· 右：友圈显示最近两条视频缩略图</div>
  <div class="quick">
    <div class="q">
      <div class="radar" style="background-image:url('${radarUri}')"></div>
      <div class="t">排行榜</div>
      <div class="d">综合能力 ${score}</div>
    </div>
    <div class="q">
      <div class="thumbs">
        ${THUMBS.map(u => `<div class="thumb-wrap"><img class="thumb" src="${u}"><div class="play">▶</div></div>`).join('')}
      </div>
      <div class="t">健身友圈</div>
      <div class="d">晒训练日常</div>
    </div>
  </div>
</body></html>`

const out = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
fs.writeFileSync(out + '/quick-entry.html', html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 480, height: 240, deviceScaleFactor: 3 })
  await page.goto('file:///' + (out + '/quick-entry.html').replace(/\\/g, '/'), { waitUntil: 'networkidle2', timeout: 30000 })
  await new Promise(r => setTimeout(r, 1500))
  await page.screenshot({ path: out + '/quick-entry.png', fullPage: true })
  await browser.close()
  console.log('效果图: ' + out + '/quick-entry.png')
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
