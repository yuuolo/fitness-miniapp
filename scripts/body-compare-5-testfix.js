// 修测试：普通会员传别人 openid 会被忽略（返回自己的数据），管理员才能查别人
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = `    // 会员不能查别人的
    const OTHER = 'openid-body-history-other'
    await ensureMember(OTHER)
    const other = await act('bodyHistory', BH, { openid: OTHER })
    assert.strictEqual(other.count, 0, '普通会员只能看自己的历史')`

const to = `    // 普通会员传别人的 openid 会被忽略，仍然返回自己的
    const OTHER = 'openid-body-history-other'
    await ensureMember(OTHER)
    const mine = await act('bodyHistory', BH, { openid: OTHER })
    assert.strictEqual(mine.count, 2, '普通会员只能看自己的历史（传别人 openid 被忽略）')
    assert.ok(mine.records.every(x => x.openid === BH), '返回的记录都属于自己')

    // 管理员可以查别人
    const adminView = await act('bodyHistory', ADMIN, { openid: BH })
    assert.strictEqual(adminView.count, 2, '管理员可以查任意会员的历史')`

if (!t.includes(from)) {
  console.log('⚠ 未匹配')
  process.exit(1)
}
t = t.replace(from, to)
fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已修 bodyHistory 权限用例')
require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
