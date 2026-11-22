// 测试：bodyHistory（全部历史 + 权限）
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

if (t.includes('bodyHistory 返回全部历史（含实时评分）')) {
  console.log('· 已有 bodyHistory 测试')
  process.exit(0)
}

const anchor = "  ok('友圈支持按关键字搜索（1 个字起）和只看视频')"
if (!t.includes(anchor)) {
  console.log('⚠ 找不到锚点')
  process.exit(1)
}
const idx = t.indexOf(anchor) + anchor.length

const block = `

  { // bodyHistory：全部历史体测（给指标曲线/两次对比用）
    const BH = 'openid-body-history'
    await ensureMember(BH)
    await act('setRole', ADMIN, { openid: BH, role: 'member' })
    await act('updateProfile', BH, { nickName: '曲线会员', phone: '13800008899' })

    // 空数据
    let empty = await act('bodyHistory', BH, {})
    assert.strictEqual(empty.count, 0, '没有体测时 count 为 0')

    // 录两次（日期一旧一新）
    await act('saveBodyRecord', ADMIN, {
      openid: BH, date: '2026-01-10', weight: 80, height: 175, bodyFat: 25, gender: 'male'
    })
    await act('saveBodyRecord', ADMIN, {
      openid: BH, date: '2026-02-10', weight: 78, height: 175, bodyFat: 22, gender: 'male'
    })

    const r = await act('bodyHistory', BH, {})
    assert.strictEqual(r.count, 2, '应返回 2 条历史')
    assert.ok(r.latestDate === '2026-02-10', 'latestDate 应是最新那次')
    assert.ok(r.prevDate === '2026-01-10', 'prevDate 应是上一次')
    assert.ok(r.records[0].date < r.records[1].date, '按日期正序返回（画曲线用）')
    assert.ok(r.records[0].score != null && r.records[1].score != null, '评分要实时算出来')
    assert.ok(r.records[1].weight === 78 && r.records[0].weight === 80, '指标值正确')

    // 会员不能查别人的
    const OTHER = 'openid-body-history-other'
    await ensureMember(OTHER)
    const other = await act('bodyHistory', BH, { openid: OTHER })
    assert.strictEqual(other.count, 0, '普通会员只能看自己的历史')

    ok('bodyHistory 返回全部历史（含实时评分），会员只能看自己')
  }`

t = t.slice(0, idx) + block + t.slice(idx)
fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已加 bodyHistory 测试')
require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
