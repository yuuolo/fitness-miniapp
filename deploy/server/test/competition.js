// 排行榜项目 + 周/月榜 + 竞赛 全流程测试
// 用法：DATABASE_URL=postgres://.../gym_comp node test/competition.js
const assert = require('assert')
const { query, pool, ensureSchema } = require('../lib/db')
const { memberRow, cnDate, dayStart, DAY, HOUR } = require('../lib/common')
const liftItems = require('../lib/lift-items')

let passed = 0
const ok = name => { passed++; console.log('  \u2713 ' + name) }

async function expectFail(fn, contains, name) {
  let err = null
  try { await fn() } catch (e) { err = e }
  assert.ok(err, name + ' 应该失败')
  if (contains) assert.ok(String(err.message).includes(contains), name + ' 文案不符：' + err.message)
  ok(name)
}

async function main() {
  await ensureSchema()
  await liftItems.ensureSeed()
  await query('truncate competitions, competition_entries, strength_records, body_records, members cascade')
  await query('truncate lift_items cascade')
  await liftItems.ensureSeed()

  const members = {}
  for (const id of ['comp-admin', 'comp-coach', 'comp-a', 'comp-b']) {
    await query('insert into members (openid, nick_name, phone, role, created_at) values ($1,$2,$3,$4,$5)',
      [id, id.replace('comp-', '会员'), '1370000' + Math.floor(Math.random() * 9000 + 1000), 'member', Date.now()])
  }
  await query("update members set role = 'admin' where openid = 'comp-admin'")
  await query("update members set role = 'coach' where openid = 'comp-coach'")

  const load = async id => memberRow((await query('select * from members where openid = $1', [id])).rows[0])
  for (const id of ['comp-admin', 'comp-coach', 'comp-a', 'comp-b']) members[id] = await load(id)

  const fitness = require('../lib/fitness')
  const comp = require('../lib/competition')

  // ---------- 1. 排行榜项目 ----------
  let items = await liftItems.list()
  assert.strictEqual(items.length, 5)
  assert.deepStrictEqual(items.map(i => i.key), ['bench', 'squat', 'deadlift', 'ohp', 'pullup'])
  ok('默认 5 个排行榜项目已就绪')

  const added = await liftItems.save({
    me: await load('comp-admin'),
    data: { name: '农夫行走', metric: 'maxWeight' }
  })
  assert.ok(added.key.startsWith('lift_'))
  assert.strictEqual(added.name, '农夫行走')
  assert.strictEqual(added.unit, 'kg')
  ok('管理员可以新增项目（自动生成 key）')

  const renamed = await liftItems.save({
    me: await load('comp-admin'),
    data: { key: added.key, name: '农夫走', metric: 'maxWeight', sort: 5 }
  })
  assert.strictEqual(renamed.name, '农夫走')
  assert.strictEqual(renamed.sort, 5)
  ok('可以修改项目名称与排序')

  await expectFail(
    () => liftItems.save({ me: members['comp-a'], data: { name: '越权项目' } }),
    '没有权限', '普通会员不能改排行榜项目'
  )

  await liftItems.setEnabled({ me: await load('comp-admin'), data: { key: added.key, enabled: false } })
  items = await liftItems.list()
  assert.ok(!items.some(i => i.key === added.key), '隐藏后不出现在列表')
  const all = await liftItems.list({ includeDisabled: true })
  assert.ok(all.some(i => i.key === added.key && !i.enabled))
  ok('可以隐藏项目（隐藏后排行榜不再展示，历史保留）')

  await liftItems.setEnabled({ me: await load('comp-admin'), data: { key: added.key, enabled: true } })
  const removed = await liftItems.remove({ me: await load('comp-admin'), data: { key: added.key } })
  assert.strictEqual(removed.deleted, true)
  ok('没有成绩的项目可以彻底删除')

  const adminMe = await load('comp-admin')
  await expectFail(
    () => liftItems.remove({ me: adminMe, data: { key: 'bench' } }),
    '标准三项', '卧推/深蹲/硬拉不允许删除（身体评分依赖）'
  )

  // ---------- 2. 计算方式 ----------
  assert.strictEqual(liftItems.computeValue('oneRM', 100, 5), 116.7)
  assert.strictEqual(liftItems.computeValue('oneRM', 100, 1), 100)
  assert.strictEqual(liftItems.computeValue('maxWeight', 100, 5), 100)
  assert.strictEqual(liftItems.computeValue('reps', 0, 12), 12)
  assert.strictEqual(liftItems.computeValue('volume', 100, 5), 500)
  ok('四种计算方式（估算1RM/最大重量/次数/容量）数值正确')

  // ---------- 3. 周榜 / 月榜 ----------
  const now = Date.now()
  // 用固定的「上个月」「上上个月」时间点，避免 10 天前刚好落在本月内导致断言不稳定
  const todayStart = dayStart(cnDate(now))
  const cnNow = new Date(todayStart + 8 * 3600e3)
  const prevMonthStart = Date.UTC(cnNow.getUTCFullYear(), cnNow.getUTCMonth() - 1, 1) - 8 * 3600e3
  const olderStart = Date.UTC(cnNow.getUTCFullYear(), cnNow.getUTCMonth() - 2, 1) - 8 * 3600e3
  const lastMonthAt = prevMonthStart + 14 * DAY
  const olderAt = olderStart + 2 * DAY

  const insert = (openid, lift, score, createdAt) => query(
    `insert into strength_records (id, openid, lift, weight, reps, one_rm, date, operator, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    ['sr_' + Math.random().toString(36).slice(2), openid, lift, score, 1, score,
      cnDate(createdAt), 'test', createdAt]
  )
  await insert('comp-a', 'bench', 120, now - HOUR)       // 本周
  await insert('comp-b', 'bench', 100, lastMonthAt)      // 上个月
  await insert('comp-coach', 'bench', 150, olderAt)      // 上上个月

  const week = await fitness.leaderboard({ me: members['comp-a'], data: { lift: 'bench', period: 'week' } })
  assert.strictEqual(week.period, 'week')
  assert.strictEqual(week.periodName, '本周')
  assert.strictEqual(week.total, 1, '周榜只统计本周成绩')
  assert.strictEqual(week.top[0].name, '会员a')
  ok('周榜只统计本周记录')

  const month = await fitness.leaderboard({ me: members['comp-a'], data: { lift: 'bench', period: 'month' } })
  assert.strictEqual(month.periodName, '本月')
  assert.strictEqual(month.total, 1, '月榜不包含上个月及更早的成绩')
  ok('月榜按本月起点过滤（上个月的成绩不进来）')

  const allTime = await fitness.leaderboard({ me: members['comp-a'], data: { lift: 'bench', period: 'all' } })
  assert.strictEqual(allTime.total, 3)
  assert.strictEqual(allTime.top[0].oneRM, 150)
  assert.strictEqual(allTime.top[0].rank, 1)
  ok('总榜包含全部历史，按成绩降序排名')

  assert.ok(allTime.lifts.some(l => l.key === 'pullup' && l.unit === '次'))
  ok('排行榜返回动态项目列表（含单位）')

  // ---------- 4. 竞赛：创建 ----------
  const start = now
  const end = now + 7 * DAY
  await expectFail(
    () => comp.saveCompetition({ me: members['comp-a'], data: { title: '越权赛' } }),
    '没有权限', '普通会员不能发起竞赛'
  )
  await expectFail(
    () => comp.saveCompetition({ me: members['comp-coach'], data: { title: '', liftKey: 'bench', startAt: start, endAt: end } }),
    '请填写竞赛名称', '竞赛名称必填'
  )
  await expectFail(
    () => comp.saveCompetition({ me: members['comp-coach'], data: { title: '测试', liftKey: 'bench', startAt: end, endAt: start } }),
    '结束时间要晚于开始时间', '起止时间校验'
  )
  await expectFail(
    () => comp.saveCompetition({ me: members['comp-coach'], data: { title: '测试', liftKey: 'nope', startAt: start, endAt: end } }),
    '请选择比赛项目', '项目必须存在'
  )

  const created = await comp.saveCompetition({
    me: members['comp-coach'],
    data: {
      title: '卧推挑战赛', desc: '为期一周', prize: '冠军：蛋白粉一桶',
      rules: '每人每天可挑战一次', liftKey: 'bench', startAt: start, endAt: end
    }
  })
  assert.ok(created._id)
  assert.strictEqual(created.status, 'active')
  assert.strictEqual(created.prize, '冠军：蛋白粉一桶')
  assert.strictEqual(created.createdByName, '会员coach')
  ok('教练可以发起竞赛（含奖品与规则）')

  // ---------- 5. 录入成绩 + 排名 ----------
  await expectFail(
    () => comp.recordCompetitionEntry({ me: members['comp-a'], data: { id: created._id, openid: 'comp-a', weight: 100, reps: 5 } }),
    '没有权限', '会员不能自己录成绩'
  )
  await expectFail(
    () => comp.recordCompetitionEntry({ me: members['comp-coach'], data: { id: created._id, openid: 'comp-a', weight: 100, reps: 0 } }),
    '次数', '次数必须大于 0'
  )
  await expectFail(
    () => comp.recordCompetitionEntry({
      me: members['comp-coach'],
      data: { id: created._id, openid: 'comp-a', weight: 100, reps: 5, videoUrl: 'http://insecure' }
    }),
    '视频地址不正确', '视频地址必须是 https'
  )

  const e1 = await comp.recordCompetitionEntry({
    me: members['comp-coach'],
    data: { id: created._id, openid: 'comp-a', weight: 100, reps: 5, note: '第一次', videoUrl: 'https://gym.novrein.com/api/media/v1' }
  })
  assert.strictEqual(e1.entry.value, 116.7)
  assert.ok(e1.entry.videoUrl.startsWith('https://'))
  assert.strictEqual(e1.myBest.rank, 1)
  ok('教练录入成绩并可附视频，实时返回排名')

  const e2 = await comp.recordCompetitionEntry({
    me: members['comp-coach'],
    data: { id: created._id, openid: 'comp-a', weight: 110, reps: 3 }
  })
  assert.ok(e2.entry.value > e1.entry.value)
  assert.strictEqual(e2.myBest.rank, 1)
  ok('同一人多次录入，取最好成绩参与排名')

  await comp.recordCompetitionEntry({
    me: members['comp-coach'],
    data: { id: created._id, openid: 'comp-b', weight: 120, reps: 5 }
  })

  const detail = await comp.competitionDetail({ me: members['comp-a'], data: { id: created._id } })
  assert.strictEqual(detail.competition.playerCount, 2)
  assert.strictEqual(detail.ranking.length, 2)
  assert.strictEqual(detail.ranking[0].openid, 'comp-b', '更重的应排第一')
  assert.strictEqual(detail.ranking[1].openid, 'comp-a')
  assert.strictEqual(detail.myRank.rank, 2)
  assert.strictEqual(detail.myEntries.length, 2)
  assert.ok(detail.myEntries[0].value >= detail.myEntries[1].value, '我的成绩按好坏降序')
  assert.ok(detail.ranking[0].videoUrl !== undefined, '排名里带视频字段')
  ok('竞赛详情返回排名、我的名次与我的全部成绩')

  // ---------- 6. 列表 ----------
  const list = await comp.competitionList({ me: members['comp-a'] })
  assert.strictEqual(list.list.length, 1)
  assert.strictEqual(list.list[0].playerCount, 2)
  assert.strictEqual(list.list[0].myRank, 2)
  assert.strictEqual(list.list[0].myValue, 121) // 110kg × 3 次，Epley 估算 121
  ok('竞赛列表带参赛人数与我的名次/成绩')

  // ---------- 7. 员工视图与删除成绩 ----------
  const coachList = await comp.myCompetitions({ me: members['comp-coach'] })
  assert.strictEqual(coachList.length, 1)
  const staffView = await comp.competitionEntries({ me: members['comp-coach'], data: { id: created._id } })
  assert.strictEqual(staffView.entries.length, 3)
  const del = await comp.deleteCompetitionEntry({ me: members['comp-coach'], data: { entryId: e1.entry._id } })
  assert.strictEqual(del.ok, true)
  const afterDel = await comp.competitionEntries({ me: members['comp-coach'], data: { id: created._id } })
  assert.strictEqual(afterDel.entries.length, 2)
  ok('员工可查看全部成绩并删除录错的记录')

  // ---------- 8. 状态流转 ----------
  await expectFail(
    () => comp.setCompetitionStatus({ me: members['comp-a'], data: { id: created._id, status: 'cancelled' } }),
    '没有权限', '会员不能结束竞赛'
  )
  const cancelled = await comp.setCompetitionStatus({
    me: members['comp-coach'], data: { id: created._id, status: 'cancelled' }
  })
  assert.strictEqual(cancelled.status, 'cancelled')
  await expectFail(
    () => comp.recordCompetitionEntry({ me: members['comp-coach'], data: { id: created._id, openid: 'comp-a', weight: 100, reps: 5 } }),
    '竞赛已取消', '取消后不能再录成绩'
  )
  ok('取消竞赛后不能再录入成绩')

  // 已结束的竞赛
  const ended = await comp.saveCompetition({
    me: members['comp-coach'],
    data: { title: '已结束的赛', liftKey: 'squat', startAt: now - 2 * DAY, endAt: now + 1 * HOUR }
  })
  await query('update competitions set end_at = $2 where id = $1', [ended._id, now - HOUR])
  const detail2 = await comp.competitionDetail({ me: members['comp-coach'], data: { id: ended._id } })
  assert.strictEqual(detail2.competition.status, 'ended')
  await expectFail(
    () => comp.recordCompetitionEntry({ me: members['comp-coach'], data: { id: ended._id, openid: 'comp-a', weight: 100, reps: 5 } }),
    '已经结束', '过期竞赛不能录成绩'
  )
  ok('到点自动结束（按时间推导状态），之后不能再录成绩')

  // ---------- 9. 项目被禁用后不能再办赛 ----------
  await liftItems.setEnabled({ me: await load('comp-admin'), data: { key: 'ohp', enabled: false } })
  await expectFail(
    () => comp.saveCompetition({
      me: members['comp-coach'],
      data: { title: '肩推赛', liftKey: 'ohp', startAt: now, endAt: now + DAY }
    }),
    '请选择比赛项目', '已隐藏的项目不能用于新竞赛'
  )
  await liftItems.setEnabled({ me: await load('comp-admin'), data: { key: 'ohp', enabled: true } })
  ok('已隐藏的项目不能用于新建竞赛')

  console.log('\n全部 ' + passed + ' 项断言通过')
}

main()
  .then(() => pool.end())
  .catch(err => {
    console.error('\n排行榜/竞赛测试失败：', err)
    pool.end().finally(() => process.exit(1))
  })
