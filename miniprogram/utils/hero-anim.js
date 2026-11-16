// 首页欢迎栏的运动小人：Canvas 逐帧动画
// 每种运动都有「起始帧 A」和「终点帧 B」，按相位在两者之间来回插值，
// 看起来像在做动作；姿势每天固定一个（按日期 + openid 取模），不会乱跳。
// 两段骨骼 IK：给肩点和手点，算出肘的位置（bendDown=true 时肘朝下/后）
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
// 平滑加速-减速（0→1）
// 每个动作的循环时长（毫秒）；默认 2200，硬拉要留出顶部停顿所以更长
const CYCLE_DEFAULT = 2200
function cycleOf(poseKey) {
  const p = BY_KEY[poseKey]
  return (p && p.cycle) || CYCLE_DEFAULT
}

function easeInOut(x) {
  const c = Math.max(0, Math.min(1, x))
  return c * c * (3 - 2 * c)
}

function upDown(phase) {
  return 0.5 - 0.5 * Math.cos(phase * Math.PI * 2)
}

const POSES = [
  {
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
        be.path(`M${headX - 7.6} ${cy + 0.5} A 7.8 7.8 0 0 1 ${headX + 7.6} ${cy + 0.5}`)
        be.path(`M${headX + 7} ${cy + 1} q7 4 3.5 11`)
      }
    }
  },
  {
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
  {
    key: 'curl',
    name: '举哑铃',
    // 单臂弯举：手臂放下 → 举到肩前
    frames: [
      { head: [60, 30], torso: [[60, 38], [60, 66]],
        arms: [[[54, 44], [52, 59], [52, 73]], [[66, 44], [72, 60], [72, 74]]],
        legs: [[[56, 66], [54, 85], [54, 102]], [[64, 66], [66, 85], [66, 102]]],
        hands: [[52, 73], [72, 74]] },
      { head: [60, 30], torso: [[60, 38], [60, 66]],
        arms: [[[54, 44], [52, 59], [52, 73]], [[66, 44], [74, 58], [69, 46]]],
        legs: [[[56, 66], [54, 85], [54, 102]], [[64, 66], [66, 85], [66, 102]]],
        hands: [[52, 73], [69, 46]] }
    ]
  },
  {
    key: 'dip',
    name: '臂屈伸',
    // 双杠臂屈伸：身体上下起伏
    frames: [
      { head: [60, 30], torso: [[60, 38], [60, 62]],
        arms: [[[54, 44], [46, 44], [42, 44]], [[66, 44], [74, 44], [78, 44]]],
        legs: [[[56, 62], [53, 79], [63, 82]], [[64, 62], [67, 79], [57, 82]]],
        hands: [[42, 44], [78, 44]] },
      { head: [60, 45], torso: [[60, 53], [60, 77]],
        arms: [[[54, 58], [47, 51], [42, 44]], [[66, 58], [73, 51], [78, 44]]],
        legs: [[[56, 77], [53, 92], [63, 95]], [[64, 77], [67, 92], [57, 95]]],
        hands: [[42, 44], [78, 44]] }
    ]
  },
  {
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
        const toe = [ankle[0] + 7 * Math.cos(shinA * 0.4 + 0.5), ankle[1] + 3 - 2 * clamp01(flex - 0.9)]
        return { knee, ankle, toe }
      }

      // 右腿相位 phi，左腿反相。
      // 大腿整体相位后移 0.45，让「腿在身后 + 小腿高抬」同时发生，像真正的后踢腿
      const PH = 0.45
      // 前摆抬得更高（1.2rad ≈ 69°），后摆略收，看起来更有「抬腿」感
      const swingA = s => (s > 0 ? 1.2 * s : 0.78 * s)
      const thighR = swingA(Math.sin(phi - PH))
      const flexR = 0.12 + 1.8 * clamp01(Math.cos(phi - 5.16))
      const thighL = swingA(Math.sin(phi + Math.PI - PH))
      const flexL = 0.12 + 1.8 * clamp01(Math.cos(phi + Math.PI - 5.16))

      const r = leg(thighR, flexR)
      const l = leg(thighL, flexL)

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
        be.path(`M${cx - 7.6} ${cy + 0.5} A 7.8 7.8 0 0 1 ${cx + 7.6} ${cy + 0.5}`)
        be.path(`M${cx + 7} ${cy + 1} q7 4 3.5 11`)
      }
    }
  },
  {
    key: 'deadlift',
    name: '硬拉',
    cycle: 3200,          // 顶部要停顿 1 秒，循环比别的动作长
    // 正对面视角传统硬拉：杠铃在地面 → 站直锁死在大腿位置
    custom(be, gender, phase) {
      // 顶部停顿约 1 秒：拉起 34% → 停顿 32% → 放下 34%（循环 3.2 秒 ≈ 1.09s / 1.02s / 1.09s）
      const UP = 0.34
      const HOLD_END = 0.66
      let k
      if (phase < UP) {
        k = easeInOut(phase / UP)
      } else if (phase < HOLD_END) {
        k = 1                                    // 站直锁死，保持不动
      } else {
        k = easeInOut(1 - (phase - HOLD_END) / (1 - HOLD_END))
      }
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
        be.path(`M${headX - 7.6} ${cy + 0.5} A 7.8 7.8 0 0 1 ${headX + 7.6} ${cy + 0.5}`)
        be.path(`M${headX + 7} ${cy + 1} q7 4 3.5 11`)
      }
    }
  },
  {
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
        legs: [[[57, 46], [58, 62], [56, 76]], [[63, 46], [63, 62], [65, 76]]],
        hands: [[44, 24], [76, 24]]
      }
    ]
  }

]

