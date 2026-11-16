// 效果图：不同会员今天各自的动作不同
const fs = require('fs')
const puppeteer = require('puppeteer-core')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const mod = require(MP + '/utils/hero-anim.js')

const DAY = '2026-11-16'
const MEMBERS = [
  { name: '雷阵雨', id: 'o5bjc4qI1ME8eNUtWE09sLqOE4aE', gender: 'male' },
  { name: 'Yu', id: 'o5bjc4jdaajzZZs582B7ao6qUagM', gender: 'female' },
  { name: '小菜菜', id: 'o5bjc4oPISG_OF_uYwAtHx4n9JJ0', gender: 'female' },
  { name: 'A 核心力量训练师', id: 'o5bjc4pPJztbTnM4yPQYhxfJnN6Q', gender: 'male' }
]

const rows = MEMBERS.map(m => {
  const pose = mod.poseOfDay(m.id, DAY)
  const uri = mod.figureUri(pose.key, m.gender, 0.35)
  return `
  <div class="banner">
    <div class="left">
      <div class="hello">你好，${m.name}</div>
      <div class="sub">今天也要动起来 · ${pose.name}</div>
    </div>
    <div class="fig" style="background-image:url('${uri}')"></div>
  </div>`
}).join('')

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 460px; background: #f7f4f1; padding: 16px; font: 14px/1.5 -apple-system,"Microsoft YaHei",sans-serif; }
  h1 { font-size: 15px; margin-bottom: 2px; }
  .lead { font-size: 12px; color: #9c948c; margin-bottom: 12px; }
  .banner { position: relative; border-radius: 16px; padding: 18px 108px 18px 18px; margin-bottom: 10px;
    background: linear-gradient(135deg, #f0703f, #e9603a); color: #fff;
    box-shadow: 0 8px 24px rgba(233,96,58,.22); }
  .hello { font-size: 19px; font-weight: 600; }
  .sub { font-size: 12px; opacity: .93; margin-top: 4px; }
  .fig { position: absolute; right: 12px; top: 50%; width: 82px; height: 82px; margin-top: -41px;
    background-repeat: no-repeat; background-position: center; background-size: contain; }
</style></head><body>
  <h1>同一个首页，不同会员看到的动作不一样</h1>
  <div class="lead">动作 = 散列(会员 openid + 日期)，一天一个，各人不同</div>
  ${rows}
</body></html>`

const out = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
fs.writeFileSync(out + '/hero-per-user.html', html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 460, height: 560, deviceScaleFactor: 3 })
  await page.goto('file:///' + (out + '/hero-per-user.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' })
  await page.screenshot({ path: out + '/hero-per-user.png', fullPage: true })
  await browser.close()
  console.log(MEMBERS.map(m => m.name + ' → ' + mod.poseOfDay(m.id, DAY).name).join('\n'))
  console.log('效果图: ' + out + '/hero-per-user.png')
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
