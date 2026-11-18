// 1) 双方确认后即可上传视频（不用等裁判接单）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/challenge.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
const done = []

function rep(from, to, label) {
  if (t.includes(to) && !t.includes(from)) {
    console.log('  · 已改：' + label)
    return
  }
  if (!t.includes(from)) {
    console.log('  [!] 未匹配：' + label)
    return
  }
  t = t.replace(from, to)
  done.push(label)
}

// 1.1 状态名：waiting_referee 改成「上传视频中」的语义
rep(
  `  waiting_referee: '等裁判确认',`,
  `  waiting_referee: '上传视频中',`,
  '状态名 waiting_referee'
)

// 1.2 应战：立刻开始 2 小时视频倒计时，不等裁判
rep(
  `  // 裁判已接受 → 直接进入视频阶段；否则等裁判
  if (c.refereeState === 'accepted') {
    await query(
      "update challenges set status = 'accepted', submit_by = $2 where id = $1",
      [c._id, now + VIDEO_MS]
    )
  } else {
    await query("update challenges set status = 'waiting_referee' where id = $1", [c._id])
  }`,
  `  // 双方确认后立刻开始 2 小时视频倒计时；裁判还没接单也不影响传视频
  if (c.refereeState === 'accepted') {
    await query(
      "update challenges set status = 'accepted', submit_by = $2 where id = $1",
      [c._id, now + VIDEO_MS]
    )
  } else {
    await query(
      "update challenges set status = 'waiting_referee', submit_by = $2 where id = $1",
      [c._id, now + VIDEO_MS]
    )
  }`,
  '应战即开始视频倒计时'
)

// 1.3 交视频：waiting_referee 也允许
rep(
  `  if (c.status !== 'accepted') fail('现在不是交视频的阶段（' + (STATUS_NAMES[c.status] || c.status) + '）')`,
  `  if (!['accepted', 'waiting_referee'].includes(c.status)) {
    fail('现在不是交视频的阶段（' + (STATUS_NAMES[c.status] || c.status) + '）')
  }`,
  '交视频允许 waiting_referee'
)

// 1.4 双方交齐 → 待判决（不管裁判是否已接单）
rep(
  `  if (counts >= 2) {
    await query(
      "update challenges set status = 'ready', judge_by = $2 where id = $1",
      [c._id, now + JUDGE_MS]
    )
    const ready = await loadChallenge(c._id)
    notifyJudgeReady(ready).catch(() => {})
  }`,
  `  if (counts >= 2) {
    await query(
      "update challenges set status = 'ready', judge_by = $2 where id = $1",
      [c._id, now + JUDGE_MS]
    )
    const ready = await loadChallenge(c._id)
    notifyJudgeReady(ready).catch(() => {})
  }`,
  '交齐进入待判决'
)

// 1.5 裁判后接单时：如果双方视频已交齐 → 直接 ready；否则进入视频阶段
rep(
  `  // 接受：如果对方已经应战，进入视频阶段
  if (c.status === 'waiting_referee') {
    await query(
      \`update challenges set referee_state = 'accepted', status = 'accepted', submit_by = $2
        where id = $1\`,
      [c._id, now + VIDEO_MS]
    )
  } else {
    await query("update challenges set referee_state = 'accepted' where id = $1", [c._id])
  }`,
  `  // 接受：按当前进度决定状态（视频已交齐就直接待判决）
  await query("update challenges set referee_state = 'accepted' where id = $1", [c._id])
  const vids = (await query(
    'select count(distinct openid)::int as n from challenge_videos where challenge_id = $1',
    [c._id]
  )).rows[0].n
  if (vids >= 2) {
    await query(
      "update challenges set status = 'ready', judge_by = $2 where id = $1",
      [c._id, now + JUDGE_MS]
    )
  } else if (c.status === 'waiting_referee') {
    await query(
      "update challenges set status = 'accepted', submit_by = coalesce(nullif(submit_by, 0), $2) where id = $1",
      [c._id, now + VIDEO_MS]
    )
  }`,
  '裁判后接单按进度推进'
)

// 1.6 超时处理：waiting_referee 也算「进行中」
rep(
  `  if (c.status === 'accepted' && c.submitBy && now > c.submitBy) {`,
  `  if ((c.status === 'accepted' || c.status === 'waiting_referee') && c.submitBy && now > c.submitBy) {`,
  '超时流局包含 waiting_referee'
)

// 1.7 前端可操作标记：waiting_referee 也能传视频
rep(
  `    canSubmitVideo: c.status === 'accepted' && (c.challenger === me._id || c.opponent === me._id),`,
  `    canSubmitVideo: ['accepted', 'waiting_referee'].includes(c.status) &&
      (c.challenger === me._id || c.opponent === me._id),`,
  'canSubmitVideo 包含 waiting_referee'
)

// 1.8 倒计时：waiting_referee 用 submit_by
rep(
  `    deadline: c.status === 'pending' ? c.expireAt
      : c.status === 'accepted' ? c.submitBy
        : c.status === 'ready' ? c.judgeBy : 0`,
  `    deadline: c.status === 'pending' ? c.expireAt
      : (c.status === 'accepted' || c.status === 'waiting_referee') ? c.submitBy
        : c.status === 'ready' ? c.judgeBy : 0`,
  '倒计时包含 waiting_referee'
)

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')
