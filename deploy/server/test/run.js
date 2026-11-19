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
for (const name of ['system', 'member', 'admin', 'fitness', 'moment', 'competition', 'challenge', 'subscriptions']) {
  Object.assign(modules, require('../lib/' + name))
}

const TABLES = [
  'config', 'members',
  'body_records', 'strength_records', 'activity_records', 'moments', 'media',
  'competitions', 'competition_entries',
  'challenges', 'challenge_videos', 'challenge_comments', 'challenge_comment_likes',
  'notify_subscriptions'
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

  // 排行榜默认项目：最近有成绩变化的那一项
  await act('saveStrength', STAFF, { openid: MEMBER, lift: 'squat', weight: 120, reps: 5 })
  const autoBoard = await act('leaderboard', MEMBER, { period: 'week' })
  assert.strictEqual(autoBoard.lift, 'squat', '默认应显示最近有更新的项目，实际 ' + autoBoard.lift)
  assert.strictEqual(autoBoard.autoPicked, true, '应标记为自动选中')
  assert.ok(autoBoard.recentAt > 0, '应带最近变化的时间')
  const manualBoard = await act('leaderboard', MEMBER, { lift: 'bench', period: 'week' })
  assert.strictEqual(manualBoard.lift, 'bench', '指定项目时按指定来')
  assert.strictEqual(manualBoard.autoPicked, false, '指定项目时不应标记自动')

  // 换个项目再练一次，默认应该跟着变
  await act('saveStrength', STAFF, { openid: MEMBER, lift: 'deadlift', weight: 150, reps: 3 })
  const autoBoard2 = await act('leaderboard', MEMBER, { period: 'week' })
  assert.strictEqual(autoBoard2.lift, 'deadlift', '默认应跟着最新变化走，实际 ' + autoBoard2.lift)
  ok('排行榜默认显示最近有变化的项目')

  await act('saveActivity', STAFF, { openid: MEMBER, type: 'run', steps: 8000, duration: 45, calories: 400 })
  await act('saveActivity', STAFF, { openid: MEMBER, type: 'run', steps: 9000, duration: 50, calories: 450 })
  const acts = (await query('select * from activity_records where openid = $1', [MEMBER])).rows
  assert.strictEqual(acts.length, 1)
  assert.strictEqual(acts[0].steps, 9000)
  ok('运动数据同一天同类型幂等覆盖')

  // 每种运动只收集自己的指标：骑行不写步数，步行必须填步数
  await expectFail(
    () => act('saveActivity', STAFF, { openid: MEMBER, type: 'cycling', steps: 8000 }),
    '至少要填', '骑行只填步数应被拒绝'
  )
  await expectFail(
    () => act('saveActivity', STAFF, { openid: MEMBER, type: 'walk' }),
    '需要填写步数', '步行不填步数应被拒绝'
  )
  await expectFail(
    () => act('saveActivity', STAFF, { openid: MEMBER, type: 'strength', steps: 3000 }),
    '需要填', '力量训练填步数应被拒绝'
  )

  await act('saveActivity', STAFF, {
    openid: MEMBER, type: 'cycling', distance: 20.5, duration: 60, steps: 9999
  })
  const cyc = (await query(
    "select * from activity_records where openid = $1 and type = 'cycling'", [MEMBER]
  )).rows[0]
  assert.ok(cyc, '骑行记录应写入')
  assert.strictEqual(Number(cyc.distance), 20.5, '骑行要保存距离')
  assert.strictEqual(cyc.steps, 0, '骑行不应被写进步数')

  const acts2 = (await query('select type from activity_records where openid = $1 order by type', [MEMBER])).rows
  assert.ok(acts2.length >= 2, '同一会员同一天应能记录多种运动，实际 ' + acts2.length)
  ok('运动数据按类型区分字段（骑行存距离、步行需步数、同天可多类型）')

  const trend = await act('bodyTrend', MEMBER, { days: 30 })
  // 教练录了一次、管理员又录了一次，所以至少有 2 个点
  assert.ok(trend.count >= 2, '趋势应包含多次体测记录，实际 ' + trend.count)
  assert.ok(trend.points.every(p => p.date), '每个点都应带日期')
  ok('身体数据趋势返回一段时间的点')

  // 相对力量：三项各占三分之一
  // 0 项 = 0 分（分母仍算 40）；1 项 ≤ 13.3；2 项 ≤ 26.7；3 项 = 40
  {
    const capId = 'openid-scorecap'
    await ensureMember(capId)
    await act('updateProfile', capId, { nickName: '评分封顶测试', phone: '13800008888' })

    // 一项都没有：记 0 分，且带着说明
    await act('saveBodyRecord', STAFF, { openid: capId, weight: 70, height: 175, bodyFat: 15 })
    const zeroFit = await act('memberFitness', COACH, { openid: capId })
    const zeroDetail = (zeroFit.latestBody.detail || []).find(d => d.key === 'strength')
    assert.ok(zeroDetail, '没录力量时也要有相对力量这一项（记 0 分）')
    assert.strictEqual(zeroDetail.score, 0, '一项都没录时相对力量应为 0 分')
    assert.ok(/先按 0 分算/.test(zeroDetail.note || ''), '应说明还没录成绩')

    // 只录一项卧推（100kg / 体重 70kg = 1.43 倍）：上限 40/3 = 13.3
    await act('saveStrength', STAFF, { openid: capId, lift: 'bench', weight: 100, reps: 1 })
    const oneFit = await act('memberFitness', COACH, { openid: capId })
    const oneDetail = (oneFit.latestBody.detail || []).find(d => d.key === 'strength')
    assert.strictEqual(oneDetail.count, 1, '应记录已录 1 项')
    assert.ok(oneDetail.score <= 13.4, '只录一项时最多 13.3 分，实际 ' + oneDetail.score)
    assert.ok(/已录 1\/3 项/.test(oneDetail.note || ''), '应提示已录 1/3 项：' + oneDetail.note)
    assert.ok(/深蹲|硬拉/.test(oneDetail.note || ''), '应提示还差哪几项')

    // 再补深蹲：上限 40*2/3 = 26.7
    await act('saveStrength', STAFF, { openid: capId, lift: 'squat', weight: 150, reps: 1 })
    const twoFit = await act('memberFitness', COACH, { openid: capId })
    const twoDetail = (twoFit.latestBody.detail || []).find(d => d.key === 'strength')
    assert.strictEqual(twoDetail.count, 2)
    assert.ok(twoDetail.score <= 26.8, '录两项时最多 26.7 分，实际 ' + twoDetail.score)
    assert.ok(twoDetail.score > oneDetail.score, '补一项后分数应上升')

    // 补齐三项：不再封顶，按比例最多 40
    await act('saveStrength', STAFF, { openid: capId, lift: 'deadlift', weight: 180, reps: 1 })
    const fullFit = await act('memberFitness', COACH, { openid: capId })
    const fullDetail = (fullFit.latestBody.detail || []).find(d => d.key === 'strength')
    assert.strictEqual(fullDetail.count, 3)
    assert.ok(fullDetail.score > 26.8, '三项齐全后可以超过 26.7 分，实际 ' + fullDetail.score)
    assert.ok(!fullDetail.capped, '三项齐全时不应标记封顶')
    assert.strictEqual(fullDetail.note, '', '三项齐全时没有缺项说明')
    ok('相对力量：0 项记 0 分，1 项≤13.3，2 项≤26.7，3 项满分 40')
  }

  // 评分动态：成绩变化后不重新录体测，分数也要立刻变；库里的旧分数不参与展示
  const DYN_ID = 'openid-dynscore'
  await ensureMember(DYN_ID)
  await act('updateProfile', DYN_ID, { nickName: '动态评分', phone: '13800009900' })
  await act('saveBodyRecord', STAFF, { openid: DYN_ID, weight: 70, height: 175, bodyFat: 15 })
  const dyn0 = await act('memberFitness', COACH, { openid: DYN_ID })
  assert.ok(dyn0.latestBody, '应有最新身体数据')
  const dynZero = (dyn0.latestBody.detail || []).find(d => d.key === 'strength')
  assert.ok(dynZero, '没力量成绩时也应有相对力量项')
  assert.strictEqual(dynZero.score, 0, '没力量成绩时相对力量记 0 分')

  // 只录一项：相对力量封顶 15
  await act('saveStrength', STAFF, { openid: DYN_ID, lift: 'bench', weight: 100, reps: 1 })
  const dyn1 = await act('memberFitness', COACH, { openid: DYN_ID })
  const strength1 = (dyn1.latestBody.detail || []).find(d => d.key === 'strength')
  assert.ok(strength1 && strength1.score <= 15, '只录一项时相对力量应 ≤ 15')

  // 补齐三项：分数立刻上升（没有重新录体测）
  await act('saveStrength', STAFF, { openid: DYN_ID, lift: 'squat', weight: 140, reps: 1 })
  await act('saveStrength', STAFF, { openid: DYN_ID, lift: 'deadlift', weight: 170, reps: 1 })
  const dyn2 = await act('memberFitness', COACH, { openid: DYN_ID })
  const strength2 = (dyn2.latestBody.detail || []).find(d => d.key === 'strength')
  assert.ok(strength2.score > strength1.score, '补齐三项后相对力量应立刻提高，实际 ' + strength2.score + ' vs ' + strength1.score)
  assert.ok(dyn2.latestBody.score > dyn1.latestBody.score, '总分也应立刻提高')

  // 篡改库里的缓存分数，接口返回不应受影响
  await query(
    "update members set latest_body = jsonb_set(latest_body, '{score}', '999'::jsonb) where openid = $1",
    [DYN_ID]
  )
  await query("update body_records set score = 999 where openid = $1", [DYN_ID])
  const dyn3 = await act('memberFitness', COACH, { openid: DYN_ID })
  assert.notStrictEqual(dyn3.latestBody.score, 999, '不应该直接读库里缓存的分数')
  assert.strictEqual(dyn3.latestBody.score, dyn2.latestBody.score, '每次查看都按当前规则实时计算')
  const hist3 = (dyn3.bodyHistory || [])[0]
  assert.notStrictEqual(hist3.score, 999, '历史记录的分数也应实时算')
  ok('评分是动态的：改成绩立刻生效，不读库里缓存')

  // 历史按测量日期排序；补录旧日期不能把「最新档案」改成旧的
  const ORD_ID = 'openid-order'
  await ensureMember(ORD_ID)
  await act('updateProfile', ORD_ID, { nickName: '排序测试', phone: '13800007700' })
  await act('saveBodyRecord', STAFF, { openid: ORD_ID, weight: 70, height: 175, bodyFat: 18, date: '2026-05-10' })
  await act('saveBodyRecord', STAFF, { openid: ORD_ID, weight: 75, height: 175, bodyFat: 20, date: '2026-06-10' })
  // 最后补录一条更早的记录
  await act('saveBodyRecord', STAFF, { openid: ORD_ID, weight: 68, height: 175, bodyFat: 16, date: '2026-04-10' })

  const ordFit = await act('memberFitness', COACH, { openid: ORD_ID })
  const dates = (ordFit.bodyHistory || []).map(b => b.date)
  assert.deepStrictEqual(dates, ['2026-06-10', '2026-05-10', '2026-04-10'], '历史应按测量日期倒序，实际 ' + dates.join(','))
  assert.strictEqual(ordFit.latestBody.date, '2026-06-10', '最新档案应是测量日期最新的那条，实际 ' + ordFit.latestBody.date)
  assert.strictEqual(Number(ordFit.latestBody.weight), 75, '最新档案的体重也要对应最新日期')
  ok('身体数据历史按测量日期排序，补录旧日期不影响最新档案')

  // 上传/展示限制：管理页可配，服务端校验，列表按配置截断
  const limits = require('../lib/limits')
  const homeLimits = await act('home', MEMBER)
  assert.ok(homeLimits.mediaLimits, '首页接口应下发上传限制')
  assert.strictEqual(homeLimits.mediaLimits.maxDuration, 15, '默认视频时长应为 15 秒')
  assert.strictEqual(homeLimits.mediaLimits.maxCount, 9, '默认数量应为 9 个')

  // 配一套更严格的限制
  const saved = await limits.save({ maxDuration: 10, maxVideoMB: 8, maxCount: 3, maxTotalMB: 12, feedThumbs: 2 }, 'test')
  assert.strictEqual(saved.maxDuration, 10)
  assert.strictEqual(saved.maxCount, 3)
  const home2 = await act('home', MEMBER)
  assert.strictEqual(home2.mediaLimits.maxDuration, 10, '首页应立刻读到新配置')

  const url = i => 'https://gym.example.com/api/media/f' + i

  // 超过数量
  await expectFail(
    () => act('postMoment', MEMBER, {
      content: '四个',
      media: [1, 2, 3, 4].map(i => ({ fileID: url(i), type: 'image', size: 1000 }))
    }),
    '最多 3', '超过数量上限应被拒'
  )
  // 视频超时长
  await expectFail(
    () => act('postMoment', MEMBER, {
      content: '视频太长',
      media: [{ fileID: url('v'), type: 'video', duration: 20, size: 1000 }]
    }),
    '秒', '视频超时长应被拒'
  )
  // 视频超体积（8MB 上限）
  await expectFail(
    () => act('postMoment', MEMBER, {
      content: '视频太大',
      media: [{ fileID: url('v2'), type: 'video', duration: 5, size: 9 * 1024 * 1024 }]
    }),
    'MB', '视频超体积应被拒'
  )
  // 合计超体积（12MB 上限）
  await expectFail(
    () => act('postMoment', MEMBER, {
      content: '合计太大',
      media: [1, 2, 3].map(i => ({ fileID: url('t' + i), type: 'image', size: 5 * 1024 * 1024 }))
    }),
    'MB', '合计超体积应被拒'
  )
  ok('媒体数量/时长/体积上限生效')

  // 合法的一条，列表按 feedThumbs=2 截断
  await act('postMoment', MEMBER, {
    content: '三个小图',
    media: [1, 2, 3].map(i => ({ fileID: url('ok' + i), type: 'image', size: 1000 }))
  })
  const feed = await act('momentList', MEMBER, {})
  const first = feed.list[0]
  assert.strictEqual(first.media.length, 2, '列表应只返回 2 个媒体')
  assert.strictEqual(first.hiddenMedia, 1, '应提示还有 1 个没显示')
  assert.strictEqual(first.mediaCount, 3, '应带上总数')
  const feedDetail = await act('momentDetail', MEMBER, { id: first._id })
  assert.strictEqual(feedDetail.media.length, 3, '详情页仍然能看到全部 3 个')
  ok('列表按配置截断缩略图，详情仍然完整')

  // 越界配置要被拒
  // 现在允许到 3600 秒，所以用远超上限的值来测范围校验
  await expectFail(() => limits.save({ maxDuration: 9999 }, 'test'), '秒', '视频时长越界应被拒')
  await expectFail(() => limits.save({ maxCount: 0 }, 'test'), '个', '数量越界应被拒')

  // 恢复默认，避免影响后面的测试
  await limits.save({ maxDuration: 15, maxVideoMB: 12, maxCount: 9, maxTotalMB: 40, feedThumbs: 9 }, 'test')
  const homeBack = await act('home', MEMBER)
  assert.strictEqual(homeBack.mediaLimits.maxCount, 9, '限制应能恢复默认')
  ok('上传与展示限制可配置、可校验、可恢复')

  // 视频超时长自动裁切：生成 90 秒测试视频，按 60 秒裁切
  const video = require('../lib/video')
  const os = require('os')
  const path = require('path')
  const { execFileSync } = require('child_process')
  const src = path.join(os.tmpdir(), 'trim-test-' + Date.now() + '.mp4')
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi',
    '-i', 'testsrc=duration=90:size=320x240:rate=15',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '32', src])

  const info = await video.probe(src)
  assert.ok(info.duration >= 88 && info.duration <= 92, '测试视频应约 90 秒，实际 ' + info.duration)

  const cut = await video.prepare(src, { maxDuration: 60, ext: 'mp4', maxHeight: 720, maxBytes: 200 * 1024 * 1024 })
  assert.strictEqual(cut.trimmed, true, '超时长应触发裁切')
  assert.ok(cut.after.duration <= 62, '裁切后应不超过 60 秒，实际 ' + cut.after.duration)
  assert.ok(cut.after.bytes > 0, '裁切后文件不能为空')
  assert.ok(cut.after.bytes < cut.before.bytes, '裁切后体积应更小')

  const cut10 = await video.prepare(src, { maxDuration: 10, ext: 'mp4', maxHeight: 720, maxBytes: 200 * 1024 * 1024 })
  assert.ok(cut10.after.duration <= 12, '按 10 秒裁切后应不超过 12 秒，实际 ' + cut10.after.duration)

  const asIs = await video.prepare(cut10.path, { maxDuration: 60, ext: 'mp4', maxHeight: 720, maxBytes: 200 * 1024 * 1024 })
  assert.strictEqual(asIs.trimmed, false, '没超时长的视频不该被裁')
  ok('视频超时长自动裁切（90 秒 → 60 秒 / 10 秒）')

  // 限制的上限由管理员决定：可以超过 60 秒，也可以设成 0（不限）
  const big = await limits.save({ maxDuration: 300, maxVideoMB: 500, maxTotalMB: 1000, maxRawVideoMB: 800 }, 'test')
  assert.strictEqual(big.maxDuration, 300, '应允许把时长限制设到 300 秒')
  assert.strictEqual(big.maxVideoMB, 500, '应允许把成品体积设到 500MB')

  const unlimited = await limits.save({ maxDuration: 0, maxVideoMB: 0, maxTotalMB: 0, maxRawVideoMB: 0 }, 'test')
  assert.strictEqual(unlimited.maxDuration, 0, '0 表示不限时长')
  assert.strictEqual(unlimited.maxVideoMB, 0, '0 表示不限成品体积')
  assert.strictEqual(unlimited.maxTotalMB, 0, '0 表示不限合计体积')

  // 不限时：100 秒、180MB 的视频也能发
  const longOne = await act('postMoment', MEMBER, {
    content: '不限时长的视频',
    media: [{ fileID: 'https://gym.example.com/api/media/longvid', type: 'video', duration: 100, size: 180 * 1024 * 1024 }]
  })
  assert.ok(longOne && longOne._id, '不限时应当允许发 100 秒的视频')
  ok('限制可放开：支持 > 60 秒，0 表示不限')

  { // 删除力量成绩 / 会员自录运动 / 导入（整块独立作用域，避免变量和其他用例重名）
  // 管理员可以删除力量成绩，删完最好成绩与评分自动重算
  const delId = 'openid-strengthdel'
  await ensureMember(delId)
  await act('updateProfile', delId, { nickName: '删成绩测试', phone: '13800006611' })
  await act('saveBodyRecord', STAFF, { openid: delId, weight: 80, height: 180, bodyFat: 18 })
  await act('saveStrength', STAFF, { openid: delId, lift: 'bench', weight: 100, reps: 1 })
  const delFit1 = await act('memberFitness', COACH, { openid: delId })
  assert.ok(delFit1.bestLift.bench, '应先有卧推成绩')

  const delRow = await query('select id, one_rm from strength_records where openid = $1 and lift = $2', [delId, 'bench'])
  assert.strictEqual(delRow.rows.length, 1)
  // 教练不能删，管理员可以
  await expectFail(() => act('deleteStrength', COACH, { id: delRow.rows[0].id }), '权限', '教练不能删力量成绩')
  const delRes = await act('deleteStrength', ADMIN, { id: delRow.rows[0].id })
  assert.strictEqual(delRes.removed.lift, 'bench')
  assert.ok(!delRes.bestLift.bench, '删除后不该还留着卧推最好成绩')
  const delFit2 = await act('memberFitness', COACH, { openid: delId })
  assert.ok(!delFit2.bestLift.bench, '接口返回里也应没有卧推成绩')
  assert.strictEqual(Number(delFit2.sbdTotal), 0, '三项合计应归零')
  const delDetail = (delFit2.latestBody && delFit2.latestBody.detail) || []
  const delStrength = delDetail.find(d => d.key === 'strength')
  assert.ok(delStrength, '删光力量成绩后相对力量项仍在')
  assert.strictEqual(delStrength.score, 0, '删光力量成绩后相对力量应记 0 分')
  ok('管理员可以删除力量成绩，最好成绩与评分自动重算')

  // 会员可以自己录运动
  const actId = 'openid-selfactivity'
  await ensureMember(actId)
  await act('updateProfile', actId, { nickName: '自己记运动', phone: '13800005522' })
  const selfAct = await act('saveActivity', actId, { type: 'run', distance: 5.2, duration: 32 })
  assert.ok(selfAct._id, '会员应能自己保存运动记录')
  const actFit1 = await act('myFitness', actId)
  assert.ok((actFit1.activity || []).length >= 1, '自己录的运动应出现在我的数据里')
  assert.strictEqual(actFit1.activity[0].source, 'self', '自己录的来源应为 self')

  // 教练仍然可以代录别人的
  const coachAct = await act('saveActivity', STAFF, { openid: actId, type: 'walk', steps: 9000 })
  assert.ok(coachAct._id, '教练应能给别人代录')
  assert.strictEqual(coachAct.source, 'staff', '代录来源应为 staff')

  // 删除：自己删自己的可以，删别人的不行
  const actFit2 = await act('myFitness', actId)
  const runRec = (actFit2.activity || []).find(a => a.type === 'run')
  await expectFail(() => act('deleteActivity', 'openid-member', { id: runRec._id }), '只能删除自己', '不能删别人的运动')
  const delActRes = await act('deleteActivity', actId, { id: runRec._id })
  assert.strictEqual(delActRes.type, 'run')
  const actFit3 = await act('myFitness', actId)
  assert.ok(!(actFit3.activity || []).some(a => a.type === 'run'), '删掉后不该还有跑步记录')
  ok('会员可以自己记录运动（教练仍可代录），并能删除自己的记录')

  // 批量导入（设备/手环对接用）按外部 ID 去重
  const impRes1 = await act('importActivity', ADMIN, {
    items: [
      { openid: actId, date: '2026-11-10', type: 'run', distance: 8, duration: 45, source: 'apple_health', externalId: 'hk-1' },
      { openid: actId, date: '2026-11-11', type: 'walk', steps: 12000, source: 'huawei_health', externalId: 'hw-1' }
    ]
  })
  assert.strictEqual(impRes1.imported, 2, '应导入 2 条')
  const impRes2 = await act('importActivity', ADMIN, {
    items: [
      { openid: actId, date: '2026-11-10', type: 'run', distance: 8.5, duration: 46, source: 'apple_health', externalId: 'hk-1' }
    ]
  })
  assert.strictEqual(impRes2.updated, 1, '同一外部 ID 再导入应更新而不是新增')
  const impCount = await query(
    "select count(*)::int as n from activity_records where openid = $1 and source in ('apple_health','huawei_health')",
    [actId]
  )
  assert.strictEqual(impCount.rows[0].n, 2, '导入后应正好 2 条，不能重复堆积')
  await expectFail(() => act('importActivity', COACH, { items: [{ openid: actId }] }), '权限', '教练不能批量导入')
  ok('批量导入运动数据（按外部 ID 去重）')
  }
  { // 排行榜项目编辑
    const liftItems = require('../lib/lift-items')

    // 改名：深蹲 → 杠铃深蹲（key 不变，评分照旧）
    const renamed = await act('saveLiftItem', ADMIN, { key: 'squat', name: '杠铃深蹲', metric: 'oneRM', sort: 25 })
    assert.strictEqual(renamed.name, '杠铃深蹲')
    assert.strictEqual(renamed.key, 'squat', '改的是名称，key 不能变')
    assert.strictEqual(renamed.metric, 'oneRM', '评分标准项的比法必须保持估算 1RM')
    const afterRename = await act('leaderboard', MEMBER, { lift: 'squat' })
    assert.strictEqual(afterRename.liftName, '杠铃深蹲', '排行榜应显示新名称')

    // 标准三项的比法不能改
    await expectFail(
      () => act('saveLiftItem', ADMIN, { key: 'squat', name: '杠铃深蹲', metric: 'reps', sort: 25 }),
      '标准项', '卧推/深蹲/硬拉不能改比法'
    )

    // 已有成绩的项目不能改比法
    await act('saveStrength', STAFF, { openid: MEMBER, lift: 'squat', weight: 100, reps: 1 })
    const custom = await act('saveLiftItem', ADMIN, { name: '农夫行走', metric: 'maxWeight', sort: 90 })
    await act('saveStrength', STAFF, { openid: MEMBER, lift: custom.key, weight: 60, reps: 1 })
    await expectFail(
      () => act('saveLiftItem', ADMIN, { key: custom.key, name: '农夫行走', metric: 'reps', sort: 90 }),
      '已经有', '有成绩的项目不能改比法'
    )

    // 新项目没成绩时可以改比法
    const empty1 = await act('saveLiftItem', ADMIN, { name: '平板支撑', metric: 'volume', sort: 91 })
    const empty2 = await act('saveLiftItem', ADMIN, { key: empty1.key, name: '平板支撑', metric: 'reps', sort: 91 })
    assert.strictEqual(empty2.metric, 'reps', '没成绩的项目可以改比法')
    assert.strictEqual(empty2.unit, '次', '单位跟着比法走')

    // 清理：改回原名、删掉测试项目
    await act('saveLiftItem', ADMIN, { key: 'squat', name: '深蹲', metric: 'oneRM', sort: 20 })
    await act('deleteLiftItem', ADMIN, { key: empty1.key })
    await query('delete from strength_records where lift = $1', [custom.key])
    await act('deleteLiftItem', ADMIN, { key: custom.key })
    ok('排行榜项目可以编辑（改名/比法/排序）并有安全校验')
  { // 力量成绩附视频 + 友圈搜索
    const vid = 'https://gym.example.com/api/media/strengthvid123'

    // 带视频保存
    const withVideo = await act('saveStrength', STAFF, { openid: MEMBER, lift: 'bench', weight: 90, reps: 1, videoUrl: vid })
    assert.strictEqual(withVideo.videoUrl, vid, '保存后应带回视频地址')
    const fitWithVideo = await act('memberFitness', COACH, { openid: MEMBER })
    const rec = (fitWithVideo.strengthHistory || []).find(x => x.videoUrl)
    assert.ok(rec, '力量成绩历史里应能看到视频')
    assert.strictEqual(rec.videoUrl, vid)

    // 非法地址要拒绝
    await expectFail(
      () => act('saveStrength', STAFF, { openid: MEMBER, lift: 'bench', weight: 90, reps: 1, videoUrl: 'javascript:alert(1)' }),
      '视频地址', '非法视频地址应被拒'
    )
    ok('力量成绩可以附视频')

    // 不带视频也能正常保存（回归）
    const noVideo = await act('saveStrength', STAFF, { openid: MEMBER, lift: 'squat', weight: 100, reps: 1 })
    assert.strictEqual(noVideo.videoUrl, '')

    // 友圈搜索：1 个字就能搜（内容 / 作者）
    await act('postMoment', MEMBER, { content: '今天练了卧推 PR' })
    await act('postMoment', MEMBER, { content: '随便发一条' })
    const oneChar = await act('momentList', MEMBER, { keyword: '卧' })
    assert.ok(oneChar.list.some(m => m.content.indexOf('卧推') >= 0), '1 个字应该能搜到')
    assert.ok(oneChar.list.every(m => (m.content + m.authorName).indexOf('卧') >= 0), '搜索结果应只包含匹配项')

    // 作者名也参与搜索
    const authorName = oneChar.list.length ? oneChar.list[0].authorName : ''
    if (authorName) {
      const byAuthor = await act('momentList', MEMBER, { keyword: authorName.slice(0, 1) })
      assert.ok(byAuthor.list.length > 0, '按作者首字也能搜到')
    }

    // 只看视频
    await act('postMoment', MEMBER, {
      content: '视频动态',
      media: [{ fileID: 'https://gym.example.com/api/media/v1', type: 'video', duration: 5, size: 1000 }]
    })
    const onlyVideos = await act('momentList', MEMBER, { onlyVideo: true })
    assert.ok(onlyVideos.list.length >= 1, '应能筛出视频动态')
    assert.ok(onlyVideos.list.every(m => m.type === 'video'), '只看视频时结果应全是视频')
    ok('友圈支持按关键字搜索（1 个字起）和只看视频')
  { // 会员挑战（裁判制）P1
    const RIVAL = 'openid-rival'
    await ensureMember(RIVAL)
    await act('updateProfile', RIVAL, { nickName: '挑战对手', phone: '13800003344' })
    // 把 COACH 设成教练、MEMBER 设成会员
    await act('setRole', ADMIN, { openid: COACH, role: 'coach' })
    await act('setRole', ADMIN, { openid: MEMBER, role: 'member' })
    await act('setRole', ADMIN, { openid: RIVAL, role: 'member' })

    // 裁判候选只有教练
    const refs = await act('refereeOptions', MEMBER)
    assert.ok(refs.some(r => r._id === COACH), '教练应出现在裁判候选里')
    assert.ok(!refs.some(r => r._id === MEMBER), '普通会员不能当裁判')

    // 发起校验
    await expectFail(
      () => act('createChallenge', MEMBER, { opponent: RIVAL, liftKey: 'bench' }),
      '主裁判', '不指定裁判应被拒'
    )
    // 裁判不能是挑战双方
    await expectFail(
      () => act('createChallenge', MEMBER, { opponent: RIVAL, referee: RIVAL, liftKey: 'bench' }),
      '双方', '裁判不能是挑战双方'
    )
    // 裁判只能是教练（用独立的普通会员测）
    const NONCOACH = 'openid-noncoach'
    await ensureMember(NONCOACH)
    await act('setRole', ADMIN, { openid: NONCOACH, role: 'member' })
    await expectFail(
      () => act('createChallenge', MEMBER, { opponent: RIVAL, referee: NONCOACH, liftKey: 'bench' }),
      '教练', '非教练不能当裁判'
    )
    await expectFail(
      () => act('createChallenge', MEMBER, { opponent: MEMBER, referee: COACH, liftKey: 'bench' }),
      '自己', '不能挑战自己'
    )

    // 正常发起
    const c1 = await act('createChallenge', MEMBER, {
      opponent: RIVAL, referee: COACH, liftKey: 'bench', metric: 'absolute', trashTalk: '来一场'
    })
    assert.strictEqual(c1.status, 'pending')
    assert.strictEqual(c1.referee.state, 'invited')
    assert.ok(c1.expireAt > Date.now(), '应战截止应在未来')

    // 其他会员也能看到（公开）
    const pubList = await act('challengeList', STAFF, { tab: 'all' })
    assert.ok(pubList.list.some(x => x._id === c1._id), '挑战应对所有会员可见')

    // 裁判拒绝 → 发起人重选
    const declinedByRef = await act('refereeRespond', COACH, { id: c1._id, decision: 'decline' })
    assert.strictEqual(declinedByRef.referee.state, 'declined')
    // 用发起人的视角看：应该能重选裁判
    const fromChallenger = await act('challengeDetail', MEMBER, { id: c1._id })
    assert.ok(fromChallenger.canReinvite, '发起人应能重选裁判')
    // 换一个教练当裁判（另建 COACH2，不动 ADMIN 的角色）
    const COACH2 = 'openid-coach2'
    await ensureMember(COACH2)
    await act('updateProfile', COACH2, { nickName: '二号教练', phone: '13800002233' })
    await act('setRole', ADMIN, { openid: COACH2, role: 'coach' })
    const c1b = await act('pickReferee', MEMBER, { id: c1._id, referee: COACH2 })
    assert.strictEqual(c1b.referee.openid, COACH2)

    // 被挑战者否决赛判 → 发起人重选
    await act('refereeRespond', COACH2, { id: c1._id, decision: 'accept' })
    const vetoed = await act('respondChallenge', RIVAL, { id: c1._id, decision: 'accept', vetoReferee: true })
    assert.strictEqual(vetoed.status, 'referee_vetoed')
    await act('pickReferee', MEMBER, { id: c1._id, referee: COACH })
    await act('refereeRespond', COACH, { id: c1._id, decision: 'accept' })
    const accepted = await act('respondChallenge', RIVAL, { id: c1._id, decision: 'accept' })
    assert.strictEqual(accepted.status, 'accepted', '双方确认后应进入视频阶段')
    assert.ok(accepted.submitBy > Date.now(), '视频截止应在未来')

    // 只有双方能交视频
    await expectFail(
      () => act('submitChallengeVideo', STAFF, { id: c1._id, videoUrl: 'https://x/v1.mp4' }),
      '挑战双方', '非参与者不能交视频'
    )
    // 每人最多 1 段
    await act('submitChallengeVideo', MEMBER, { id: c1._id, videoUrl: 'https://gym.example.com/api/media/v1' })
    await expectFail(
      () => act('submitChallengeVideo', MEMBER, { id: c1._id, videoUrl: 'https://gym.example.com/api/media/v2' }),
      '最多', '每方只能交 1 段视频'
    )
    const ready = await act('submitChallengeVideo', RIVAL, { id: c1._id, videoUrl: 'https://gym.example.com/api/media/v3' })
    assert.strictEqual(ready.status, 'ready', '双方都交了应进入待判决')
    assert.ok(ready.judgeBy > Date.now(), '裁判截止应在未来')

    // 只有裁判能判（用普通会员试，STAFF 在测试里是管理员，可以兜底判）
    await expectFail(
      () => act('judgeChallenge', RIVAL, { id: c1._id, result: 'win_challenger' }),
      '主裁判', '非裁判不能判定'
    )
    // 判定 + 理由
    const judged = await act('judgeChallenge', COACH, {
      id: c1._id, result: 'win_challenger', note: '发起方动作更标准'
    })
    assert.strictEqual(judged.status, 'judged')
    assert.strictEqual(judged.judgeResult, 'win_challenger')
    assert.strictEqual(judged.judgeNote, '发起方动作更标准', '判定理由要对会员可见')
    assert.ok(judged.canRejudge, '3 小时内应能改判')

    // 改判（留痕）
    const rejudged = await act('judgeChallenge', COACH, { id: c1._id, result: 'draw', note: '重看后判平' })
    assert.strictEqual(rejudged.judgeResult, 'draw')
    const c1row = (await query('select judge_history from challenges where id = $1', [c1._id])).rows[0]
    assert.strictEqual(c1row.judge_history.length, 2, '改判要留痕')

    // 作弊：判负 + 禁赛 + 累计
    const c2 = await act('createChallenge', MEMBER, { opponent: RIVAL, referee: COACH, liftKey: 'squat' })
    await act('refereeRespond', COACH, { id: c2._id, decision: 'accept' })
    await act('respondChallenge', RIVAL, { id: c2._id, decision: 'accept' })
    await act('submitChallengeVideo', MEMBER, { id: c2._id, videoUrl: 'https://gym.example.com/api/media/v4' })
    await act('submitChallengeVideo', RIVAL, { id: c2._id, videoUrl: 'https://gym.example.com/api/media/v5' })
    const cheat = await act('judgeChallenge', COACH, {
      id: c2._id, result: 'win_challenger', note: '对手视频是剪的', cheatOpenid: RIVAL
    })
    assert.strictEqual(cheat.judgeResult, 'win_challenger', '作弊方应直接判负')
    const cheatVideo = cheat.videos.find(v => v.openid === RIVAL)
    assert.strictEqual(cheatVideo.cheatFlag, true, '作弊视频要标记')
    const rivalRow = memberRow((await query('select * from members where openid = $1', [RIVAL])).rows[0])
    assert.ok(rivalRow.challengeBanUntil > Date.now(), '作弊要禁赛')
    assert.strictEqual(rivalRow.challengeCheatCount, 1, '作弊次数 +1')

    // 禁赛期间不能发起
    await expectFail(
      () => act('createChallenge', RIVAL, { opponent: MEMBER, referee: COACH, liftKey: 'bench' }),
      '禁赛', '被禁赛的人不能发起挑战'
    )

    // 同时最多 2 场
    await act('setRole', ADMIN, { openid: RIVAL, role: 'member' })
    await query('update members set challenge_ban_until = 0 where openid = $1', [RIVAL])
    const mk = () => act('createChallenge', MEMBER, { opponent: RIVAL, referee: COACH, liftKey: 'bench' })
    await mk()
    await mk()
    await expectFail(() => mk(), '最多', '同时最多 2 场进行中的挑战')

    // 红点计数
    const summary = await act('challengeSummary', RIVAL)
    assert.ok(summary.incoming >= 2, '对手应看到 2 条待应战')
    ok('挑战 P1：发起/裁判/应战/视频/判定/改判/作弊禁赛/上限')
  }

  { // 双方确认就能先传视频（不用等裁判接单）
    const A = 'openid-early-a'
    const B = 'openid-early-b'
    const COACH3 = 'openid-coach3'
    for (const id of [A, B, COACH3]) await ensureMember(id)
    await act('setRole', ADMIN, { openid: A, role: 'member' })
    await act('setRole', ADMIN, { openid: B, role: 'member' })
    await act('setRole', ADMIN, { openid: COACH3, role: 'coach' })
    await act('updateProfile', A, { nickName: '早传甲', phone: '13800006611' })
    await act('updateProfile', B, { nickName: '早传乙', phone: '13800006622' })

    const c = await act('createChallenge', A, { opponent: B, referee: COACH3, liftKey: 'deadlift' })
    // 裁判还没接单，对方先应战
    const accepted = await act('respondChallenge', B, { id: c._id, decision: 'accept' })
    assert.strictEqual(accepted.status, 'waiting_referee', '裁判没接单时进入「上传视频中」')
    assert.ok(accepted.submitBy > Date.now(), '应战后视频倒计时就开始了')
    assert.strictEqual(accepted.canSubmitVideo, true, '此时双方都能上传视频')

    // 双方都能传
    const v1 = await act('submitChallengeVideo', A, { id: c._id, videoUrl: 'https://gym.example.com/api/media/e1' })
    assert.strictEqual(v1.status, 'waiting_referee', '只有一方交了还是上传中')
    const v2 = await act('submitChallengeVideo', B, { id: c._id, videoUrl: 'https://gym.example.com/api/media/e2' })
    assert.strictEqual(v2.status, 'ready', '双方交齐直接进入待判决，不用等裁判接单')
    assert.ok(v2.judgeBy > Date.now(), '判决倒计时开始')

    // 裁判这时才接单，状态保持待判决
    const ref = await act('refereeRespond', COACH3, { id: c._id, decision: 'accept' })
    assert.strictEqual(ref.status, 'ready', '裁判后接单不改状态')
    assert.strictEqual(ref.canJudge, true, '接单后可以判定')

    const judged = await act('judgeChallenge', COACH3, {
      id: c._id, result: 'win_opponent', note: '乙动作更标准'
    })
    assert.strictEqual(judged.status, 'judged')
    ok('双方确认即可先传视频（裁判未接单也不影响）')
  }

  { // 普通会员也能选挑战对手（不暴露手机号）
    const M1 = 'openid-pick-me'
    const M2 = 'openid-pick-other'
    const PICK_COACH = 'openid-pick-coach'
    for (const id of [M1, M2, PICK_COACH]) await ensureMember(id)
    await act('setRole', ADMIN, { openid: PICK_COACH, role: 'coach' })
    await act('setRole', ADMIN, { openid: M1, role: 'member' })
    await act('setRole', ADMIN, { openid: M2, role: 'member' })
    await act('updateProfile', M1, { nickName: '选人甲', phone: '13800007711' })
    await act('updateProfile', M2, { nickName: '选人乙', phone: '13800007722' })

    // 普通会员调 searchMembers 应该没权限（员工端接口）
    await expectFail(
      () => act('searchMembers', M1, { keyword: '' }),
      '权限', 'searchMembers 仍然只给教练'
    )

    // 新接口：会员可查，且不含手机号
    const list = await act('challengeOpponents', M1, {})
    assert.ok(list.length >= 1, '会员应该能看到其他会员')
    assert.ok(list.every(x => x.openid === undefined && x._id), '返回结构正常')
    assert.ok(list.every(x => !('phone' in x)), '不能返回手机号')
    assert.ok(!list.some(x => x._id === M1), '不应该把自己列出来')

    // 关键字搜索（昵称）
    const byName = await act('challengeOpponents', M1, { keyword: '选人乙' })
    assert.strictEqual(byName.length, 1)
    assert.strictEqual(byName[0].name, '选人乙')

    // 数字按手机号匹配，但结果里依然没有手机号
    const byPhone = await act('challengeOpponents', M1, { keyword: '13800007722' })
    assert.strictEqual(byPhone.length, 1)
    assert.strictEqual(byPhone[0].name, '选人乙')
    assert.ok(!('phone' in byPhone[0]))

    // 会员用这个列表发起挑战
    const c = await act('createChallenge', M1, {
      opponent: M2, referee: PICK_COACH, liftKey: 'bench'
    })
    assert.strictEqual(c.status, 'pending')
    ok('会员也能选挑战对手（challengeOpponents，不含手机号）')
  }

  { // 会员挑战 P2：评论、点赞、挑战榜、徽章
    const C = 'openid-p2-challenger'
    const O = 'openid-p2-opponent'
    const J = 'openid-p2-judge'
    for (const id of [C, O, J]) await ensureMember(id)
    await act('setRole', ADMIN, { openid: C, role: 'member' })
    await act('setRole', ADMIN, { openid: O, role: 'member' })
    await act('setRole', ADMIN, { openid: J, role: 'coach' })
    await act('updateProfile', C, { nickName: '挑战甲', phone: '13800001111' })
    await act('updateProfile', O, { nickName: '挑战乙', phone: '13800002222' })

    const c = await act('createChallenge', C, { opponent: O, referee: J, liftKey: 'bench' })
    await act('refereeRespond', J, { id: c._id, decision: 'accept' })
    await act('respondChallenge', O, { id: c._id, decision: 'accept' })
    await act('submitChallengeVideo', C, { id: c._id, videoUrl: 'https://gym.example.com/api/media/p2v1' })
    await act('submitChallengeVideo', O, { id: c._id, videoUrl: 'https://gym.example.com/api/media/p2v2' })

    // 评论（先发后管）
    await expectFail(() => act('commentChallenge', C, { id: c._id, content: '   ' }), '点什么', '空评论被拒')
    const afterComment = await act('commentChallenge', C, { id: c._id, content: '这把我看好乙' })
    assert.strictEqual(afterComment.length, 1)
    assert.strictEqual(afterComment[0].content, '这把我看好乙')
    assert.strictEqual(afterComment[0].authorName, '挑战甲')
    assert.ok(afterComment[0].canDelete, '自己能删自己的评论')

    // 别人不能删
    await expectFail(
      () => act('deleteChallengeComment', O, { id: afterComment[0]._id }),
      '只能删自己', '别人的评论不能删'
    )

    // 详情里能看到评论
    const detailWithComments = await act('challengeDetail', O, { id: c._id })
    assert.strictEqual(detailWithComments.comments.length, 1)
    assert.strictEqual(detailWithComments.commentCount, 1)

    // 点赞 / 取消
    const liked = await act('likeChallengeComment', O, { id: afterComment[0]._id })
    assert.strictEqual(liked[0].likeCount, 1)
    assert.strictEqual(liked[0].likedByMe, true)
    const unliked = await act('likeChallengeComment', O, { id: afterComment[0]._id })
    assert.strictEqual(unliked[0].likeCount, 0)
    assert.strictEqual(unliked[0].likedByMe, false)
    // 再次点赞，留一个赞给榜单测试
    await act('likeChallengeComment', O, { id: afterComment[0]._id })

    // 管理员可以删任意评论
    const adminDeleted = await act('deleteChallengeComment', ADMIN, { id: afterComment[0]._id })
    assert.strictEqual(adminDeleted.length, 0, '管理员删评论后列表为空')

    // 判定（记录成绩快照）：给双方造力量成绩，乙比甲高
    await act('saveStrength', J, { openid: C, lift: 'bench', weight: 40, reps: 5 })
    await act('saveStrength', J, { openid: O, lift: 'bench', weight: 80, reps: 5 })
    const judged = await act('judgeChallenge', J, { id: c._id, result: 'win_challenger', note: '甲动作更稳' })
    assert.strictEqual(judged.judgeResult, 'win_challenger')

    // 挑战榜
    const board = await act('challengeBoard', C, {})
    assert.ok(Array.isArray(board.week) && Array.isArray(board.streak) && Array.isArray(board.total))
    const mineRow = board.mine
    assert.strictEqual(mineRow.wins, 1, '赢一场后 mine.wins = 1')
    assert.strictEqual(mineRow.judged, 1)
    assert.ok(mineRow.badges.some(b => b.key === 'first_win'), '应有首胜徽章')
    assert.ok(mineRow.badges.some(b => b.key === 'giant_killer'), '成绩更低却赢了 → 以下克上徽章')
    assert.ok(board.week.some(x => x.openid === C && x.weekWins >= 1), '本周胜场榜包含自己')

    // 输的人连胜归零
    const boardO = await act('challengeBoard', O, {})
    assert.strictEqual(boardO.mine.streak, 0, '输了连胜清零')
    assert.strictEqual(boardO.mine.losses, 1)
    ok('挑战 P2：评论、点赞、挑战榜、徽章')
  }

  { // 内容更新通知：订阅票 + 群发不崩
    const FAN = 'openid-fan'
    await ensureMember(FAN)
    await act('setRole', ADMIN, { openid: FAN, role: 'member' })
    await act('updateProfile', FAN, { nickName: '订阅会员', phone: '13800005566' })

    // 模板 ID 下发给小程序
    const tpl = await act('notifyTopicTemplates', FAN)
    assert.ok(tpl.moments && tpl.competitions && tpl.rankScore && tpl.rankLift, '四个话题都要有模板 ID')

    // 初始票数为 0
    let mine = await act('mySubscriptions', FAN)
    assert.strictEqual(mine.topics.moments, 0)
    assert.strictEqual(mine.topics.competitions, 0)

    // 订阅 + 重复订阅累加（上限 5）
    await act('subscribeTopic', FAN, { topic: 'moments' })
    await act('subscribeTopic', FAN, { topic: 'moments' })
    mine = await act('mySubscriptions', FAN)
    assert.strictEqual(mine.topics.moments, 2, '重复订阅要累加票数')
    await expectFail(
      () => act('subscribeTopic', FAN, { topic: 'nonsense' }),
      '不支持', '未知话题要拒绝'
    )

    // 群发：测试环境没有微信凭证，发不出去也不能崩，票要作废
    await act('postMoment', FAN, {
      content: '测试新视频',
      media: [{ type: 'video', url: 'https://gym.example.com/api/media/mv1', thumb: '' }]
    })
    const after = await act('mySubscriptions', FAN)
    assert.ok(after.topics.moments >= 0, '群发后票数不能是负数')
    // 清零：用户停止提醒
    await act('subscribeTopic', FAN, { topic: 'rankScore' })
    const cleared = await act('clearSubscription', FAN, { topic: 'rankScore' })
    assert.strictEqual(cleared.topics.rankScore, 0, '清零后票数应为 0')

    ok('内容更新通知：订阅票管理 + 群发容错')
  }
  }
  }

  // 视频处理侧：不限时长时不裁切
  const video2 = require('../lib/video')
  const os2 = require('os')
  const path2 = require('path')
  const { execFileSync: exec2 } = require('child_process')
  const src2 = path2.join(os2.tmpdir(), 'nocut-' + Date.now() + '.mp4')
  exec2('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi',
    '-i', 'testsrc=duration=8:size=160x120:rate=10', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '34', src2])
  const noTrim = await video2.prepare(src2, { maxDuration: 0, ext: 'mp4', maxHeight: 720, maxBytes: 0, maxVideoBytes: 0 })
  assert.strictEqual(noTrim.trimmed, false, '不限时长时不应裁切')
  assert.ok(noTrim.after.duration >= 7.5, '不限时长时视频应保持完整')
  require('fs').rmSync(src2, { force: true })
  ok('不限时长时服务端不裁切')

  // 恢复默认，避免影响后面的测试
  await limits.save({ maxDuration: 15, maxVideoMB: 12, maxRawVideoMB: 60, maxCount: 9, maxTotalMB: 40, feedThumbs: 9 }, 'test')

  for (const f of [src, cut.path, cut10.path]) require('fs').rmSync(f, { force: true })

  // 误传资料要能删：教练/管理员可删历史体测，删完最新档案自动换成剩下最新的一条
  const DEL_ID = 'openid-bodydel'
  await ensureMember(DEL_ID)
  await act('updateProfile', DEL_ID, { nickName: '误传会员', phone: '13800007777' })
  await act('saveBodyRecord', STAFF, { openid: DEL_ID, weight: 70, height: 175, bodyFat: 20, date: '2026-01-10' })
  await act('saveBodyRecord', STAFF, { openid: DEL_ID, weight: 88, height: 175, bodyFat: 30, date: '2026-02-10' })
  const before = (await query(
    "select id, date from body_records where openid = $1 order by date desc", [DEL_ID]
  )).rows
  assert.strictEqual(before.length, 2, '应该有两条体测记录')
  assert.strictEqual(
    (await query('select latest_body from members where openid = $1', [DEL_ID])).rows[0].latest_body.date,
    '2026-02-10'
  )

  await expectFail(
    () => act('deleteBodyRecord', MEMBER, { id: before[0].id }),
    '没有权限', '普通会员不能删别人的体测记录'
  )

  const delRes = await act('deleteBodyRecord', COACH, { id: before[0].id })
  assert.strictEqual(delRes.remaining, 1, '删完应只剩一条')
  const latestAfter = (await query('select latest_body from members where openid = $1', [DEL_ID])).rows[0].latest_body
  assert.strictEqual(latestAfter.date, '2026-01-10', '最新档案应换成剩下那条')
  assert.strictEqual(Number(latestAfter.weight), 70, '最新档案的体重也要跟着换')
  assert.ok(latestAfter.score > 0, '换完之后评分要重算')

  // 管理员也能删，删到没有记录时最新档案清空
  await act('deleteBodyRecord', ADMIN, { id: before[1].id })
  const emptyLatest = (await query('select latest_body from members where openid = $1', [DEL_ID])).rows[0].latest_body
  assert.strictEqual(emptyLatest, null, '记录删完最新档案应为空')
  ok('教练/管理员可以删除历史体测，最新档案与评分自动重算')

  // 报告图随识别自动保存：saveBodyRecord 带 reportImage 时应写进记录
  const withReport = await act('saveBodyRecord', STAFF, {
    openid: DEL_ID, weight: 71, height: 175, bodyFat: 19,
    reportImage: 'https://gym.novrein.com/api/media/report-demo', date: '2026-03-01'
  })
  assert.strictEqual(withReport.reportImage, 'https://gym.novrein.com/api/media/report-demo')
  const reportRow = (await query(
    "select report_image from body_records where openid = $1 and date = '2026-03-01'", [DEL_ID]
  )).rows[0]
  assert.strictEqual(reportRow.report_image, 'https://gym.novrein.com/api/media/report-demo', '报告图要存进记录')
  ok('体测报告图会随记录保存')

  const boardBefore = await act('leaderboard', MEMBER, { lift: 'bench', metric: 'relative' })
  assert.strictEqual(boardBefore.total, 0)
  await act('setBodyPublic', MEMBER, { isPublic: true })
  const boardAfter = await act('leaderboard', MEMBER, { lift: 'bench', metric: 'relative' })
  assert.strictEqual(boardAfter.total, 1)
  assert.strictEqual(boardAfter.me.isMe, true)
  ok('相对体重榜只收自愿公开体重的会员')

  await act('setBodyPublic', MEMBER, { isPublic: false })
  const staffView = await act('memberFitness', STAFF, { openid: MEMBER })
  // 需求变更：身体数据对所有人可见，公开开关只决定是否进「相对体重榜」
  assert.ok(staffView.latestBody.weight > 0, '关闭公开后体重依然可见（人人可见）')
  assert.ok(staffView.latestBody.score > 0)
  ok('身体数据对所有人可见（公开开关只影响相对体重榜）')

  // 友圈测试需要第二个会员（点赞、删别人的动态）
  const OTHER = 'openid-other'
  await ensureMember(OTHER)
  await act('updateProfile', OTHER, { nickName: '小红', phone: '13800004444' })

  // ---------- 任何人都能看会员资料与身体数据 ----------
  const prof = await act('memberProfile', OTHER, { openid: MEMBER })
  assert.strictEqual(prof.nickName, '小明')
  assert.strictEqual(prof.roleName, '会员')
  assert.strictEqual(prof.phone, '', '普通会员看不到别人的手机号')

  const adminProf = await act('memberProfile', ADMIN, { openid: MEMBER })
  assert.ok(adminProf.phone, '管理员能看到手机号')

  const meProf = await act('memberProfile', MEMBER, { openid: MEMBER })
  assert.ok(meProf.phone, '自己能看到自己的手机号')

  const mateFitness = await act('memberFitness', OTHER, { openid: MEMBER })
  assert.ok(mateFitness.latestBody, '普通会员也能看到别人的最新身体数据')
  assert.ok(mateFitness.latestBody.weight > 0, '体重对所有人可见（不再受公开开关限制）')
  assert.ok(mateFitness.bodyHistory.length > 0, '能看到别人的历史身体资料')
  ok('任何会员都能看别人的资料、身体数据与历史（手机号仅自己/教练/管理员可见）')

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
  // 教练也不行（只有作者本人和管理员能删）
  await expectFail(() => act('deleteMoment', COACH, { id: moment1._id }), '只能删除自己', '教练也不能删别人的动态')

  // 管理员可以删任意会员的动态
  const adminView = await act('momentDetail', ADMIN, { id: moment1._id })
  assert.strictEqual(adminView.canDelete, true, '管理员应能删除任意动态')
  await act('deleteMoment', ADMIN, { id: moment1._id })
  assert.strictEqual(
    (await query('select status from moments where id = $1', [moment1._id])).rows[0].status,
    'deleted'
  )
  ok('管理员可以删除其他会员的动态（教练不行）')

  // 作者本人删除另一条
  const own = await act('postMoment', MEMBER, { content: '自己的动态，作者来删' })
  await act('deleteMoment', MEMBER, { id: own._id })
  await expectFail(() => act('momentDetail', MEMBER, { id: own._id }), '不存在', '删除后详情不可见')

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
