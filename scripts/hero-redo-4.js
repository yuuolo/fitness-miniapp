// 1) 举重：宽距 + 横杆画成一整根（压在身体上层，像在身前往上推）
// 2) 跑步：后腿屈膝更大、小腿翘更高
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/utils/hero-anim.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

// ---------- 举重 ----------
const startLift = t.indexOf("  {\n    key: 'lift'")
const endLift = t.indexOf("  {\n    key: 'squat'")

const newLift = `  {
    key: 'lift',
    name: '举重',
    // 正面宽距过顶推举：两手在头部两侧外，横杆是一整根（画在身体上层）
    custom(be, gender, phase) {
      const k = upDown(phase)                 // 0 = 胸前，1 = 头顶锁定
      const dip = 1 - k

      const headX = 60
      const headY = 31 + 1.2 * dip
      const shoulderY = 45 + 1.2 * dip
      const hipY = 65 + 2 * dip
      const narrow = gender === 'female' ? 1.5 : 0

      // 宽距：手比肩宽，落在头部两侧之外
      const handX1 = 42 - 1 * k
      const handX2 = 78 + 1 * k
      const handY = 46 - 32 * k

      const sl = [headX - 7 + narrow, shoulderY]
      const sr = [headX + 7 - narrow, shoulderY]
      const left = [handX1, handY]
      const right = [handX2, handY]

      // ---- 先画身体 ----
      be.circle(headX, headY, 8)
      be.poly([[headX, headY + 8], [headX, shoulderY]])
      be.poly([[headX - 7, shoulderY], [headX + 7, shoulderY]])
      be.poly([[headX, shoulderY], [headX, hipY]])
      be.poly([[headX - narrow, hipY], [headX - 9, 84], [headX - 11, 102]])
      be.poly([[headX + narrow, hipY], [headX + 9, 84], [headX + 11, 102]])
      be.line(headX - 13, 104, headX - 6, 104, 0.9)
      be.line(headX + 6, 104, headX + 13, 104, 0.9)

      // 手臂：宽距，肘朝外下方
      const el = ik2(sl[0], sl[1], left[0], left[1], 15, 15, true)
      const er = ik2(sr[0], sr[1], right[0], right[1], 15, 15, false)
      be.poly([sl, el, left])
      be.poly([sr, er, right])

      // ---- 再画杠铃：一整根，压在手臂与身体之上 ----
      be.line(26, handY, 94, handY, 1.15)
      be.rect(26, handY - 10, 7, 20)
      be.rect(87, handY - 10, 7, 20)

      // 女性：头发（画在杠铃之后，避免被杆压住脸）
      if (gender === 'female') {
        const cy = headY
        be.path(\`M\${headX - 7.6} \${cy + 0.5} A 7.8 7.8 0 0 1 \${headX + 7.6} \${cy + 0.5}\`)
        be.path(\`M\${headX + 7} \${cy + 1} q7 4 3.5 11\`)
      }
    }
  },
`
t = t.slice(0, startLift) + newLift + t.slice(endLift)
done.push('举重：宽距 + 整根横杆')

// ---------- 跑步：后腿屈膝更大 ----------
const startRun = t.indexOf("  {\n    key: 'run'")
const endRun = t.indexOf("  {\n    key: 'pullup'")
const oldRun = t.slice(startRun, endRun)

let newRun = oldRun
// 屈膝峰值移到「脚离地之后」，让后面的腿明显勾起小腿
newRun = newRun.replace(
  `      const flexR = 0.08 + 1.35 * clamp01(Math.cos(phi - 1.25))
      const thighL = 0.85 * Math.sin(phi + Math.PI)
      const flexL = 0.08 + 1.35 * clamp01(Math.cos(phi + Math.PI - 1.25))`,
  `      // 屈膝峰值放在「蹬地之后」，后腿小腿明显向上翘
      const flexR = 0.12 + 1.85 * clamp01(Math.cos(phi - 5.75))
      const thighL = 0.85 * Math.sin(phi + Math.PI)
      const flexL = 0.12 + 1.85 * clamp01(Math.cos(phi + Math.PI - 5.75))`
)

// 脚掌在屈膝大时朝后上方翘（跟着小腿方向）
newRun = newRun.replace(
  `        const toe = [ankle[0] + 7 * Math.cos(shinA * 0.4 + 0.5), ankle[1] + 3]`,
  `        const toe = [ankle[0] + 7 * Math.cos(shinA * 0.4 + 0.5), ankle[1] + 3 - 2 * clamp01(flex - 0.9)]`
)

t = t.slice(0, startRun) + newRun + t.slice(endRun)
done.push('跑步：后腿屈膝加大、小腿翘高')

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')
