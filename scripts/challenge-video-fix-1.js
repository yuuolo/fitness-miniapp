// 修 3 个问题：
// 1) api.js 没导出 uploadVideo（页面调用报 not a function）
// 2) 裁判可以给双方代传视频（forOpenid）
// 3) 每方最多 9 段视频（原来 1 段）
const fs = require('fs')

const SERVER = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server'
const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const done = []

function edit(p, fn, label) {
  let raw = fs.readFileSync(p, 'utf8')
  const CRLF = raw.includes('\r\n')
  let t = raw.replace(/\r\n/g, '\n')
  const before = t
  t = fn(t)
  if (t !== before) {
    fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
    done.push(label)
  } else {
    console.log('  [!] 无变化：' + label)
  }
}

// ---------- 1. api.js：导出 uploadVideo 等 ─----------
edit(MP + '/utils/api.js', t => t.replace(
  'module.exports = { call, upload, resetLogin }',
  'module.exports = { call, upload, uploadVideo, download, readFile, resetLogin }'
), 'api.js：导出 uploadVideo / download / readFile')

// ---------- 2. challenge.js：裁判代传 + 每方 9 段 ----------
edit(SERVER + '/lib/challenge.js', t => {
  t = t.replace('const MAX_VIDEOS_PER_SIDE = 1      // 每方最多 1 段视频',
    'const MAX_VIDEOS_PER_SIDE = 9      // 每方最多 9 段视频')
  t = t.replace('const MAX_VIDEOS_PER_SIDE = 1', 'const MAX_VIDEOS_PER_SIDE = 9')

  // 重写 submitChallengeVideo
  const start = t.indexOf('async function submitChallengeVideo')
  const end = t.indexOf('// ---------- 判定 ----------')
  if (start < 0 || end < 0) {
    console.log('  [!] 找不到 submitChallengeVideo 区块')
    return t
  }
  const replacement = `async function submitChallengeVideo({ me, data }) {
  need(me, 'member')
  const c = await loadChallenge(String(data.id || ''))
  if (!['accepted', 'waiting_referee'].includes(c.status)) {
    fail('现在不是交视频的阶段（' + (STATUS_NAMES[c.status] || c.status) + '）')
  }

  // 谁上传的：本人或裁判（教练/管理员）代传
  const isReferee = c.referee === me._id || isAdmin(me)
  let owner = me._id
  if (data.forOpenid) {
    if (!isReferee) fail('只有主裁判可以代传视频')
    owner = String(data.forOpenid)
    if (owner !== c.challenger && owner !== c.opponent) fail('只能给挑战双方代传')
  } else if (!isReferee) {
    if (c.challenger !== me._id && c.opponent !== me._id) fail('只有挑战双方能上传视频')
  } else if (c.challenger !== me._id && c.opponent !== me._id && !data.forOpenid) {
    // 裁判自己上传时必须说明是哪一方
    fail('裁判代传请指定是给哪一方')
  }

  const url = String(data.videoUrl || '')
  if (!/^(cloud:\\/\\/|https:\\/\\/)/.test(url)) fail('视频地址不正确')

  const count = (await query(
    'select count(*)::int as n from challenge_videos where challenge_id = $1 and openid = $2',
    [c._id, owner]
  )).rows[0].n
  if (count >= MAX_VIDEOS_PER_SIDE) {
    fail('每方最多 ' + MAX_VIDEOS_PER_SIDE + ' 段视频，请先删掉一些再传')
  }

  const now = Date.now()
  await query(
    \`insert into challenge_videos (id, challenge_id, openid, video_url, video_thumb, uploaded_by, cheat_flag, cheat_reason, created_at)
     values ($1, $2, $3, $4, $5, $6, false, '', $7)\`,
    [newId(), c._id, owner, url, String(data.videoThumb || ''), me._id, now]
  )

  // 双方都至少有一段 → 进入待判决，开始算裁判的 2 小时
  const counts = (await query(
    'select count(distinct openid)::int as n from challenge_videos where challenge_id = $1',
    [c._id]
  )).rows[0].n
  if (counts >= 2) {
    await query(
      "update challenges set status = 'ready', judge_by = $2 where id = $1",
      [c._id, now + JUDGE_MS]
    )
    const ready = await loadChallenge(c._id)
    notifyJudgeReady(ready).catch(() => {})
  }
  return detailById(c._id, me)
}

// 删除一段挑战视频（本人可删自己的，裁判/管理员可删任意）
async function deleteChallengeVideo({ me, data }) {
  need(me, 'member')
  const id = String(data.id || '')
  const video = (await query('select * from challenge_videos where id = $1', [id])).rows[0]
  if (!video) fail('视频不存在')
  const c = await loadChallenge(video.challenge_id)
  const isReferee = c.referee === me._id || isAdmin(me)
  if (!isReferee && video.openid !== me._id) fail('只能删除自己的视频')
  if (c.status === 'judged' && !isAdmin(me)) fail('已判定的挑战不能再删视频')
  await query('delete from challenge_videos where id = $1', [id])
  return detailById(c._id, me)
}

`
  t = t.slice(0, start) + replacement + t.slice(end)

  // 导出新 action
  t = t.replace('  submitChallengeVideo,\n', '  submitChallengeVideo,\n  deleteChallengeVideo,\n')

  // 详情里补充：能否代传（裁判）+ 双方视频数量
  t = t.replace(
    `    canSubmitVideo: ['accepted', 'waiting_referee'].includes(c.status) &&
      (c.challenger === me._id || c.opponent === me._id),`,
    `    canSubmitVideo: ['accepted', 'waiting_referee'].includes(c.status) &&
      (c.challenger === me._id || c.opponent === me._id || c.referee === me._id || isAdmin(me)),
    // 裁判 / 管理员可以给任意一方代传
    canProxyVideo: ['accepted', 'waiting_referee'].includes(c.status) &&
      (c.referee === me._id || isAdmin(me)) && c.challenger !== me._id && c.opponent !== me._id,
    videoLimit: MAX_VIDEOS_PER_SIDE,`
  )
  return t
}, 'challenge.js：裁判代传 + 每方 9 段 + 删视频')

// ---------- 3. index.js 注册 deleteChallengeVideo ----------
edit(SERVER + '/index.js', t => {
  if (t.includes('deleteChallengeVideo:')) return t
  return t.replace(
    `  submitChallengeVideo: 'rank',`,
    `  submitChallengeVideo: 'rank',
  deleteChallengeVideo: 'rank',`
  )
}, 'index.js：注册 deleteChallengeVideo')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['utils/api.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', MP + '/' + f])
}
for (const f of ['lib/challenge.js', 'index.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', SERVER + '/' + f])
}
console.log('  ✓ 语法通过')
