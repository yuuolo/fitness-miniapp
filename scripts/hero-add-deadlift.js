// 新增「硬拉」姿势：侧视图，从地面拉到髋部锁死（幅度大）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/utils/hero-anim.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

if (t.includes("key: 'deadlift'")) {
  console.log('· 已有硬拉')
  process.exit(0)
}

// 插到 pullup 之前
const anchor = "  {\n    key: 'pullup'"

const pose = `  {
    key: 'deadlift',
    name: '硬拉',
    // 侧视图传统硬拉：从地面拉起，到髋部锁死；杠铃行程最大
    custom(be, gender, phase) {
      const k = upDown(phase)          // 0 = 杠铃在地面，1 = 站直锁死
      const narrow = gender === 'female' ? 1 : 0
      const lerp = (a, b) => a + (b - a) * k

      // 关键点：底部弓身、髋后移；顶部站直
      const ankle = [52, 102]
      const knee = [lerp(58, 55), lerp(80, 80)]
      const hip = [lerp(40, 48), lerp(74, 62)]
      const shoulder = [lerp(62, 58), lerp(64, 40)]
      const head = [lerp(74, 66), lerp(58, 34)]
      const hand = [lerp(66, 61), lerp(96, 68)]

      // 杠铃（侧视：一根横杆 + 一片配重）
      be.line(hand[0] - 12, hand[1], hand[0] + 8, hand[1], 1.1)
      be.circle(hand[0] + 9, hand[1], 7.5)
      be.circle(hand[0] + 9, hand[1], 2.2)

      // 腿（远侧腿细一点）
      be.poly([[hip[0] + 1, hip[1]], [knee[0] - 2, knee[1] + 2], [ankle[0] - 2, ankle[1]]], 0.8)
      be.line(ankle[0] - 4, ankle[1] + 1, ankle[0] + 6, ankle[1] + 1, 0.7)

      // 身体
      be.circle(head[0], head[1], 8)
      be.poly([[head[0] - 1, head[1] + 8], [shoulder[0], shoulder[1]]])
      be.poly([shoulder, [hip[0] + narrow, hip[1]]])

      // 近侧腿
      be.poly([[hip[0], hip[1]], knee, ankle], 1)
      be.line(ankle[0] - 5, ankle[1] + 2, ankle[0] + 6, ankle[1] + 2, 0.9)

      // 手臂：从肩垂直往下抓杠（硬拉手臂始终伸直）
      const sx = shoulder[0] + narrow
      be.poly([[sx, shoulder[1]], [lerp(sx, hand[0], 0.5), lerp(shoulder[1], hand[1], 0.5)], hand], 1)

      // 女性：头发
      if (gender === 'female') {
        const [cx, cy] = head
        be.path(\`M\${cx - 7.6} \${cy + 0.5} A 7.8 7.8 0 0 1 \${cx + 7.6} \${cy + 0.5}\`)
        be.path(\`M\${cx + 7} \${cy + 1} q7 4 3.5 11\`)
      }
    }
  },
`

if (!t.includes(anchor)) {
  console.log('⚠ 找不到插入位置')
  process.exit(1)
}

t = t.replace(anchor, pose + anchor)
fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('  ✓ 新增硬拉姿势（插在引体向上之前）')

require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')

const mod = require(P)
console.log('  动作总数: ' + mod.POSES.length + ' → ' + mod.POSES.map(p => p.name).join(' / '))
