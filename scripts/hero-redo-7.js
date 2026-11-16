// 1) 举重：上臂外展（肘朝外，不再内收）
// 2) 硬拉：改成正对面视角
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/utils/hero-anim.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

// ---------- 举重 ----------
const sLift = t.indexOf("  {\n    key: 'lift'")
const eLift = t.indexOf("  {\n    key: 'squat'")

const newLift = `  {
    key: 'lift',
    name: '举重',
    // 正面宽距过顶推举：上臂外展（肘朝身体两侧外），横杆一整根
    custom(be, gender, phase) {
      const k = upDown(phase)                 // 0 = 胸前，1 = 头顶锁定
      const dip = 1 - k

      const headX = 60
      const headY = 31 + 1.2 * dip
      const shoulderY = 45 + 1.2 * dip
      const hipY = 65 + 2 * dip
      const narrow = gender === 'female' ? 1.5 : 0

      // 手（握杠）位置：宽于肩，始终在头部两侧之外
      const handX1 = 41 - 1 * k
      const handX2 = 79 + 1 * k
      const handY = 46 - 32 * k

      // 肘部：底部在肩下方偏外（上臂外展），顶部收拢到接近竖直上推
      const elbowX1 = 36 + 8 * k
      const elbowX2 = 84 - 8 * k
      const elbowY = 54 - 26 * k

      const sl = [headX - 7 + narrow, shoulderY]
      const sr = [headX + 7 - narrow, shoulderY]
      const left = [handX1, handY]
      const right = [handX2, handY]
      const el = [elbowX1, elbowY]
      const er = [elbowX2, elbowY]

      // ---- 先画身体 ----
      be.circle(headX, headY, 8)
      be.poly([[headX, headY + 8], [headX, shoulderY]])
      be.poly([[headX - 7, shoulderY], [headX + 7, shoulderY]])
      be.poly([[headX, shoulderY], [headX, hipY]])
      be.poly([[headX - narrow, hipY], [headX - 9, 84], [headX - 11, 102]])
      be.poly([[headX + narrow, hipY], [headX + 9, 84], [headX + 11, 102]])
      be.line(headX - 13, 104, headX - 6, 104, 0.9)
      be.line(headX + 6, 104, headX + 13, 104, 0.9)

      // 手臂：肩 → 肘（外展）→ 手
      be.poly([sl, el, left])
      be.poly([sr, er, right])

      // ---- 杠铃：一整根，压在身体上层 ----
      be.line(26, handY, 94, handY, 1.15)
      be.rect(26, handY - 10, 7, 20)
      be.rect(87, handY - 10, 7, 20)

      // 女性：头发
      if (gender === 'female') {
        const cy = headY
        be.path(\`M\${headX - 7.6} \${cy + 0.5} A 7.8 7.8 0 0 1 \${headX + 7.6} \${cy + 0.5}\`)
        be.path(\`M\${headX + 7} \${cy + 1} q7 4 3.5 11\`)
      }
    }
  },
`
t = t.slice(0, sLift) + newLift + t.slice(eLift)
done.push('举重：上臂外展')

// ---------- 硬拉：正对面 ----------
const sDead = t.indexOf("  {\n    key: 'deadlift'")
const eDead = t.indexOf("  {\n    key: 'pullup'")

const newDead = `  {
    key: 'deadlift',
    name: '硬拉',
    // 正对面视角传统硬拉：杠铃在地面 → 站直锁死在大腿位置
    custom(be, gender, phase) {
      const k = upDown(phase)          // 0 = 杠贴地，1 = 站直
      const narrow = gender === 'female' ? 1.5 : 0
      const lerp = (a, b) => a + (b - a) * k

      // 身体整体上抬：髋、肩、头、手同步
      const headY = lerp(54, 26)
      const headX = 60
      const shoulderY = lerp(68, 42)
      const hipY = lerp(82, 64)

      // 握距：比肩宽，手在腿外侧
      const handX1 = lerp(44, 41)
      const handX2 = lerp(76, 79)
      const handY = lerp(100, 66)
      const barY = handY

      // 膝盖：底部略屈外张，顶部站直
      const kneeX1 = lerp(38, 50)
      const kneeX2 = lerp(82, 70)
      const kneeY = lerp(86, 84)
      const ankleX1 = lerp(46, 48)
      const ankleX2 = lerp(74, 72)
      const ankleY = 102

      // 杠铃 + 配重片（先画，身体压在后面）
      be.line(20, barY, 100, barY, 1.1)
      be.rect(20, barY - 11, 8, 22)
      be.rect(92, barY - 11, 8, 22)

      // 腿
      be.poly([[headX, hipY], [kneeX1, kneeY], [ankleX1, ankleY]])
      be.poly([[headX, hipY], [kneeX2, kneeY], [ankleX2, ankleY]])
      be.line(ankleX1 - 6, ankleY + 2, ankleX1 + 3, ankleY + 2, 0.9)
      be.line(ankleX2 - 3, ankleY + 2, ankleX2 + 6, ankleY + 2, 0.9)

      // 躯干（底部前倾 → 躯干看起来更短）
      be.poly([[headX, headY + 8], [headX, shoulderY]])
      be.poly([[headX - 7, shoulderY], [headX + 7, shoulderY]])
      be.poly([[headX, shoulderY], [headX, hipY]])
      be.circle(headX, headY, 8)

      // 手臂：从肩斜向外下方抓杠（握距比肩宽）
      be.poly([[headX - 7 + narrow, shoulderY], [lerp(headX - 7 + narrow, handX1, 0.55), lerp(shoulderY, handY, 0.55)], [handX1, handY]])
      be.poly([[headX + 7 - narrow, shoulderY], [lerp(headX + 7 - narrow, handX2, 0.55), lerp(shoulderY, handY, 0.55)], [handX2, handY]])

      // 女性：头发
      if (gender === 'female') {
        const cy = headY
        be.path(\`M\${headX - 7.6} \${cy + 0.5} A 7.8 7.8 0 0 1 \${headX + 7.6} \${cy + 0.5}\`)
        be.path(\`M\${headX + 7} \${cy + 1} q7 4 3.5 11\`)
      }
    }
  },
`
t = t.slice(0, sDead) + newDead + t.slice(eDead)
done.push('硬拉：改成正对面')

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')
