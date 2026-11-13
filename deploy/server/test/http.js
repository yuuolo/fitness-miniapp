// HTTP 层端到端测试：真正打 /api、/api/upload、/api/media，验证路由、登录换号、JSON 协议、上传与媒体。
// 需要服务端以 DEV_LOGIN_TOKEN=xxx 启动（生产不设置该变量，通道不生效）。
// 用法：BASE=http://gym-http-test:3000 DEV_LOGIN_TOKEN=xxx node test/http.js
const assert = require('assert')

const BASE = (process.env.BASE || 'http://127.0.0.1:3000').replace(/\/$/, '')
const TOKEN = process.env.DEV_LOGIN_TOKEN || ''
const HEADERS = { 'content-type': 'application/json', 'x-dev-token': TOKEN }

let passed = 0
function ok(name) {
  passed++
  console.log('  \u2713 ' + name)
}

async function call(action, openid, data) {
  const res = await fetch(BASE + '/api', {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ action, data: data || {}, code: 'dev:' + openid })
  })
  assert.strictEqual(res.status, 200, action + ' HTTP 状态应为 200')
  const body = await res.json()
  return body
}

async function callOk(action, openid, data) {
  const body = await call(action, openid, data)
  assert.strictEqual(body.code, 0, action + ' 应成功，实际：' + JSON.stringify(body))
  return body.data
}

async function upload(openid, ext, bytes) {
  const res = await fetch(BASE + '/api/upload?ext=' + ext + '&code=dev:' + openid, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', 'x-dev-token': TOKEN },
    body: bytes
  })
  return res.json()
}

