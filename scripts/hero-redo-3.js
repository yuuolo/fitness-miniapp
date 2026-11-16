// 跑步加大动态：步幅、抬腿、前倾、起伏，并让脚真正离地
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/utils/hero-anim.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const start = t.indexOf("  {\n    key: 'run'")
const end = t.indexOf("  {\n    key: 'pullup'")

const newRun = `  {
    key: 'run',
    name: '跑步',
    // 侧视图跑步：大步幅 + 高抬腿 + 前倾 + 起伏 + 对侧摆臂
    custom(be, gender, phase) {
      const phi = phase * Math.PI * 2
      // 双脚离地的腾空期身体最高，支撑中期最低
      const bob = 4.2 * Math.abs(Math.cos(phi))
      const hip = [52, 53 + bob]
      const shoulder = [61, 36 + bob]
      const head = [66, 24 + bob]

      const THIGH = 21
      const SHIN = 20

      const leg = (thighA, flex) => {
        const knee = [hip[0] + Math.sin(thighA) * THIGH, hip[1] + Math.cos(thighA) * THIGH]
        const shinA = thighA - flex
        const ankle = [knee[0] + Math.sin(shinA) * SHIN, knee[1] + Math.cos(shinA) * SHIN]
        // 脚掌：朝脚尖方向，摆动腿脚尖略微下垂
        const toe = [ankle[0] + 7 * Math.cos(shinA * 0.4 + 0.5), ankle[1] + 3]
        return { knee, ankle, toe }
      }

      // 右腿相位 phi，左腿反相
      const thighR = 0.85 * Math.sin(phi)
      const flexR = 0.08 + 1.35 * clamp01(Math.cos(phi - 1.25))
      const thighL = 0.85 * Math.sin(phi + Math.PI)
      const flexL = 0.08 + 1.35 * clamp01(Math.cos(phi + Math.PI - 1.25))

      const r = leg(thighR, flexR)
      const l = leg(thighL, flexL)

      // 地面
      be.line(20, 104, 104, 104, 0.5)

      // 远侧腿（细一些，拉开前后层次）
      be.poly([hip, l.knee, l.ankle], 0.8)
      be.line(l.ankle[0], l.ankle[1], l.toe[0], l.toe[1], 0.65)

      // 身体（前倾）
      be.circle(head[0], head[1], 8)
      be.poly([[head[0] - 1, head[1] + 8], [shoulder[0], shoulder[1]]])
      be.poly([shoulder, hip])

      // 近侧腿
      be.poly([hip, r.knee, r.ankle], 1)
      be.line(r.ankle[0], r.ankle[1], r.toe[0], r.toe[1], 0.9)

      // 手臂：与同侧腿反相，肘弯约 90°，前后摆
      const arm = (side, width) => {
        const swing = -0.8 * Math.sin(phi + (side > 0 ? 0 : Math.PI)) + 0.05
        const elbow = [shoulder[0] + Math.sin(swing) * 11, shoulder[1] + Math.cos(swing) * 11 + 1]
        const handA = swing + 1.7
        const hand = [elbow[0] + Math.sin(handA) * 11, elbow[1] + Math.cos(handA) * 11 - 1]
        be.poly([shoulder, elbow, hand], width)
      }
      arm(-1, 0.8)
      arm(1, 1)

      // 女性：头发
      if (gender === 'female') {
        const [cx, cy] = head
        be.path(\`M\${cx - 7.6} \${cy + 0.5} A 7.8 7.8 0 0 1 \${cx + 7.6} \${cy + 0.5}\`)
        be.path(\`M\${cx + 7} \${cy + 1} q7 4 3.5 11\`)
      }
    }
  },
`

t = t.slice(0, start) + newRun + t.slice(end)
fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 跑步参数已加大')

require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')
