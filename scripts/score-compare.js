// 用真实会员数据对比几种「相对力量」计分方案
// 数据来自生产库（2026-11-17）
const MEMBERS = [
  { name: '小菜菜', gender: 'female', weight: 57.7, fat: 26.4, bmi: 23.1, bench: 40, squat: 0, deadlift: 0, scoreNow: 73 },
  { name: '👀', gender: 'male', weight: 73.7, fat: 23.5, bmi: 24.1, bench: 0, squat: 0, deadlift: 0, scoreNow: 71 },
  { name: '大只包', gender: 'male', weight: 64.1, fat: 19.6, bmi: 22.4, bench: 40, squat: 0, deadlift: 0, scoreNow: 68 },
  { name: '对', gender: 'male', weight: 74, fat: 22.1, bmi: 24.2, bench: 40, squat: 0, deadlift: 0, scoreNow: 56 },
  { name: 'Yu', gender: 'male', weight: 88.4, fat: 29, bmi: 28.9, bench: 50.7, squat: 176, deadlift: 80, scoreNow: 50 },
  { name: 'lok', gender: 'male', weight: 86.3, fat: 26.6, bmi: 28.2, bench: 0, squat: 0, deadlift: 0, scoreNow: 31 },
  { name: '龙', gender: 'male', weight: 77, fat: 27.9, bmi: 26.6, bench: 0, squat: 0, deadlift: 0, scoreNow: 26 },
  { name: '雷阵雨', gender: 'male', weight: 88.4, fat: 29, bmi: 28.9, bench: 46.7, squat: 0, deadlift: 60, scoreNow: 25 }
]

// 体脂率（40 分）
function fatScore(gender, fat) {
  if (!fat) return null
  const r = gender === 'female' ? { min: 20, max: 28 } : { min: 12, max: 20 }
  if (fat >= r.min && fat <= r.max) return 40
  const dist = fat < r.min ? r.min - fat : fat - r.max
  return 40 * Math.max(0, 1 - dist / 8)
}
// 体重指数（20 分）
function bmiScore(bmi) {
  if (!bmi) return null
  if (bmi >= 18.5 && bmi <= 24) return 20
  const s = Math.max(0, 1 - (bmi < 18.5 ? (18.5 - bmi) / 6 : (bmi - 24) / 10))
  return 20 * s
}

const TARGET = { male: 3.0, female: 2.2 }
const PER_ITEM = { male: { bench: 0.75, squat: 1.05, deadlift: 1.2 }, female: { bench: 0.55, squat: 0.77, deadlift: 0.88 } }

function sbdTotal(m) { return (m.bench || 0) + (m.squat || 0) + (m.deadlift || 0) }
function countOf(m) { return [m.bench, m.squat, m.deadlift].filter(v => v > 0).length }

// 方案：返回 { strength: 分数或 null(不计入), total: 百分制 }
function compute(m, scheme) {
  const f = fatScore(m.gender, m.fat)
  const b = bmiScore(m.bmi)
  const total = sbdTotal(m)
  const ratio = m.weight > 0 ? total / m.weight : 0
  const raw = Math.min(40, 40 * Math.min(1, ratio / TARGET[m.gender]))
  const n = countOf(m)
  let strength = 0
  let include = true

  if (scheme === 'now') {
    // 现状：0 项不计入（归一化），1–2 项封顶 15
    if (n === 0) { include = false; strength = 0 }
    else if (n < 3) strength = Math.min(15, raw)
    else strength = raw
  } else if (scheme === 'strict') {
    // 方案一：分母永远 100，缺项部分记 0
    strength = n < 3 ? raw : raw
  } else if (scheme === 'tier') {
    // 方案二：分档封顶（缺一项即少 1/3）
    strength = n === 0 ? 0 : Math.min(raw, 40 * n / 3)
  } else if (scheme === 'per') {
    // 方案三：三项各 13.3 分，缺项即 0（按每项目标倍数）
    const t = PER_ITEM[m.gender]
    const parts = [
      m.bench > 0 ? Math.min(1, m.bench / (t.bench * m.weight)) : 0,
      m.squat > 0 ? Math.min(1, m.squat / (t.squat * m.weight)) : 0,
      m.deadlift > 0 ? Math.min(1, m.deadlift / (t.deadlift * m.weight)) : 0
    ]
    strength = 40 * (parts[0] + parts[1] + parts[2]) / 3
  }

  const got = (f || 0) + strength + (b || 0)
  const full = (f === null ? 0 : 40) + (include ? 40 : 0) + (b === null ? 0 : 20)
  return {
    strength: Math.round(strength * 10) / 10,
    total: Math.round((got / full) * 100),
    n
  }
}

const schemes = [
  ['现状（缺项≤15，0项不计入）', 'now'],
  ['方案一 缺项记0（分母100）', 'strict'],
  ['方案二 分档封顶(0/13.3/26.7/40)', 'tier'],
  ['方案三 三项各13.3分', 'per']
]

console.log('会员'.padEnd(8) + '项数'.padEnd(5) + '体重'.padEnd(7) + '三项合计'.padEnd(9) +
  schemes.map(s => s[0].padEnd(30)).join(''))
for (const m of MEMBERS) {
  const row = []
  for (const [, key] of schemes) {
    const r = compute(m, key)
    row.push((r.strength + ' 分 → ' + r.total + ' 分').padEnd(30))
  }
  console.log(
    m.name.padEnd(8) +
    String(countOf(m)).padEnd(5) +
    String(m.weight).padEnd(7) +
    String(sbdTotal(m)).padEnd(9) +
    row.join('')
  )
}

// 逐方案的变化说明
console.log('\n=== 变化幅度（相对现状）===')
for (const [label, key] of schemes.slice(1)) {
  const diffs = MEMBERS.map(m => {
    const now = compute(m, 'now').total
    const after = compute(m, key).total
    return { name: m.name, delta: after - now }
  })
  console.log(label + '：' + diffs.map(d => d.name + ' ' + (d.delta > 0 ? '+' : '') + d.delta).join('，'))
}
