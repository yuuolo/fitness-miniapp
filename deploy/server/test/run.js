// 自建后端集成测试：直连 PostgreSQL，逐条验证迁移后的业务规则。
// 用法：DATABASE_URL=postgres://postgres:pw@db:5432/gym_test node test/run.js
// 会清空目标库的所有业务表，请只对测试库执行。
// 生产库保护：测试会清表，绝不能在 gym 上跑
require('./_guard')
const assert = require('assert')
const crypto = require('crypto')
const { query, pool, ensureSchema } = require('../lib/db')
const { memberRow } = require('../lib/common')

const modules = {}
for (const name of ['system', 'member', 'admin', 'fitness', 'moment']) {
  Object.assign(modules, require('../lib/' + name))
}

const TABLES = [
  'config', 'members',
  'body_records', 'strength_records', 'activity_records', 'moments', 'media',
  'competitions', 'competition_entries'
]

let passed = 0
function ok(name) {
  passed++
  console.log('  \u2713 ' + name)
}

async function act(action, openid, data) {
  const me = memberRow((await query('select * from members where openid = $1', [openid])).rows[0])
  return modules[action]({ openid, me, data: data || {} })
}

async function expectFail(fn, contains, name) {
  let err = null
  try {
    await fn()
  } catch (e) {
    err = e
  }
  assert.ok(err, name + ' 应该失败但成功了')
  if (contains) assert.ok(err.message.indexOf(contains) >= 0, name + ' 错误文案不符：' + err.message)
  ok(name)
}

async function ensureMember(openid) {
  await query(
    'insert into members (openid, created_at) values ($1, $2) on conflict (openid) do nothing',
    [openid, Date.now()]
  )
}

// 直接按后端签名规则构造入场码（小程序只拿二维码图片，测试需要原始字符串）