const BY_KEY = POSES.reduce((acc, p) => { acc[p.key] = p; return acc }, {})

// 缓动：0 → 1 → 0，来回匀速感更接近真人动作
function wave(phase) {
  return 0.5 - 0.5 * Math.cos(phase * Math.PI * 2)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function lerpPt(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]
}

function lerpLine(a, b, t) {
  return a.map((p, i) => lerpPt(p, b[i] || p, t))
}

/** 取插值后的关节位置 */
function joints(pose, phase, gender) {
  const t = wave(phase)
  const A = pose.frames[0]
  const B = pose.frames[1]
  const narrow = x => (gender !== 'female' ? x : x + (x < 60 ? 1.5 : -1.5))
  const fx = (line, isFirst) => {
    if (gender !== 'female') return line
    return line.map((p, i) => (i === 0 && isFirst ? [narrow(p[0]), p[1]] : p))
  }
  const merged = {
    head: lerpPt(A.head, B.head, t),
    torso: lerpLine(fx(A.torso, true), fx(B.torso, true), t),
    arms: [lerpLine(fx(A.arms[0], true), fx(B.arms[0], true), t), lerpLine(A.arms[1], B.arms[1], t)],
    legs: [lerpLine(fx(A.legs[0], true), fx(B.legs[0], true), t), lerpLine(A.legs[1], B.legs[1], t)],
    hands: [lerpPt(A.hands[0], B.hands[0], t), lerpPt(A.hands[1], B.hands[1], t)],
    barY: A.barY === undefined ? undefined : lerp(A.barY, B.barY === undefined ? A.barY : B.barY, t)
  }
  return merged
}

// ---------- 画到一个抽象 backend 上（Canvas 和 SVG 共用） ----------
function paint(be, poseKey, gender, phase) {
  const pose = BY_KEY[poseKey] || POSES[0]
  // 这两个姿势是程序化绘制的，不走关键帧插值
  if (pose.custom) {
    pose.custom(be, gender, phase)
    return
  }
  const g = joints(pose, phase, gender)
  const r = be.scale || 1

  // 器械
  const gear = (x1, y1, x2, y2) => be.line(x1, y1, x2, y2, 1)
  if (pose.key === 'squat') {
    const y = g.barY
    gear(34, y, 86, y)
    be.rect(34, y - 10, 7, 18)
    be.rect(79, y - 10, 7, 18)
    const a1 = g.legs[0][2]
    const a2 = g.legs[1][2]
    be.line(a1[0] - 7, a1[1] + 2, a1[0] + 6, a1[1] + 2, 0.9)
    be.line(a2[0] - 6, a2[1] + 2, a2[0] + 7, a2[1] + 2, 0.9)
  } else if (pose.key === 'dip') {
    gear(14, 44, 42, 44)
    gear(78, 44, 106, 44)
    be.line(14, 44, 14, 92, 1)
    be.line(106, 44, 106, 92, 1)
  } else if (pose.key === 'pullup') {
    gear(26, 24, 94, 24)
    be.circle(44, 24, 2.6)
    be.circle(76, 24, 2.6)
  }

  // 身体
  be.circle(g.head[0], g.head[1], 8)
  be.poly(g.torso)
  be.poly(g.arms[0])
  be.poly(g.arms[1])
  be.poly(g.legs[0])
  be.poly(g.legs[1])

  // 哑铃跟随手的位置
  if (pose.key === 'curl') {
    const [hx, hy] = g.hands[1]
    be.line(hx - 6, hy, hx + 6, hy, 1)
    be.line(hx - 6, hy - 4, hx - 6, hy + 4, 1)
    be.line(hx + 6, hy - 4, hx + 6, hy + 4, 1)
  }

  // 女性：头发半圆 + 马尾
  if (gender === 'female') {
    const [cx, cy] = g.head
    be.path(`M${cx - 7.6} ${cy + 0.5} A 7.8 7.8 0 0 1 ${cx + 7.6} ${cy + 0.5}`)
    be.path(`M${cx + 7} ${cy + 1} q7 4 3.5 11`)
  }
}

