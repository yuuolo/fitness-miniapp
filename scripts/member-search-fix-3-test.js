// 测试：会员能通过 challengeOpponents 选对手（不再需要教练权限）
const fs = require('fs')

const p = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/test/run.js'
let raw = fs.readFileSync(p, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

if (t.includes('会员也能选挑战对手')) {
  console.log('· 已有该测试')
  process.exit(0)
}

const anchor = "    ok('双方确认即可先传视频（裁判未接单也不影响）')"
if (!t.includes(anchor)) {
  console.log('⚠ 找不到锚点')
  process.exit(1)
}
const idx = t.indexOf(anchor)
const closeIdx = t.indexOf('\n  }', idx) + '\n  }'.length

const block = `

  { // 普通会员也能选挑战对手（不暴露手机号）
    const M1 = 'openid-pick-me'
    const M2 = 'openid-pick-other'
    for (const id of [M1, M2]) await ensureMember(id)
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
      opponent: M2, referee: COACH3 || 'openid-coach3', liftKey: 'bench'
    })
    assert.strictEqual(c.status, 'pending')
    ok('会员也能选挑战对手（challengeOpponents，不含手机号）')
  }`

t = t.slice(0, closeIdx) + block + t.slice(closeIdx)
fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已加 challengeOpponents 测试')
require('child_process').execFileSync(process.execPath, ['--check', p])
console.log('✓ 语法通过')
