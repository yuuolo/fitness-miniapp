// 效果图：点小人 → 跑步跑掉 → 换动作从左边回来
const fs = require('fs')
const puppeteer = require('puppeteer-core')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const mod = require(MP + '/utils/hero-anim.js')
const uri = (key, phase) => mod.figureUri(key, 'male', phase)

const stage = (poseKey, phase, offsetPct, opacity, label) => `
  <div class="stage">
    <div class="banner">
      <div class="hello">你好，雷阵雨</div>
      <div class="sub">今天也要动起来</div>
      <div class="fig" style="background-image:url('${uri(poseKey, phase)}');
        transform: translateX(${offsetPct}%); opacity:${opacity}"></div>
    </div>
    <div class="cap">${label}</div>
  </div>`

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 430px; background: #f7f4f1; padding: 16px; font: 13px/1.5 -apple-system,"Microsoft YaHei",sans-serif; }
  h1 { font-size: 15px; margin-bottom: 2px; }
  .lead { font-size: 12px; color: #9c948c; margin-bottom: 12px; }
  .banner { position: relative; overflow: hidden; border-radius: 16px; padding: 18px 108px 18px 18px;
    background: linear-gradient(135deg, #f0703f, #e9603a); color: #fff;
    box-shadow: 0 8px 24px rgba(233,96,58,.22); height: 74px; }
  .hello { font-size: 19px; font-weight: 600; }
  .sub { font-size: 12px; opacity: .93; margin-top: 4px; }
  .fig { position: absolute; right: 12px; top: 50%; width: 78px; height: 78px; margin-top: -39px;
    background-repeat: no-repeat; background-position: center; background-size: contain;
    transition: transform .9s, opacity .9s; }
  .cap { font-size: 11.5px; color: #9c948c; text-align: center; margin: 6px 0 14px; }
</style></head><body>
  <h1>点一下运动小人</h1>
  <div class="lead">1 秒内往右跑掉（配「嗖」的音效），然后换个动作从左边跑回来（「啵」）</div>
  ${stage('curl', 0.2, 0, 1, '① 默认：举哑铃（每天一个动作）')}
  ${stage('run', 0.3, 40, 0.75, '② 点一下：切成跑步，向右跑出（0.9 秒 + 嗖）')}
  ${stage('run', 0.7, 120, 0, '③ 跑出画面')}
  ${stage('squat', 0.5, -120, 0, '④ 换动作，从左侧画面外准备进入')}
  ${stage('squat', 0.5, 0, 1, '⑤ 滑回原位：新的动作（啵）')}
</body></html>`

const out = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
fs.writeFileSync(out + '/tap-figure.html', html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 430, height: 800, deviceScaleFactor: 3 })
  await page.goto('file:///' + (out + '/tap-figure.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' })
  await page.screenshot({ path: out + '/tap-figure.png', fullPage: true })
  await browser.close()
  console.log('效果图: ' + out + '/tap-figure.png')
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
