// 把音效接到点击小人上
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/index/index.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

// require
if (!t.includes("require('../../utils/sfx')")) {
  t = t.replace(
    "const heroAnim = require('../../utils/hero-anim')",
    "const heroAnim = require('../../utils/hero-anim')\nconst sfx = require('../../utils/sfx')"
  )
  done.push('引入 sfx')
}

// 跑掉时放「嗖」
t = t.replace(
  `    // 1) 变成跑步姿势，同时容器往右滑出（0.9s）
    this.setData({ heroPoseKey: 'run', heroPoseName: '跑步', figureState: 'run' })`,
  `    // 1) 变成跑步姿势，同时容器往右滑出（0.9s）
    sfx.playRunAway()
    this.setData({ heroPoseKey: 'run', heroPoseName: '跑步', figureState: 'run' })`
)
done.push('跑掉时放音效')

// 重新出现时放「啵」
t = t.replace(
  `      this.figureTimers.push(setTimeout(() => {
        // 3) 从左边滑回原位
        this.setData({ figureState: '' })`,
  `      this.figureTimers.push(setTimeout(() => {
        // 3) 从左边滑回原位，配一声「啵」
        sfx.playAppear()
        this.setData({ figureState: '' })`
)
done.push('出现时放音效')

fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))

require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('  ✓ 语法通过')
