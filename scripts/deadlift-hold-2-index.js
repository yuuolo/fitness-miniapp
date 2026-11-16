// index.js：每帧按当前动作的循环时长算相位
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/index/index.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

// 1. 去掉固定 PERIOD
const oldPeriod = `      const PERIOD = 2200
      this.heroAnimOn = true`
if (t.includes(oldPeriod)) {
  t = t.replace(oldPeriod, `      // 每个动作可以有自己的循环时长（硬拉要留出顶部停顿）
      const periodOf = () => (heroAnim.cycleOf ? heroAnim.cycleOf(this.data.heroPoseKey) : 2200)
      this.heroAnimOn = true`)
  done.push('去掉固定 PERIOD')
} else {
  console.log('⚠ 未匹配 PERIOD')
}

// 2. rAF 循环里按当前动作取周期
const oldRaf = `        const phase = ((ts - start) % PERIOD) / PERIOD`
if (t.includes(oldRaf)) {
  t = t.replace(oldRaf, `        const period = periodOf()
        const phase = ((ts - start) % period) / period`)
  done.push('rAF 按动作时长算相位')
} else {
  console.log('⚠ 未匹配 rAF 相位')
}

// 3. 定时器兜底同理
const oldTimer = `          heroAnim.drawCanvas(ctx, poseKey, gender, ((ts - start) % PERIOD) / PERIOD, size, dpr)`
if (t.includes(oldTimer)) {
  t = t.replace(oldTimer, `          const period = periodOf()
          heroAnim.drawCanvas(ctx, this.data.heroPoseKey, gender, ((ts - start) % period) / period, size, dpr)`)
  done.push('兜底定时器按动作时长算相位')
} else {
  console.log('⚠ 未匹配兜底定时器')
}

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))

require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')
