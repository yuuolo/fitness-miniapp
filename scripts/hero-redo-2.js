// 再改一轮：举重换正面视角（杠铃绕过头部），跑步修正落脚与摆臂
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/utils/hero-anim.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

// ---------- 举重：正面视角，杠铃横杆在头部两侧断开（看起来从后面过） ----------
const startLift = t.indexOf("  {\n    key: 'lift'")
const endLift = t.indexOf("  {\n    key: 'squat'")
const oldLift = t.slice(startLift, endLift)

const newLift = `  {
    key: 'lift',
    name: '举重',
    // 正面视角过顶推举：杠铃从肩前推到头顶，横杆在头部处断开（看起来从脑后经过）
    custom(be, gender, phase) {
      const k = upDown(phase)                 // 0 = 肩前，1 = 头顶锁定
      const dip = 1 - k                       // 起始阶段略微下蹲
      const narrow = gender === 'female' ? 1.5 : 0

      const headY = 30 + 1.5 * dip
      const headX = 60
      const shoulderY = 44 + 1.5 * dip
      const hipY = 64 + 2.2 * dip

      // 手（握杠）位置：肩前 → 头顶上方
      const handY = 47 - 33 * k
      const handX1 = 50 - 1.5 * k
      const handX2 = 70 + 1.5 * k

      const left = [handX1, handY]
      const right = [handX2, handY]

      // 横杆：分两段，给头部留出空隙
      const gap = 11
      const barY = handY
      be.line(24, barY, headX - gap, barY, 1.1)
      be.line(headX + gap, barY, 96, barY, 1.1)
      // 杠铃片
      be.rect(24, barY - 10, 7, 20)
      be.rect(89, barY - 10, 7, 20)

      // 身体
      be.circle(headX, headY, 8)
      be.poly([[headX, headY + 8], [headX, shoulderY]])
      be.poly([[headX - 7, shoulderY], [headX + 7, shoulderY]])
      be.poly([[headX, shoulderY], [headX, hipY]])
      be.poly([[headX - narrow, hipY], [headX - 9, 84], [headX - 11, 102]])
      be.poly([[headX + narrow, hipY], [headX + 9, 84], [headX + 11, 102]])
      be.line(headX - 13, 104, headX - 6, 104, 0.9)
      be.line(headX + 6, 104, headX + 13, 104, 0.9)

      // 手臂：肩 → 肘（IK）→ 手，肘朝外下方
      const sl = [headX - 7 + narrow, shoulderY]
      const sr = [headX + 7 - narrow, shoulderY]
      const el = ik2(sl[0], sl[1], left[0], left[1], 14, 14, true)
      const er = ik2(sr[0], sr[1], right[0], right[1], 14, 14, false)
      be.poly([sl, el, left])
      be.poly([sr, er, right])

      // 女性：头发
      if (gender === 'female') {
        const cy = headY
        be.path(\`M\${headX - 7.6} \${cy + 0.5} A 7.8 7.8 0 0 1 \${headX + 7.6} \${cy + 0.5}\`)
        be.path(\`M\${headX + 7} \${cy + 1} q7 4 3.5 11\`)
      }
    }
  },
`
t = t.slice(0, startLift) + newLift + t.slice(endLift)
done.push('举重改为正面过顶推举')

// ---------- 跑步：抬高重心、缩短脚、避免踩到地面、摆臂更明显 ----------
const startRun = t.indexOf("  {\n    key: 'run'")
const endRun = t.indexOf("  {\n    key: 'pullup'")
const oldRun = t.slice(startRun, endRun)

const newRun = `  {
    key: 'run',
    name: '跑步',
    // 侧视图跑步循环：大腿前后摆 + 摆动腿屈膝 + 身体起伏 + 对侧摆臂
    custom(be, gender, phase) {
      const phi = phase * Math.PI * 2
      const bob = 2.6 * Math.abs(Math.cos(phi))       // 支撑中期略低
      const lean = 1.2                                 // 前倾量
      const hip = [52, 55 + bob]
      const shoulder = [60 + lean, 38 + bob]
      const head = [65 + lean, 26 + bob]

      const THIGH = 20
      const SHIN = 19

      const leg = (thighA, flex) => {
        const knee = [hip[0] + Math.sin(thighA) * THIGH, hip[1] + Math.cos(thighA) * THIGH]
        const shinA = thighA - flex
        const ankle = [knee[0] + Math.sin(shinA) * SHIN, knee[1] + Math.cos(shinA) * SHIN]
        // 脚掌：向前伸一小段
        const toe = [ankle[0] + 6.5 * Math.cos(shinA * 0.5), ankle[1] + 2.5]
        return { knee, ankle, toe }
      }

      // 右腿相位 phi，左腿反相；大腿由后向前摆的过程屈膝（抬脚）
      const thighR = 0.66 * Math.sin(phi)
      const flexR = 0.1 + 1.15 * clamp01(Math.cos(phi - 1.2))
      const thighL = 0.66 * Math.sin(phi + Math.PI)
      const flexL = 0.1 + 1.15 * clamp01(Math.cos(phi + Math.PI - 1.2))

      const r = leg(thighR, flexR)
      const l = leg(thighL, flexL)

      // 地面
      be.line(22, 102, 102, 102, 0.5)

      // 远侧腿先画（细一点，做出前后层次）
      be.poly([hip, l.knee, l.ankle], 0.85)
      be.line(l.ankle[0], l.ankle[1], l.toe[0], l.toe[1], 0.7)

      // 身体
      be.circle(head[0], head[1], 8)
      be.poly([[head[0], head[1] + 8], [shoulder[0], shoulder[1]]])
      be.poly([shoulder, hip])

      // 近侧腿
      be.poly([hip, r.knee, r.ankle], 1)
      be.line(r.ankle[0], r.ankle[1], r.toe[0], r.toe[1], 0.9)

      // 手臂：与同侧腿反相，肘部保持弯曲（跑步姿势）
      const arm = (side, width) => {
        const swing = -0.62 * Math.sin(phi + (side > 0 ? 0 : Math.PI)) + 0.1
        const elbow = [shoulder[0] + Math.sin(swing) * 12, shoulder[1] + Math.cos(swing) * 12]
        const handA = swing + (side > 0 ? 1.55 : -1.55) * 0 + 1.55
        const hand = [elbow[0] + Math.sin(handA) * 11, elbow[1] + Math.cos(handA) * 11]
        be.poly([shoulder, elbow, hand], width)
        return hand
      }
      arm(-1, 0.85)
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
t = t.slice(0, startRun) + newRun + t.slice(endRun)
done.push('跑步修正落脚与摆臂')

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')
