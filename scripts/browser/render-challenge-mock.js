// 挑战功能界面草图：大厅 / 详情 / 结算
const fs = require('fs')
const puppeteer = require('puppeteer-core')

const AVATAR = 'https://gym.novrein.com/api/media/2e8c8840814e88beba149b818a8f2e60'

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #e9e4de; padding: 18px; font: 13px/1.5 -apple-system,"Microsoft YaHei",sans-serif; color: #23201d;
    display: flex; gap: 16px; align-items: flex-start; }
  .phone { width: 300px; background: #f7f4f1; border-radius: 22px; padding: 14px; box-shadow: 0 10px 30px rgba(35,32,29,.15); }
  .nav { text-align: center; font-size: 15px; font-weight: 600; padding: 4px 0 12px; }
  .tabs { display: flex; gap: 6px; margin-bottom: 10px; }
  .tab { flex: 1; text-align: center; font-size: 11.5px; padding: 6px 0; border-radius: 999px; background: #fff; color: #6b645c; }
  .tab.on { background: #e9603a; color: #fff; font-weight: 600; }
  .card { background: #fff; border-radius: 14px; padding: 12px; margin-bottom: 10px; box-shadow: 0 2px 10px rgba(35,32,29,.06); }
  .row { display: flex; align-items: center; gap: 8px; }
  .grow { flex: 1; }
  .av { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; background: #f4efea; flex: none; }
  .t { font-size: 13.5px; font-weight: 600; }
  .muted { font-size: 11.5px; color: #9c948c; }
  .tag { font-size: 10px; padding: 1px 7px; border-radius: 999px; background: #fdf0ea; color: #cf4f2b; }
  .tag.gray { background: #f4efea; color: #6b645c; }
  .trash { font-size: 12px; color: #6b645c; background: #f7f4f1; border-radius: 8px; padding: 6px 9px; margin: 8px 0; }
  .btns { display: flex; gap: 8px; margin-top: 8px; }
  .btn { flex: 1; text-align: center; padding: 8px; border-radius: 999px; font-size: 12.5px; }
  .btn.primary { background: #e9603a; color: #fff; font-weight: 600; }
  .btn.ghost { background: #f4efea; color: #6b645c; }
  .vs { display: flex; align-items: center; gap: 10px; margin: 8px 0 2px; }
  .side { flex: 1; text-align: center; }
  .side .n { font-size: 12px; color: #6b645c; margin-top: 3px; }
  .side .v { font-size: 20px; font-weight: 600; }
  .side.win .v { color: #e9603a; }
  .middle { font-size: 12px; color: #9c948c; font-weight: 600; }
  .bar { flex: 1; height: 6px; border-radius: 999px; background: #f4efea; overflow: hidden; margin-top: 4px; }
  .fill { height: 100%; background: #e9603a; border-radius: 999px; }
  .countdown { text-align: center; font-size: 11.5px; color: #cf4f2b; margin: 10px 0 4px; }
  .badge { display: inline-block; font-size: 10px; padding: 2px 7px; border-radius: 999px; background: #fdf0ea; color: #cf4f2b; margin: 2px 3px 0 0; }
  .big { font-size: 22px; font-weight: 700; text-align: center; margin: 6px 0; }
  .cap { font-size: 11px; color: #9c948c; text-align: center; margin-top: 8px; }
</style></head><body>

  <!-- 1. 挑战大厅 -->
  <div class="phone">
    <div class="nav">挑战</div>
    <div class="tabs">
      <div class="tab on">收到的 2</div><div class="tab">进行中 1</div><div class="tab">我发起</div><div class="tab">历史</div>
    </div>

    <div class="card">
      <div class="row">
        <img class="av" src="${AVATAR}">
        <div class="grow">
          <div class="t">Yu 向你发起挑战</div>
          <div class="muted">卧推 · 比绝对成绩</div>
        </div>
        <span class="tag">剩余 47:12</span>
      </div>
      <div class="trash">「你的卧推还差得远」</div>
      <div class="btns"><div class="btn ghost">拒绝</div><div class="btn primary">应战</div></div>
    </div>

    <div class="card">
      <div class="row">
        <img class="av" src="${AVATAR}">
        <div class="grow">
          <div class="t">小菜菜 向你发起挑战</div>
          <div class="muted">深蹲 · 比相对体重</div>
        </div>
        <span class="tag">剩余 65:40</span>
      </div>
      <div class="btns"><div class="btn ghost">拒绝</div><div class="btn primary">应战</div></div>
    </div>

    <div class="card">
      <div class="row">
        <div class="grow">
          <div class="t">我在等 Yu 应战</div>
          <div class="muted">引体向上 · 比次数</div>
        </div>
        <span class="tag gray">待应战</span>
      </div>
    </div>
    <div class="cap">挑战大厅：收到的挑战在最上面，有红点提示</div>
  </div>

  <!-- 2. 挑战详情 -->
  <div class="phone">
    <div class="nav">卧推 · 绝对成绩</div>
    <div class="card">
      <div class="vs">
        <div class="side">
          <img class="av" style="width:34px;height:34px" src="${AVATAR}">
          <div class="n">Yu</div>
          <div class="v">75.0 kg</div>
          <div class="bar"><div class="fill" style="width:100%"></div></div>
        </div>
        <div class="middle">VS</div>
        <div class="side">
          <img class="av" style="width:34px;height:34px" src="${AVATAR}">
          <div class="n">我</div>
          <div class="v">50.7 kg</div>
          <div class="bar"><div class="fill" style="width:67%"></div></div>
        </div>
      </div>
      <div class="countdown">距离提交截止 00:32:11</div>
      <div class="btns"><div class="btn primary">用我的最好成绩提交</div></div>
      <div class="btns"><div class="btn ghost">请教练现场录入</div></div>
    </div>

    <div class="card">
      <div class="muted">规则</div>
      <div style="font-size:12px;color:#6b645c;margin-top:4px">
        比赛项目：卧推（估算 1RM）<br>
        比法：绝对成绩，高者胜<br>
        成绩来源：历史最好成绩或教练现场录入
      </div>
    </div>

    <div class="card">
      <div class="row"><div class="grow"><div class="t">我的战绩</div>
        <div class="muted">胜 5 · 负 1 · 胜率 83%</div></div>
        <span class="tag">连胜 3</span>
      </div>
      <div style="margin-top:6px">
        <span class="badge">首胜</span><span class="badge">三连</span><span class="badge">以下克上</span>
      </div>
    </div>
    <div class="cap">详情页：比分、倒计时、两种提交方式</div>
  </div>

  <!-- 3. 结算 -->
  <div class="phone">
    <div class="nav">挑战结果</div>
    <div class="card">
      <div class="big">🏆 你赢了</div>
      <div class="muted" style="text-align:center">卧推 · 绝对成绩</div>
      <div class="vs">
        <div class="side win">
          <div class="n">我</div>
          <div class="v">75.0 kg</div>
        </div>
        <div class="middle">VS</div>
        <div class="side">
          <div class="n">小菜菜</div>
          <div class="v">50.7 kg</div>
        </div>
      </div>
      <div class="countdown">连胜 3 · 本周 5 胜 1 负</div>
      <div class="btns"><div class="btn primary">发到友圈炫耀</div></div>
      <div class="btns"><div class="btn ghost">再来一场</div></div>
    </div>

    <div class="card">
      <div class="muted">这场胜利让我的身体评分</div>
      <div class="row" style="margin-top:4px">
        <div class="grow"><div class="t">50 → 55 分</div>
          <div class="muted">相对力量 40/40（三项齐全）</div></div>
        <span class="tag">+5</span>
      </div>
    </div>
    <div class="cap">结算页：结果、战绩、一键发友圈；成绩同时进排行榜和评分</div>
  </div>

</body></html>`

const out = 'C:/Users/yuuolo/Documents/deepseek/.dsh-tools/ui-preview'
fs.writeFileSync(out + '/challenge-mock.html', html)

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--ignore-certificate-errors']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 980, height: 560, deviceScaleFactor: 3 })
  await page.goto('file:///' + (out + '/challenge-mock.html').replace(/\\/g, '/'), { waitUntil: 'networkidle2', timeout: 40000 })
  await new Promise(r => setTimeout(r, 1200))
  await page.screenshot({ path: out + '/challenge-mock.png', fullPage: true })
  await browser.close()
  console.log('效果图: ' + out + '/challenge-mock.png')
})().catch(e => { console.error('失败:', e.message); process.exit(1) })
