// 服务端：任何会员都能查看别人的资料与身体数据（含历史）
const fs = require('fs')

const F = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/fitness.js'
let t = fs.readFileSync(F, 'utf8')
const changed = []

// ---------- 1. 检查依赖 ----------
if (!t.includes('ROLE_LEVEL')) {
  // fitness.js 现有 common 引入
  const m = t.match(/const \{([^}]*)\} = require\('\.\/common'\)/)
  if (!m) throw new Error('找不到 common 引入')
  if (!m[1].includes('ROLE_LEVEL')) {
    t = t.replace(m[0], m[0].replace('} =', ", ROLE_LEVEL } =").replace("', ROLE_LEVEL", ", ROLE_LEVEL"))
  }
  changed.push('补 ROLE_LEVEL 引入')
}

// ---------- 2. memberFitness 放开到任何会员，且身体数据不再隐藏 ----------
const oldMemberFitness = `async function memberFitness({ me, data }) {
  need(me, 'coach')
  const target = memberRow((await query('select * from members where openid = $1', [data.openid])).rows[0])
  if (!target) fail('会员不存在')
  return fitnessOf(target, false)
}`

const newMemberFitness = `// 任何会员都能看别人的身体数据（含历史）；前台不需要是教练
async function memberFitness({ me, data }) {
  need(me, 'member')
  const target = memberRow((await query('select * from members where openid = $1', [data.openid])).rows[0])
  if (!target) fail('会员不存在')
  // 第二个参数是「是否隐藏身体明细」，现在对所有人可见
  return fitnessOf(target, true)
}`

if (t.includes(oldMemberFitness)) {
  t = t.replace(oldMemberFitness, newMemberFitness)
  changed.push('memberFitness 放开到会员，身体数据不再隐藏')
} else {
  console.log('⚠ memberFitness 原文未匹配')
  const i = t.indexOf('async function memberFitness')
  console.log(t.slice(i, i + 300))
}

// ---------- 3. 新增 memberProfile（公开资料） ----------
if (!t.includes('async function memberProfile')) {
  const fn = `// 会员公开资料：任何人都能看，手机号只给自己 / 教练 / 管理员
async function memberProfile({ me, data }) {
  need(me, 'member')
  const m = memberRow((await query('select * from members where openid = $1', [data.openid])).rows[0])
  if (!m) fail('会员不存在')
  const myLevel = ROLE_LEVEL[me.role] || 0
  const canSeePhone = m._id === me._id || myLevel >= ROLE_LEVEL.coach
  return {
    _id: m._id,
    nickName: m.nickName || '',
    avatar: m.avatar || '',
    role: m.role,
    roleName: ROLE_NAMES[m.role] || '会员',
    gender: m.gender || '',
    height: m.height || 0,
    phone: canSeePhone ? (m.phone || '') : '',
    since: m.createdAt ? cnDate(m.createdAt) : '',
    isMe: m._id === me._id,
    bestLift: m.bestLift || {},
    sbdTotal: m.sbdTotal || 0
  }
}

`
  // 插到 memberFitness 之前
  t = t.replace('// 任何会员都能看别人的身体数据', fn + '// 任何会员都能看别人的身体数据')
  changed.push('新增 memberProfile')
}

// ---------- 4. 导出 ----------
t = t.replace(
  '  myFitness, memberFitness, leaderboard, setBodyPublic, bodyTrend,',
  '  myFitness, memberFitness, memberProfile, leaderboard, setBodyPublic, bodyTrend,'
)

fs.writeFileSync(F, t)
console.log(changed.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', F])
console.log('✓ 语法通过')
