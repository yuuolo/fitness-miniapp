// 深蹲蹲得更低（臀低于膝、接近小腿中段）；引体向上头过横杆
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/utils/hero-anim.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

// ---------- 深蹲 ----------
const startSquat = t.indexOf("  {\n    key: 'squat'")
const endSquat = t.indexOf("  {\n    key: 'curl'")

const newSquat = `  {
    key: 'squat',
    name: '深蹲',
    // 杠铃背蹲：从站直蹲到很深（臀部低于膝盖、接近小腿中段）
    frames: [
      {
        head: [60, 26], torso: [[60, 34], [60, 62]],
        arms: [[[54, 42], [46, 36], [40, 34]], [[66, 42], [74, 36], [80, 34]]],
        legs: [[[57, 62], [52, 80], [50, 100]], [[63, 62], [68, 80], [70, 100]]],
        hands: [[40, 34], [80, 34]], barY: 34
      },
      {
        head: [60, 56], torso: [[60, 64], [60, 90]],
        arms: [[[54, 72], [46, 66], [40, 64]], [[66, 72], [74, 66], [80, 64]]],
        legs: [[[57, 90], [42, 84], [47, 102]], [[63, 90], [78, 84], [73, 102]]],
        hands: [[40, 64], [80, 64]], barY: 64
      }
    ]
  },
`
t = t.slice(0, startSquat) + newSquat + t.slice(endSquat)
done.push('深蹲：蹲到臀部低于膝盖')

// ---------- 引体向上 ----------
const startPull = t.indexOf("  {\n    key: 'pullup'")
// pullup 是最后一个，结束位置是 POSES 数组结尾
const endPull = t.indexOf('\n]\n\nconst BY_KEY')

const newPull = `  {
    key: 'pullup',
    name: '引体向上',
    // 单杠挂在画面上方；上拉到头部超过横杆（下巴/头过杠）
    frames: [
      {
        head: [60, 46], torso: [[60, 54], [60, 80]],
        arms: [[[52, 52], [48, 38], [44, 24]], [[68, 52], [72, 38], [76, 24]]],
        legs: [[[57, 80], [54, 94], [52, 106]], [[63, 80], [66, 94], [68, 106]]],
        hands: [[44, 24], [76, 24]]
      },
      {
        head: [60, 14], torso: [[60, 22], [60, 46]],
        arms: [[[52, 30], [40, 32], [44, 24]], [[68, 30], [80, 32], [76, 24]]],
        legs: [[[57, 46], [54, 60], [62, 66]], [[63, 46], [66, 60], [58, 66]]],
        hands: [[44, 24], [76, 24]]
      }
    ]
  }
`
if (endPull < 0) {
  console.log('⚠ 找不到 POSES 结尾')
} else {
  t = t.slice(0, startPull) + newPull + t.slice(endPull)
  done.push('引体向上：上拉到头部过杠')
}

// ---------- 器械：横杆位置、脚掌位置跟着改 ----------
// 引体向上的单杠从 y=13 下移到 y=24，握点对齐 44 / 76
t = t.replace(
  `  } else if (pose.key === 'pullup') {
    gear(26, 13, 94, 13)
    be.circle(45, 13, 2.6)
    be.circle(75, 13, 2.6)
  }`,
  `  } else if (pose.key === 'pullup') {
    gear(26, 24, 94, 24)
    be.circle(44, 24, 2.6)
    be.circle(76, 24, 2.6)
  }`
)

// 深蹲：脚掌跟着插值后的脚踝走（不再写死 y=100）
t = t.replace(
  `    be.line(42, 100, 33, 104, 1)
    be.line(78, 100, 87, 104, 1)`,
  `    const a1 = g.legs[0][2]
    const a2 = g.legs[1][2]
    be.line(a1[0] - 7, a1[1] + 2, a1[0] + 6, a1[1] + 2, 0.9)
    be.line(a2[0] - 6, a2[1] + 2, a2[0] + 7, a2[1] + 2, 0.9)`
)

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')
