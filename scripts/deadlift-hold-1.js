// 硬拉：拉到顶后停顿约 1 秒（给这个动作单独的循环时长 3.2 秒）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/utils/hero-anim.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

// ---------- 1. 缓动 + 时长工具 ----------
if (!t.includes('function easeInOut(')) {
  const anchor = 'function upDown(phase) {'
  t = t.replace(anchor, `// 平滑加速-减速（0→1）
function easeInOut(x) {
  const c = Math.max(0, Math.min(1, x))
  return c * c * (3 - 2 * c)
}

${anchor}`)
  done.push('新增 easeInOut 缓动')
}

if (!t.includes('const CYCLE_DEFAULT')) {
  t = t.replace(
    'function easeInOut(x) {',
    `// 每个动作的循环时长（毫秒）；默认 2200，硬拉要留出顶部停顿所以更长
const CYCLE_DEFAULT = 2200
function cycleOf(poseKey) {
  const p = BY_KEY[poseKey]
  return (p && p.cycle) || CYCLE_DEFAULT
}

function easeInOut(x) {`
  )
  done.push('新增 cycleOf')
}

// ---------- 2. 硬拉：底部→顶部→停顿→放下 ----------
const oldK = `      const k = upDown(phase)          // 0 = 杠贴地，1 = 站直`
const newK = `      // 顶部停顿约 1 秒：拉起 34% → 停顿 32% → 放下 34%（循环 3.2 秒 ≈ 1.09s / 1.02s / 1.09s）
      const UP = 0.34
      const HOLD_END = 0.66
      let k
      if (phase < UP) {
        k = easeInOut(phase / UP)
      } else if (phase < HOLD_END) {
        k = 1                                    // 站直锁死，保持不动
      } else {
        k = easeInOut(1 - (phase - HOLD_END) / (1 - HOLD_END))
      }`

if (!t.includes(oldK)) {
  console.log('⚠ 未匹配硬拉的 k 计算')
} else {
  t = t.replace(oldK, newK)
  done.push('硬拉顶部停顿 1 秒')
}

// ---------- 3. 给硬拉加 cycle ----------
const oldPose = `    key: 'deadlift',
    name: '硬拉',`
const newPose = `    key: 'deadlift',
    name: '硬拉',
    cycle: 3200,          // 顶部要停顿 1 秒，循环比别的动作长`
if (!t.includes(oldPose)) {
  console.log('⚠ 未匹配硬拉 pose 定义')
} else if (!t.includes('cycle: 3200')) {
  t = t.replace(oldPose, newPose)
  done.push('硬拉循环 3.2 秒')
}

// ---------- 4. 导出 cycleOf ----------
t = t.replace(
  'module.exports = { POSES, BY_KEY, poseOfDay, drawCanvas, toSvg, figureUri, paint, joints, base64 }',
  'module.exports = { POSES, BY_KEY, poseOfDay, drawCanvas, toSvg, figureUri, paint, joints, base64, cycleOf, CYCLE_DEFAULT }'
)

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))

require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')

const mod = require(P)
console.log('  硬拉循环: ' + mod.cycleOf('deadlift') + 'ms，其它动作: ' + mod.cycleOf('lift') + 'ms')
