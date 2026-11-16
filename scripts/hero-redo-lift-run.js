// 重做「举重」「跑步」两个动画：改成侧视图 + 真实运动学
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/utils/hero-anim.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

// ---------- 1. 工具函数：两骨骼 IK + 插值 ----------
if (!t.includes('function ik2(')) {
  const helpers = `// 两段骨骼 IK：给肩点和手点，算出肘的位置（bendDown=true 时肘朝下/后）
function ik2(sx, sy, tx, ty, len1, len2, bendDown) {
  let dx = tx - sx
  let dy = ty - sy
  let d = Math.sqrt(dx * dx + dy * dy) || 0.001
  const maxD = len1 + len2 - 0.5
  const minD = Math.abs(len1 - len2) + 0.5
  if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD }
  if (d < minD) { dx *= minD / d; dy *= minD / d; d = minD }
  const base = Math.atan2(dy, dx)
  const cosA = (len1 * len1 + d * d - len2 * len2) / (2 * len1 * d)
  const a = Math.acos(Math.max(-1, Math.min(1, cosA)))
  const ang = base + (bendDown ? a : -a)
  return [sx + Math.cos(ang) * len1, sy + Math.sin(ang) * len1]
}

const clamp01 = x => Math.max(0, Math.min(1, x))

// 0 → 1 → 0 的平滑往返（举重一次上推再放下）
function upDown(phase) {
  return 0.5 - 0.5 * Math.cos(phase * Math.PI * 2)
}

`
  t = t.replace('const POSES = [', helpers + 'const POSES = [')
  done.push('加 IK / 工具函数')
}

// ---------- 2. 举重：改成侧视图，杠铃从锁骨推到头顶 ----------
const oldLift = t.slice(t.indexOf("  {\n    key: 'lift'"), t.indexOf("  {\n    key: 'squat'"))

const newLift = `  {
    key: 'lift',
    name: '举重',
    // 侧视图：杠铃片在身前，从肩前一路推到头顶，身体先微蹲再挺直
    custom(be, gender, phase) {
      const k = upDown(phase)                    // 0 = 肩前，1 = 头顶
      const dip = 1 - k                          // 起始阶段膝盖微屈
      const hipY = 62 + 2.2 * dip
      const hipX = 50
      const shoulder = [56 + 1.5 * k, 42 - 1.5 * k]
      const head = [56 + 1.5 * k, 28 - 1.5 * k]
      const narrow = gender === 'female' ? -1.5 : 0

      // 手的位置：肩前 → 头顶（略微前弧）
      const handX = 70 + 2.5 * Math.sin(Math.PI * k)
      const handY = 46 - 31 * k

      // 腿：起始微屈，推起时伸直
      const kneeFront = [46 - 1.5 * dip, 80 + 2 * dip]
      const ankleFront = [44, 102]
      const kneeBack = [58 + 1.5 * dip, 78 + 2 * dip]
      const ankleBack = [60, 100]

      // 杠铃片（从侧面看是一个圆片 + 一小段杠）
      be.circle(handX + 7, handY, 6.2)
      be.circle(handX + 7, handY, 2.2)
      be.line(handX - 1, handY, handX + 7, handY, 0.8)

      // 身体
      be.circle(head[0], head[1], 8)
      be.line(be ? head[0] : 0, head[1] + 8, shoulder[0], shoulder[1], 1)
      be.poly([[shoulder[0] + narrow, shoulder[1] + 2], [hipX, hipY]])
      be.poly([[hipX, hipY], kneeFront, ankleFront])
      be.poly([[hipX, hipY], kneeBack, ankleBack])
      be.line(ankleFront[0] - 3, ankleFront[1] + 2, ankleFront[0] + 7, ankleFront[1] + 2, 0.9)
      be.line(ankleBack[0] - 3, ankleBack[1] + 2, ankleBack[0] + 7, ankleBack[1] + 2, 0.9)

      // 手臂：肩 → 肘（IK）→ 手
      const shoulderPt = [shoulder[0] + narrow, shoulder[1] + 2]
      const elbow = ik2(shoulderPt[0], shoulderPt[1], handX, handY, 15, 15, true)
      be.poly([shoulderPt, elbow, [handX, handY]])

      // 女性：头发
      if (gender === 'female') {
        const [cx, cy] = head
        be.path(\`M\${cx - 7.6} \${cy + 0.5} A 7.8 7.8 0 0 1 \${cx + 7.6} \${cy + 0.5}\`)
        be.path(\`M\${cx + 7} \${cy + 1} q7 4 3.5 11\`)
      }
    }
  },
`

if (!t.includes("key: 'lift'")) {
  console.log('⚠ 找不到 lift 定义')
} else {
  t = t.replace(oldLift, newLift)
  done.push('重做举重（侧视图推举）')
}

// ---------- 3. 跑步：程序化跑姿 ----------
const oldRun = t.slice(t.indexOf("  {\n    key: 'run'"), t.indexOf("  {\n    key: 'pullup'"))

