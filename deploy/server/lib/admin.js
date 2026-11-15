// 员工/管理员操作：工作台、会员、卡务、排课、签到、娱乐项目
const { query, tx } = require('./db')
const { fail, need, memberRow, memberLabel, ROLE_LEVEL } = require('./common')


// 事务外也能复用同一套写函数
const db = { query }

function int(v, min, max, label) {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) fail(label + '需为 ' + min + '–' + max + ' 的整数')
  return n
}

function text(v, min, max, label) {
  const s = String(v === undefined || v === null ? '' : v).trim()
  if (s.length < min || s.length > max) fail(label + (min ? '需为 ' + min + '–' + max + ' 个字' : '不能超过 ' + max + ' 个字'))
  return s
}

function likeEscape(s) {
  return String(s).replace(/[\\%_]/g, c => '\\' + c)
}

// 各表主键列名（members 用 openid 作主键）
const PK = { members: 'openid' }

async function getRow(table, id) {
  const key = PK[table] || 'id'
  const { rows } = await query(`select * from ${table} where ${key} = $1`, [id])
  return rows[0] || null
}

// ---------- 会员 ----------

async function searchMembers({ me, data }) {
  need(me, 'coach')
  const kw = String(data.keyword || '').trim()
  if (!kw) {
    return (await query('select * from members order by created_at desc limit 50')).rows.map(memberRow)
  }
  const pattern = '%' + likeEscape(kw) + '%'
  const column = /^\d+$/.test(kw) ? 'phone' : 'nick_name'
  return (await query(
    `select * from members where ${column} ilike $1 order by created_at desc limit 50`, [pattern]
  )).rows.map(memberRow)
}

async function memberDetail({ me, data }) {
  need(me, 'coach')
  const member = memberRow((await query('select * from members where openid = $1', [data.openid])).rows[0])
  if (!member) fail('会员不存在')
  return { member }
}




async function setRole({ me, data }) {
  need(me, 'admin')
  if (!Object.prototype.hasOwnProperty.call(ROLE_LEVEL, data.role)) fail('未知角色')
  // 「前台」角色已移除，历史数据在启动时会被迁移成管理员
  if (data.openid === me._id) fail('不能修改自己的角色')
  const member = await getRow('members', data.openid)
  if (!member) fail('会员不存在')
  await query('update members set role = $2 where openid = $1', [member.openid, data.role])
  return { role: data.role }
}

// 前台/管理员代会员补充基本资料（会员自己不会填手机号时常用）
//
// 权限刻意收紧：
//   1. 只有前台（staff）及以上能改，**教练不行**——昵称/手机号/头像是身份标识，
//      教练能改就等于能冒充别人，也会让员工工作台里的记录对不上人。
//   2. 只能改「比自己级别低」的账号：前台能改会员和教练，不能改别的前台和管理员；
//      管理员可以改所有人。避免互相改资料造成权限混乱。
//   3. 头像不走这里，只能本人在「我的」里换，杜绝代换头像。
async function staffUpdateProfile({ me, data }) {
  need(me, 'admin')
  const target = memberRow((await query('select * from members where openid = $1', [data.openid])).rows[0])
  if (!target) fail('会员不存在')

  if (target._id === me._id) fail('请在「我的」里修改自己的资料')
  const myLevel = ROLE_LEVEL[me.role] || 0
  const targetLevel = ROLE_LEVEL[target.role] || 0
  if (myLevel < ROLE_LEVEL.admin && targetLevel >= myLevel) {
    fail('只能修改级别比自己低的账号资料')
  }

  const sets = []
  const values = [target._id]
  const push = (column, value) => { values.push(value); sets.push(column + ' = $' + values.length) }

  if (data.nickName !== undefined) {
    const n = String(data.nickName).trim()
    if (!n || n.length > 20) fail('昵称需为 1–20 个字')
    push('nick_name', n)
  }
  if (data.phone !== undefined) {
    const p = String(data.phone).trim()
    if (p && !/^1\d{10}$/.test(p)) fail('手机号需为 11 位')
    push('phone', p)
  }
  if (data.gender !== undefined) {
    const g = String(data.gender)
    if (!['male', 'female', ''].includes(g)) fail('性别取值不正确')
    push('gender', g)
  }
  if (data.height !== undefined) {
    const h = Number(data.height) || 0
    if (h && (h < 80 || h > 250)) fail('身高需在 80–250 之间')
    push('height', h)
  }
  if (!sets.length) fail('没有要修改的内容')

  await query(`update members set ${sets.join(', ')} where openid = $1`, values)
  return memberRow((await query('select * from members where openid = $1', [target._id])).rows[0])
}


// ---------- 课程 ----------

async function listCoaches({ me }) {
  need(me, 'admin')
  const list = (await query(
    "select * from members where role in ('coach', 'admin') limit 100"
  )).rows.map(memberRow)
  return list.map(m => ({ _id: m._id, name: memberLabel(m), role: m.role }))
}










module.exports = {
  searchMembers, memberDetail, staffUpdateProfile,  setRole,  listCoaches
}
