// 首页欢迎栏的运动小人：Canvas 逐帧动画
// 每种运动都有「起始帧 A」和「终点帧 B」，按相位在两者之间来回插值，
// 看起来像在做动作；姿势每天固定一个（按日期 + openid 取模），不会乱跳。
const POSES = [
  {
    key: 'lift',
    name: '举重',
    // 杠铃从肩前推到头顶
    frames: [
      { head: [60, 33], torso: [[60, 41], [60, 66]],
        arms: [[[53, 44], [45, 58], [50, 52]], [[67, 44], [75, 58], [70, 52]]],
        legs: [[[56, 66], [50, 84], [48, 100]], [[64, 66], [70, 84], [72, 100]]],
        hands: [[50, 52], [70, 52]] },
      { head: [60, 33], torso: [[60, 41], [60, 66]],
        arms: [[[53, 44], [50, 30], [50, 16]], [[67, 44], [70, 30], [70, 16]]],
        legs: [[[56, 66], [50, 84], [48, 100]], [[64, 66], [70, 84], [72, 100]]],
        hands: [[50, 16], [70, 16]] }
    ]
  },
  {
    key: 'squat',
    name: '深蹲',
    // 杠铃背在肩上，站起来 → 蹲下去
    frames: [
      { head: [60, 24], torso: [[60, 32], [60, 60]],
        arms: [[[54, 40], [46, 33], [40, 33]], [[66, 40], [74, 33], [80, 33]]],
        legs: [[[57, 60], [52, 79], [49, 99]], [[63, 60], [68, 79], [71, 99]]],
        hands: [[40, 33], [80, 33]], barY: 33 },
      { head: [60, 30], torso: [[60, 38], [60, 70]],
        arms: [[[54, 46], [46, 39], [40, 39]], [[66, 46], [74, 39], [80, 39]]],
        legs: [[[57, 70], [40, 77], [43, 100]], [[63, 70], [80, 77], [77, 100]]],
        hands: [[40, 39], [80, 39]], barY: 39 }
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
    // 两步交替
    frames: [
      { head: [65, 27], torso: [[63, 35], [54, 60]],
        arms: [[[59, 40], [46, 48], [40, 42]], [[62, 42], [76, 44], [84, 38]]],
        legs: [[[56, 60], [72, 70], [70, 92]], [[52, 60], [40, 74], [33, 94]]],
        hands: [[40, 42], [84, 38]] },
      { head: [65, 29], torso: [[63, 37], [54, 62]],
        arms: [[[59, 42], [46, 40], [40, 32]], [[62, 44], [76, 52], [84, 58]]],
        legs: [[[56, 62], [68, 76], [74, 96]], [[52, 62], [40, 70], [34, 90]]],
        hands: [[40, 32], [84, 58]] }
    ]
  },
  {
    key: 'pullup',
    name: '引体向上',
    // 挂在杠上 → 拉起
    frames: [
      { head: [60, 40], torso: [[60, 48], [60, 72]],
        arms: [[[55, 49], [50, 32], [45, 14]], [[65, 49], [70, 32], [75, 14]]],
        legs: [[[57, 72], [55, 87], [53, 101]], [[63, 72], [65, 87], [67, 101]]],
        hands: [[45, 14], [75, 14]] },
      { head: [60, 29], torso: [[60, 37], [60, 61]],
        arms: [[[55, 38], [48, 25], [45, 14]], [[65, 38], [72, 25], [75, 14]]],
        legs: [[[57, 61], [55, 76], [53, 90]], [[63, 61], [65, 76], [67, 90]]],
        hands: [[45, 14], [75, 14]] }
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
  const g = joints(pose, phase, gender)
  const r = be.scale || 1

  // 器械
  const gear = (x1, y1, x2, y2) => be.line(x1, y1, x2, y2, 1)
  if (pose.key === 'lift') {
    const y = g.barY !== undefined ? g.barY : 16
    gear(26, y, 94, y)
    be.rect(26, y - 10, 8, 20)
    be.rect(86, y - 10, 8, 20)
  } else if (pose.key === 'squat') {
    const y = g.barY
    gear(34, y, 86, y)
    be.rect(34, y - 10, 7, 18)
    be.rect(79, y - 10, 7, 18)
    be.line(42, 100, 33, 104, 1)
    be.line(78, 100, 87, 104, 1)
  } else if (pose.key === 'dip') {
    gear(14, 44, 42, 44)
    gear(78, 44, 106, 44)
    be.line(14, 44, 14, 92, 1)
    be.line(106, 44, 106, 92, 1)
  } else if (pose.key === 'pullup') {
    gear(26, 13, 94, 13)
    be.circle(45, 13, 2.6)
    be.circle(75, 13, 2.6)
  } else if (pose.key === 'run') {
    be.line(24, 100, 96, 100, 0.6)
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

/** 每天固定一个姿势：同一天同一个人始终是同一个动作 */
function poseOfDay(seed, dateStr) {
  const s = String(seed || '') + '#' + String(dateStr || '')
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return POSES[Math.abs(h) % POSES.length]
}

module.exports = { POSES, BY_KEY, poseOfDay, drawCanvas, toSvg, figureUri, paint, joints, base64 }