async function main() {
  console.log('测试目标：' + BASE + '\n')

  // ---------- 基础路由 ----------
  const health = await fetch(BASE + '/health').then(r => r.json())
  assert.deepStrictEqual(health, { ok: true })
  ok('GET /health')

  const unknown = await fetch(BASE + '/api', {
    method: 'POST', headers: HEADERS, body: JSON.stringify({ action: 'nope', code: 'dev:x' })
  }).then(r => r.json())
  assert.strictEqual(unknown.code, 404)
  ok('未知 action 返回 404')

  const badJson = await fetch(BASE + '/api', {
    method: 'POST', headers: HEADERS, body: '{oops'
  })
  assert.ok(badJson.status >= 400, '非法 JSON 应被拒，实际 ' + badJson.status)
  ok('非法 JSON 被拒绝（body-parser 兜底）')

  const noCode = await fetch(BASE + '/api', {
    method: 'POST', headers: HEADERS, body: JSON.stringify({ action: 'home' })
  }).then(r => r.json())
  assert.strictEqual(noCode.code, 400)
  assert.ok(noCode.msg.indexOf('code') >= 0)
  ok('缺少登录 code 返回 400')

  const badToken = await fetch(BASE + '/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dev-token': 'wrong' },
    body: JSON.stringify({ action: 'home', code: 'dev:x' })
  }).then(r => r.json())
  assert.strictEqual(badToken.code, 400, '错误令牌不应放行')
  ok('错误 x-dev-token 不能绕过登录')

  // ---------- 业务链路 ----------
  const ADMIN = 'http-admin'
  const STAFF = 'http-staff'
  const COACH = 'http-coach'
  const MEMBER = 'http-member'

  const home0 = await callOk('home', MEMBER)
  assert.strictEqual(home0.initialized, false)
  assert.strictEqual(home0.me.role, 'member')
  ok('新用户首次访问自动建档，未初始化')

  await callOk('bootstrap', ADMIN)
  const home1 = await callOk('home', MEMBER)
  assert.strictEqual(home1.initialized, true)
  ok('bootstrap 走 HTTP 生效')

  await callOk('updateProfile', MEMBER, { nickName: 'HTTP会员', phone: '13900001111' })
  await callOk('updateProfile', STAFF, { nickName: 'HTTP前台', phone: '13900002222' })
  await callOk('updateProfile', COACH, { nickName: 'HTTP教练', phone: '13900003333' })
  await callOk('setRole', ADMIN, { openid: STAFF, role: 'staff' })
  await callOk('setRole', ADMIN, { openid: COACH, role: 'coach' })
  ok('更新资料 + 设置角色')

  const types = await callOk('listCardTypes', STAFF)
  assert.ok(types.length >= 4)
  const timesType = types.find(t => t.kind === 'times')
  const card = await callOk('openCard', STAFF, {
    openid: MEMBER, typeId: timesType._id, amount: timesType.price, payMethod: 'cash'
  })
  assert.strictEqual(card.remainTimes, timesType.times)
  ok('前台办卡')

  const myCards = await callOk('myCards', MEMBER)
  assert.strictEqual(myCards.cards.length, 1)
  assert.strictEqual(myCards.cards[0].usable, true)
  ok('会员看到自己的卡')

  const qr = await callOk('entryCode', MEMBER)
  assert.ok(qr.image.startsWith('data:image/'))
  ok('入场码返回二维码图片')

  // 入场码字符串由服务端签名（图片无法在测试里解出），这里验证「伪造码被拒」入口
  const bad = await call('verifyEntry', STAFF, { code: 'FE1.x.1.y' })
  assert.strictEqual(bad.code, 400)
  ok('伪造入场码被拒绝')

  const rank = await callOk('leaderboard', MEMBER, { lift: 'bench', metric: 'absolute' })
  assert.strictEqual(rank.total, 0)
  assert.ok(Array.isArray(rank.top))
  ok('排行榜接口可用')

  const feed = await callOk('momentList', MEMBER, {})
  assert.deepStrictEqual(feed.list, [])
  ok('友圈列表接口可用')

  // ---------- 上传与媒体 ----------
  const fakeJpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x41, 0x42, 0x43])
  const up = await upload(MEMBER, 'jpg', fakeJpg)
  assert.strictEqual(up.code, 0, '上传应成功：' + JSON.stringify(up))
  assert.ok(/^https?:\/\/.+\.?\/api\/media\//.test(up.data.fileID) || up.data.fileID.indexOf('/api/media/') > 0)
  const mediaPath = up.data.fileID.replace(/^https?:\/\/[^/]+/, '')
  const mediaRes = await fetch(BASE + mediaPath)
  assert.strictEqual(mediaRes.status, 200)
  assert.strictEqual(mediaRes.headers.get('content-type'), 'image/jpeg')
  const got = Buffer.from(await mediaRes.arrayBuffer())
  assert.deepStrictEqual(got, fakeJpg)
  ok('上传二进制 → 取回内容完全一致')

  const badExt = await upload(MEMBER, 'exe', fakeJpg)
  assert.strictEqual(badExt.code, 400)
  ok('上传扩展名白名单生效')

  // 用上传的图片发一条友圈，验证 media 表与 moments 表联动
  const posted = await callOk('postMoment', MEMBER, {
    content: 'HTTP 端到端测试', media: [{ fileID: up.data.fileID, type: 'image' }]
  })
  assert.strictEqual(posted.type, 'image')
  assert.strictEqual(posted.media.length, 1)
  const detail = await callOk('momentDetail', MEMBER, { id: posted._id })
  assert.strictEqual(detail._id, posted._id)
  ok('上传的图片可以发友圈并读回')

  const liked = await callOk('likeMoment', STAFF, { id: posted._id })
  assert.deepStrictEqual(liked, { liked: true, likeCount: 1 })
  ok('点赞')

  // ---------- 错误映射 ----------
  const noPerm = await call('dashboard', MEMBER)
  assert.strictEqual(noPerm.code, 400)
  assert.strictEqual(noPerm.msg, '没有权限')
  ok('业务错误映射成 code=400 + 中文提示')

  const notFound = await call('memberDetail', STAFF, { openid: 'nobody' })
  assert.strictEqual(notFound.code, 400)
  assert.ok(notFound.msg.indexOf('会员不存在') >= 0)
  ok('不存在的会员返回业务错误')

  console.log('\n全部 ' + passed + ' 项 HTTP 断言通过')
}

main().catch(err => {
  console.error('\nHTTP 测试失败：', err)
  process.exit(1)
})