const newRun = `  {
    key: 'run',
    name: '跑步',
    // 侧视图跑步循环：大腿前后摆、摆动腿屈膝、身体上下起伏、手臂对侧摆动
    custom(be, gender, phase) {
      const phi = phase * Math.PI * 2
      const bob = 1.8 + 2.6 * Math.abs(Math.cos(phi))   // 支撑中期最低、腾空最高
      const hip = [52, 60 + bob * 0.4]
      const shoulder = [62 + (gender === 'female' ? -1 : 0), 42 + bob * 0.4]
      const head = [66 + (gender === 'female' ? -1 : 0), 30 + bob * 0.4]

      const THIGH = 20
      const SHIN = 20

      // 单条腿：thighA 前摆角，flex 膝盖屈曲
      const leg = (thighA, flex) => {
        const knee = [
          hip[0] + Math.sin(thighA) * THIGH,
          hip[1] + Math.cos(thighA) * THIGH
        ]
        const shinA = thighA - flex
        const ankle = [
          knee[0] + Math.sin(shinA) * SHIN,
          knee[1] + Math.cos(shinA) * SHIN
        ]
        const footDir = shinA + Math.PI / 2
        const toe = [ankle[0] + Math.cos(footDir) * 7, ankle[1] + Math.sin(footDir) * 7 + 1]
        return { knee, ankle, toe }
      }

      // 右腿相位 phi，左腿反相；摆动阶段（大腿由后向前）屈膝
      const thighR = 0.62 * Math.sin(phi)
      const flexR = 0.12 + 1.05 * clamp01(Math.cos(phi - 1.15))
      const thighL = 0.62 * Math.sin(phi + Math.PI)
      const flexL = 0.12 + 1.05 * clamp01(Math.cos(phi + Math.PI - 1.15))

      const r = leg(thighR, flexR)
      const l = leg(thighL, flexL)

      // 地面
      be.line(24, 104, 100, 104, 0.6)

      // 身体
      be.circle(head[0], head[1], 8)
      be.poly([[head[0], head[1] + 8], [shoulder[0], shoulder[1]]])
      be.poly([shoulder, hip])
      be.poly([hip, l.knee, l.ankle])
      be.poly([hip, r.knee, r.ankle])
      be.line(l.ankle[0], l.ankle[1], l.toe[0], l.toe[1], 0.9)
      be.line(r.ankle[0], r.ankle[1], r.toe[0], r.toe[1], 0.9)

      // 手臂：与同侧腿反相，肘部弯曲
      const arm = (side) => {
        const swing = -0.55 * Math.sin(phi + (side > 0 ? 0 : Math.PI)) + 0.12
        const elbow = [
          shoulder[0] + Math.sin(swing) * 13,
          shoulder[1] + Math.cos(swing) * 13
        ]
        const handA = swing + (side > 0 ? 1.5 : 1.5)
        const hand = [elbow[0] + Math.sin(handA) * 12, elbow[1] + Math.cos(handA) * 12]
        return [shoulder, elbow, hand]
      }
      be.poly(arm(1))
      be.poly(arm(-1))

      // 女性：头发
      if (gender === 'female') {
        const [cx, cy] = head
        be.path(\`M\${cx - 7.6} \${cy + 0.5} A 7.8 7.8 0 0 1 \${cx + 7.6} \${cy + 0.5}\`)
        be.path(\`M\${cx + 7} \${cy + 1} q7 4 3.5 11\`)
      }
    }
  },
`

if (!t.includes("key: 'run'")) {
  console.log('⚠ 找不到 run 定义')
} else {
  t = t.replace(oldRun, newRun)
  done.push('重做跑步（程序化跑姿）')
}

// ---------- 4. paint 支持 custom ----------
t = t.replace(
  `function paint(be, poseKey, gender, phase) {
  const pose = BY_KEY[poseKey] || POSES[0]
  const g = joints(pose, phase, gender)`,
  `function paint(be, poseKey, gender, phase) {
  const pose = BY_KEY[poseKey] || POSES[0]
  // 这两个姿势是程序化绘制的，不走关键帧插值
  if (pose.custom) {
    pose.custom(be, gender, phase)
    return
  }
  const g = joints(pose, phase, gender)`
)
done.push('paint 支持自定义绘制')

// 旧的 lift / run 器械与线条分支不再需要（现在都在 custom 里）
t = t.replace(
  `  const gear = (x1, y1, x2, y2) => be.line(x1, y1, x2, y2, 1)
  if (pose.key === 'lift') {
    const y = g.barY !== undefined ? g.barY : 16
    gear(26, y, 94, y)
    be.rect(26, y - 10, 8, 20)
    be.rect(86, y - 10, 8, 20)
  } else if (pose.key === 'squat') {`,
  `  const gear = (x1, y1, x2, y2) => be.line(x1, y1, x2, y2, 1)
  if (pose.key === 'squat') {`
)
t = t.replace(
  `  } else if (pose.key === 'run') {
    be.line(24, 100, 96, 100, 0.6)
  }`,
  `  }`
)
done.push('清理旧的 lift/run 绘制分支')

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))

require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')
