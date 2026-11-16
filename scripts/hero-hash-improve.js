// 改进每日动作的散列分布：openid 前缀高度相似，需要雪崩混淆
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/utils/hero-anim.js'
let t = fs.readFileSync(P, 'utf8').replace(/\r\n/g, '\n')

const old = `/** 每天固定一个姿势：同一天同一个人始终是同一个动作 */
function poseOfDay(seed, dateStr) {
  const s = String(seed || '') + '#' + String(dateStr || '')
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return POSES[Math.abs(h) % POSES.length]
}`

const neu = `// 32 位散列 + 雪崩混淆：openid 前缀都很像，不混淆的话取模会扎堆
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
}`

if (!t.includes(old)) {
  console.log('⚠ 未匹配 poseOfDay')
} else {
  t = t.replace(old, neu)
  fs.writeFileSync(P, t)
  console.log('✓ poseOfDay 改为带雪崩混淆的散列')
}

module.exports = {}
const mod = require(P)
const ids = [
  'o5bjc4qI1ME8eNUtWE09sLqOE4aE',
  'o5bjc4jdaajzZZs582B7ao6qUagM',
  'o5bjc4pvbv2MQ_v6Vim7d-Melt8Y',
  'o5bjc4oPISG_OF_uYwAtHx4n9JJ0',
  'o5bjc4s7RIV9jq9lErxwTy5gdQao',
  'o5bjc4vcZFTAjOIoEUnfMT43rAKo',
  'o5bjc4pPJztbTnM4yPQYhxfJnN6Q',
  'o5bjc4kPyR8JOQjiqHohU2aPVgZc'
]
console.log('\n=== 8 个真实会员今天(2026-11-16)的动作 ===')
const count = {}
ids.forEach(id => {
  const name = mod.poseOfDay(id, '2026-11-16').name
  count[name] = (count[name] || 0) + 1
})
Object.entries(count).forEach(([k, v]) => console.log('  ' + k + ': ' + v + ' 人'))

console.log('\n=== 1000 个随机 openid 的分布（越均匀越好）===')
const dist = {}
for (let i = 0; i < 1000; i++) {
  const name = mod.poseOfDay('o5bjc4' + i.toString(36) + 'xyz', '2026-11-16').name
  dist[name] = (dist[name] || 0) + 1
}
Object.entries(dist).forEach(([k, v]) => console.log('  ' + k + ': ' + v))

console.log('\n=== 同一个人连续 7 天是否每天不同 ===')
for (let d = 16; d <= 22; d++) {
  console.log('  2026-11-' + d + ' → ' + mod.poseOfDay(ids[0], '2026-11-' + d).name)
}