// ---------- Canvas 渲染 ----------
function drawCanvas(ctx, poseKey, gender, phase, size, dpr) {
  const s = (size / 120) * (dpr || 1)
  ctx.setTransform(s, 0, 0, s, 0, 0)
  ctx.clearRect(0, 0, 120, 120)
  ctx.lineWidth = 4.4
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#ffffff'
  ctx.fillStyle = '#ffffff'
  ctx.globalAlpha = 0.95
  const be = {
    line: (x1, y1, x2, y2, w) => {
      ctx.lineWidth = 4.4 * (w || 1)
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    },
    poly: pts => {
      ctx.lineWidth = 4.4
      ctx.beginPath()
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
      ctx.stroke()
    },
    circle: (cx, cy, r) => {
      ctx.lineWidth = 4.4
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
    },
    rect: (x, y, w, h) => {
      ctx.lineWidth = 2.6
      ctx.beginPath()
      ctx.rect(x, y, w, h)
      ctx.stroke()
    },
    path: d => {
      ctx.lineWidth = 4.4
      ctx.stroke(new Path2D(d))
    }
  }
  paint(be, poseKey, gender, phase)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

// ---------- 静态 SVG（预览图 / 万一 Canvas 不可用时兜底） ----------
function toSvg(poseKey, gender, phase) {
  const parts = []
  const be = {
    line: (x1, y1, x2, y2, w) => parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${4.4 * (w || 1)}"/>`),
    poly: pts => parts.push(`<path d="M${pts.map(p => p[0] + ' ' + p[1]).join(' L')}"/>`),
    circle: (cx, cy, r) => parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}"/>`),
    rect: (x, y, w, h) => parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" stroke-width="2.6"/>`),
    path: d => parts.push(`<path d="${d}"/>`)
  }
  paint(be, poseKey, gender, phase)
  return '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120" ' +
    'fill="none" stroke="#ffffff" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.95">' +
    parts.join('') + '</svg>'
}

const B64CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function base64(str) {
  let out = ''
  for (let i = 0; i < str.length; i += 3) {
    const c1 = str.charCodeAt(i)
    const c2 = str.charCodeAt(i + 1)
    const c3 = str.charCodeAt(i + 2)
    out += B64CHARS[c1 >> 2]
    out += B64CHARS[((c1 & 3) << 4) | (isNaN(c2) ? 0 : c2 >> 4)]
    if (isNaN(c2)) { out += '=='; break }
    out += B64CHARS[((c2 & 15) << 2) | (isNaN(c3) ? 0 : c3 >> 6)]
    if (isNaN(c3)) { out += '='; break }
    out += B64CHARS[c3 & 63]
  }
  return out
}

function figureUri(poseKey, gender, phase) {
  return 'data:image/svg+xml;base64,' + base64(toSvg(poseKey, gender, phase || 0))
}

// 32 位散列 + 雪崩混淆：openid 前缀都很像，不混淆的话取模会扎堆
function hash32(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h ^= h >>> 16
  h = Math.imul(h, 2246822507)
  h ^= h >>> 13
  h = Math.imul(h, 3266489909)
  h ^= h >>> 16
  return h >>> 0
}

/** 每天固定一个姿势：同一个人同一天始终是同一个动作，不同人互不影响 */
function poseOfDay(seed, dateStr) {
  return POSES[hash32(String(seed || '') + '#' + String(dateStr || '')) % POSES.length]
}

module.exports = { POSES, BY_KEY, poseOfDay, drawCanvas, toSvg, figureUri, paint, joints, base64, cycleOf, CYCLE_DEFAULT }
