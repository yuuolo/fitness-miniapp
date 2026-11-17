// 测试：管理页编辑排行榜项目（改名/比法/排序）与安全校验
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const anchor = "  ok('批量导入运动数据（按外部 ID 去重）')"
if (!t.includes(anchor)) {
  console.log('⚠ 找不到锚点')
  process.exit(1)
}
if (t.includes('排行榜项目可以改名')) {
  console.log('· 已有该断言')
  process.exit(0)
}

// 在「批量导入」那块的块尾之后插入一个独立块
const idx = t.indexOf(anchor) + anchor.length
const block = `
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
  }`

t = t.slice(0, idx) + block + t.slice(idx)
fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已加入编辑项目测试')
require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