async function main() {
  await ensureSchema()
  await query('truncate ' + TABLES.join(', ') + ' restart identity cascade')
  // 排行榜项目不再由 schema.sql 播种（否则删掉的会被重启补回），测试库要手动初始化
  await require('../lib/lift-items').ensureSeed()
  console.log('表已清空，开始测试\n')

  const ADMIN = 'openid-admin'
  const STAFF = 'openid-staff'
  const COACH = 'openid-coach'
  const MEMBER = 'openid-member'
  for (const id of [ADMIN, STAFF, COACH, MEMBER]) await ensureMember(id)

  // ---------- 系统初始化 ----------
  assert.deepStrictEqual(await act('systemStatus', MEMBER), { initialized: false })
  ok('初始化前 systemStatus 为 false')

  await act('bootstrap', ADMIN)
  assert.deepStrictEqual(await act('systemStatus', MEMBER), { initialized: true })
  const adminMe = memberRow((await query('select * from members where openid = $1', [ADMIN])).rows[0])
  assert.strictEqual(adminMe.role, 'admin')
  ok('首个初始化者成为管理员')

  await expectFail(() => act('bootstrap', MEMBER), '已经初始化', '重复初始化被拒绝')
  // 系统初始化不再预置卡种/场地/课程（这三块功能已删除）
  ok('初始化完成（不再预置卡种/场地/课程）')

  // ---------- 资料与权限 ----------
  await expectFail(() => act('updateProfile', MEMBER, { phone: '123' }), '11 位手机号', '手机号格式校验')
  await act('updateProfile', MEMBER, { nickName: '小明', phone: '13800001111' })
  const homeView = await act('home', MEMBER)
  assert.strictEqual(homeView.me.profileReady, true)
  ok('会员可更新资料，home 返回 profileReady')

  await act('updateProfile', COACH, { nickName: '教练一号', phone: '13800002222' })
  await act('updateProfile', STAFF, { nickName: '管理二号', phone: '13800003333' })
  await act('setRole', ADMIN, { openid: COACH, role: 'coach' })
  // 「前台」角色已移除，这个账号改成第二个管理员（用于验证后台操作）
  await act('setRole', ADMIN, { openid: STAFF, role: 'admin' })
  ok('管理员设置教练 / 管理员角色')

  await expectFail(() => act('setRole', ADMIN, { openid: ADMIN, role: 'member' }), '自己的角色', '不能改自己的角色')
  await expectFail(() => act('searchMembers', MEMBER, { keyword: 'x' }), '没有权限', '普通会员不能用员工接口')

  // ---------- 员工台 ----------
  const byPhone = await act('searchMembers', STAFF, { keyword: '13800001111' })
  assert.ok(byPhone.some(m => m._id === MEMBER))
  const byName = await act('searchMembers', STAFF, { keyword: '小明' })
  assert.ok(byName.some(m => m._id === MEMBER))
  const detail = await act('memberDetail', STAFF, { openid: MEMBER })
  assert.ok(detail.member && detail.member._id === MEMBER)
  ok('员工搜索会员、会员详情')

  const coaches = await act('listCoaches', STAFF)
  assert.ok(coaches.some(c => c._id === COACH && c.role === 'coach'))
  ok('列出可选教练')

  // ---------- 健身数据 ----------
  await expectFail(
    () => act('saveBodyRecord', MEMBER, { openid: MEMBER, weight: 70 }),
    '没有权限', '普通会员不能录身体数据'
  )

  // 教练也能查会员、录数据
  const coachSearch = await act('searchMembers', COACH, { keyword: '小明' })
  assert.ok(coachSearch.some(m => m._id === MEMBER), '教练应能搜索会员')
  const coachDetail = await act('memberDetail', COACH, { openid: MEMBER })
  assert.ok(coachDetail.member, '教练应能看会员详情')
  ok('教练可以搜索会员、查看会员详情')

  const coachBody = await act('saveBodyRecord', COACH, {
    openid: MEMBER, weight: 73, height: 175, bodyFat: 17, deviceName: '教练录入'
  })
  assert.ok(coachBody.score > 0, '教练录入的身体数据应算出评分')
  // 用引体向上（比次数）验证力量录入，避免动到 SBD 合计影响后面的断言
  const coachStrength = await act('saveStrength', COACH, { openid: MEMBER, lift: 'pullup', weight: 0, reps: 12 })
  assert.strictEqual(coachStrength.oneRM, 12, '教练应能录力量成绩（引体按次数）')
  ok('教练可以给会员录身体数据与力量成绩')

  await expectFail(
    () => act('setRole', COACH, { openid: MEMBER, role: 'admin' }),
    '没有权限', '教练不能改角色'
  )

  // 教练不能改别人的昵称/手机号/头像（身份标识只能本人或管理员改）
  await expectFail(
    () => act('staffUpdateProfile', COACH, { openid: MEMBER, phone: '13800001112' }),
    '没有权限', '教练不能修改别人资料（昵称/手机号/头像）'
  )
  await expectFail(
    () => act('staffUpdateProfile', COACH, { openid: ADMIN, nickName: '被改的管理员' }),
    '没有权限', '教练连管理员的资料也改不了'
  )

  // 管理员可以代会员补资料
  const updated = await act('staffUpdateProfile', STAFF, { openid: MEMBER, phone: '13800001112', height: 176 })
  assert.strictEqual(updated.phone, '13800001112')
  assert.strictEqual(Number(updated.height), 176)
  ok('管理员可以代会员修改手机号与身高')

  await expectFail(
    () => act('staffUpdateProfile', STAFF, { openid: STAFF, phone: '13800009999' }),
    '请在「我的」里修改自己的资料', '管理员也不能通过这个接口改自己'
  )
  await expectFail(
    () => act('staffUpdateProfile', ADMIN, { openid: ADMIN, nickName: '自己' }),
    '请在「我的」里修改自己的资料', '不能通过这个接口改自己（要走个人资料页）'
  )
  const adminEdit = await act('staffUpdateProfile', ADMIN, { openid: STAFF, gender: 'male' })
  assert.strictEqual(adminEdit.gender, 'male')
  ok('管理员可以改教练资料')

  const body = await act('saveBodyRecord', STAFF, {
    openid: MEMBER, weight: 72.5, height: 175, bodyFat: 18, muscle: 55, visceral: 8, deviceName: 'S800'
  })
  assert.strictEqual(body.bmi, 23.7)
  assert.ok(body.score > 0)
  ok('录入身体数据并算 BMI / 评分')

  const strength = await act('saveStrength', STAFF, { openid: MEMBER, lift: 'bench', weight: 100, reps: 5 })
  assert.strictEqual(strength.oneRM, 116.7)
  assert.strictEqual(strength.improved, true)
  const squat = await act('saveStrength', STAFF, { openid: MEMBER, lift: 'squat', weight: 140, reps: 3 })
  assert.strictEqual(squat.oneRM, 154)
  const mine = await act('myFitness', MEMBER)
  assert.strictEqual(mine.sbdTotal, 270.7)
  assert.strictEqual(mine.latestBody.weight, 72.5)
  ok('力量成绩 Epley 估算 + SBD 合计')

  await act('saveActivity', STAFF, { openid: MEMBER, type: 'run', steps: 8000, duration: 45, calories: 400 })
  await act('saveActivity', STAFF, { openid: MEMBER, type: 'run', steps: 9000, duration: 50, calories: 450 })
  const acts = (await query('select * from activity_records where openid = $1', [MEMBER])).rows
  assert.strictEqual(acts.length, 1)
  assert.strictEqual(acts[0].steps, 9000)
  ok('运动数据同一天同来源幂等覆盖')

  const trend = await act('bodyTrend', MEMBER, { days: 30 })
  // 教练录了一次、管理员又录了一次，所以至少有 2 个点
  assert.ok(trend.count >= 2, '趋势应包含多次体测记录，实际 ' + trend.count)
  assert.ok(trend.points.every(p => p.date), '每个点都应带日期')
  ok('身体数据趋势返回一段时间的点')

  const boardBefore = await act('leaderboard', MEMBER, { lift: 'bench', metric: 'relative' })
  assert.strictEqual(boardBefore.total, 0)
  await act('setBodyPublic', MEMBER, { isPublic: true })
  const boardAfter = await act('leaderboard', MEMBER, { lift: 'bench', metric: 'relative' })
  assert.strictEqual(boardAfter.total, 1)
  assert.strictEqual(boardAfter.me.isMe, true)
  ok('相对体重榜只收自愿公开体重的会员')

  await act('setBodyPublic', MEMBER, { isPublic: false })
  const staffView = await act('memberFitness', STAFF, { openid: MEMBER })
  assert.strictEqual(staffView.latestBody.weight, null)
  assert.ok(staffView.latestBody.score > 0)
  ok('未公开身体数据时只暴露评分')

  // 友圈测试需要第二个会员（点赞、删别人的动态）
  const OTHER = 'openid-other'
  await ensureMember(OTHER)
  await act('updateProfile', OTHER, { nickName: '小红', phone: '13800004444' })

  // ---------- 健身友圈 ----------
  await expectFail(() => act('postMoment', MEMBER, { content: '' }), '写点什么', '空动态被拒绝')
  const moment1 = await act('postMoment', MEMBER, { content: '今天卧推 PR', media: [] })
  assert.strictEqual(moment1.type, 'text')
  assert.strictEqual(moment1.authorName, '小明')
  ok('会员发动态')

  const byCoach = await act('postMoment', COACH, { openid: MEMBER, content: '教练代拍' })
  assert.strictEqual(byCoach.authorName, '小明')
  assert.strictEqual(byCoach.coachName, '教练一号')
  ok('教练可以帮会员代拍')

  const list = await act('momentList', MEMBER, {})
  assert.ok(list.list.length >= 2)
  assert.strictEqual(list.list[0].isMine, true)
  ok('友圈列表按时间倒序')

  assert.deepStrictEqual(await act('likeMoment', OTHER, { id: moment1._id }), { liked: true, likeCount: 1 })
  assert.deepStrictEqual(await act('likeMoment', OTHER, { id: moment1._id }), { liked: false, likeCount: 0 })
  ok('点赞与取消点赞')

  await expectFail(() => act('deleteMoment', OTHER, { id: moment1._id }), '只能删除自己', '不能删别人的动态')
  await act('deleteMoment', MEMBER, { id: moment1._id })
  await expectFail(() => act('momentDetail', MEMBER, { id: moment1._id }), '不存在', '删除后详情不可见')

  const coachShort = (await query('select short from moments where id = $1', [byCoach._id])).rows[0].short
  const byShort = await act('momentByShort', MEMBER, { short: coachShort })
  assert.strictEqual(byShort._id, byCoach._id)
  await act('setPosterQr', STAFF, { fileID: 'https://gym.novrein.com/static/qr.jpg' })
  assert.strictEqual(
    (await query("select value from config where key = 'posterQr'")).rows[0].value.fileID,
    'https://gym.novrein.com/static/qr.jpg'
  )
  ok('短码反查动态 + 静态小程序码兜底配置')

}

main()
  .then(() => pool.end())
  .catch(err => {
    console.error('\n测试失败：', err)
    pool.end().finally(() => process.exit(1))
  })
