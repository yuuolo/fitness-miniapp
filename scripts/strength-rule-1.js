// 相对力量新规则：
//   0 项 → 0 分（分母仍是 40，总分不再因缺项虚高）
//   1 项 → 最多 13.3；2 项 → 最多 26.7；3 项 → 40（按 合计÷体重 与 3.0/2.2 倍的比例）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/fitness.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

// ---------- 1. 替换常量与 strength 分支 ----------
const oldStart = `const STRENGTH_CAP_PARTIAL = 15`
const oldBlock = `  if (sbdTotal > 0 && weight > 0) {
    const ratio = sbdTotal / weight
    const target = gender === 'female' ? 2.2 : 3.0
    const s = Math.max(0, Math.min(1, ratio / target))
    const count = Number(sbdCount) || 0
    const missing = count < 3
    // 三项没录全时封顶 15 分
    const raw40 = 40 * s
    const capped = missing ? Math.min(raw40, STRENGTH_CAP_PARTIAL) : raw40
    detail.push({
      key: 'strength',
      label: '相对力量',
      score: round(capped, 1),
      max: 40,
      capped: missing && raw40 > STRENGTH_CAP_PARTIAL,
      note: missing ? '卧推/深蹲/硬拉未录全，本次最多 ' + STRENGTH_CAP_PARTIAL + ' 分' : ''
    })
    got += capped
    full += 40
  }`

const newBlock = `  // 相对力量（40 分）：三项各占三分之一，缺一项就少三分之一。
  // 一项都没录记 0 分（分母仍是 40），避免「不练力量也能满分」。
  if (weight > 0) {
    const count = Math.max(0, Math.min(3, Number(sbdCount) || 0))
    const cap = count >= 3 ? 40 : (40 * count) / 3
    const ratio = sbdTotal > 0 ? sbdTotal / weight : 0
    const target = gender === 'female' ? 2.2 : 3.0
    const s = Math.max(0, Math.min(1, ratio / target))
    const raw40 = 40 * s
    const score = Math.min(raw40, cap)

    let note = ''
    if (count === 0) {
      note = '还没有卧推/深蹲/硬拉成绩，这一项先按 0 分算'
    } else if (count < 3) {
      const missingNames = Array.isArray(input.sbdMissing) ? input.sbdMissing : []
      note = '已录 ' + count + '/3 项' +
        (missingNames.length ? '（还差 ' + missingNames.join('、') + '）' : '') +
        '，这一项最多 ' + round(cap, 1) + ' 分'
    }

    detail.push({
      key: 'strength',
      label: '相对力量',
      score: round(score, 1),
      max: 40,
      capped: raw40 > cap && count > 0,
      count,
      note
    })
    got += score
    full += 40
  }`

if (!t.includes(oldStart) || !t.includes(oldBlock)) {
  console.log('⚠ 未匹配旧的 strength 逻辑')
  process.exit(1)
}
t = t.replace(oldStart, '// 相对力量的三项：卧推 / 深蹲 / 硬拉\nconst SBD_KEYS = [\'bench\', \'squat\', \'deadlift\']\nconst SBD_NAMES = { bench: \'卧推\', squat: \'深蹲\', deadlift: \'硬拉\' }')
t = t.replace(oldBlock, newBlock)
done.push('scoreBody 改为分档封顶 + 0 项 0 分')

// ---------- 2. 新的帮助函数：缺哪几项 ----------
if (!t.includes('function sbdMissingOf')) {
  t = t.replace(
    `// 卧推/深蹲/硬拉里录了几项（有 1RM 才计数）`,
    `// 缺哪几项（中文名），用于评分说明
function sbdMissingOf(bestLift) {
  const b = bestLift || {}
  return SBD_KEYS.filter(k => !(b[k] && b[k].oneRM > 0)).map(k => SBD_NAMES[k])
}

// 卧推/深蹲/硬拉里录了几项（有 1RM 才计数）`
  )
  done.push('新增 sbdMissingOf')
}

// ---------- 3. 三处调用带 sbdMissing ----------
const pairs = [
  ['    sbdTotal: sbdOf(bestLift),\n    sbdCount: sbdCountOf(bestLift)\n  })',
    '    sbdTotal: sbdOf(bestLift),\n    sbdCount: sbdCountOf(bestLift),\n    sbdMissing: sbdMissingOf(bestLift)\n  })'],
  ['    sbdTotal: sbdOf(target.bestLift),\n    sbdCount: sbdCountOf(target.bestLift)\n  })',
    '    sbdTotal: sbdOf(target.bestLift),\n    sbdCount: sbdCountOf(target.bestLift),\n    sbdMissing: sbdMissingOf(target.bestLift)\n  })'],
  ['      sbdTotal: sbdOf(member.bestLift),\n      sbdCount: sbdCountOf(member.bestLift)\n    })',
    '      sbdTotal: sbdOf(member.bestLift),\n      sbdCount: sbdCountOf(member.bestLift),\n      sbdMissing: sbdMissingOf(member.bestLift)\n    })'],
  ['      sbdTotal: sbdOf(bestThen),\n      sbdCount: sbdCountOf(bestThen)\n    })',
    '      sbdTotal: sbdOf(bestThen),\n      sbdCount: sbdCountOf(bestThen),\n      sbdMissing: sbdMissingOf(bestThen)\n    })']
]
let hits = 0
for (const [from, to] of pairs) {
  if (t.includes(from)) {
    t = t.split(from).join(to)
    hits++
  }
}
done.push('调用点带 sbdMissing（' + hits + ' 处）')

// withScore 里也带上
if (t.includes("      sbdTotal: sbdOf(member.bestLift),\n      sbdCount: sbdCountOf(member.bestLift),\n      sbdMissing")) {
  // 已经覆盖
} else {
  console.log('  · withScore 的调用可能没覆盖，稍后核对')
}

// ---------- 4. 导出 ----------
t = t.replace(
  '  scoreBody, sbdOf, sbdCountOf, fatRange, bmiOf,',
  '  scoreBody, sbdOf, sbdCountOf, sbdMissingOf, fatRange, bmiOf,'
)

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))

require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')

// 核对所有 scoreBody 调用都带了 sbdMissing
const after = fs.readFileSync(P, 'utf8')
const calls = (after.match(/scoreBody\(\{/g) || []).length
const withMissing = (after.match(/sbdMissing: sbdMissingOf/g) || []).length
console.log('  scoreBody 调用 ' + calls + ' 处，带 sbdMissing ' + withMissing + ' 处')
for (const fn of ['sbdMissingOf', 'SBD_NAMES']) {
  console.log('  ' + fn + ': ' + (after.includes(fn) ? '✓' : '✗'))
}
