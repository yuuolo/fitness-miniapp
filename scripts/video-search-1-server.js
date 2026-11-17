// 服务端：力量成绩支持视频；友圈列表支持搜索/只看视频
const fs = require('fs')

const SERVER = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server'
const done = []

function edit(file, fn, label) {
  const p = SERVER + '/' + file
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

// ---------- 1. schema：力量成绩视频列 ----------
edit('schema.sql', t => {
  if (t.includes('strength_records') && t.includes('video_url text')) return t
  // 找到 strength_records 建表语句，补两列
  const marker = `create table if not exists strength_records (`
  const idx = t.indexOf(marker)
  if (idx < 0) {
    console.log('  [!] 找不到 strength_records 建表')
    return t
  }
  const end = t.indexOf(');', idx)
  let block = t.slice(idx, end)
  if (!block.includes('video_url')) {
    block = block.replace(/\n\);?$/, '\n')
    block = block.replace(/\n$/, '') + `,\n  video_url   text not null default '',\n  video_thumb text not null default ''\n`
  }
  let after = t.slice(end)
  after = after.replace(
    /^(;\n)/,
    `;
alter table strength_records add column if not exists video_url text not null default '';
alter table strength_records add column if not exists video_thumb text not null default '';
`
  )
  return t.slice(0, idx) + block + after
}, 'schema 增加力量视频列')

// ---------- 2. strengthRow 返回视频 ----------
edit('lib/common.js', t => {
  t = t.replace(
    `function strengthRow(r) {
  return {
    _id: r.id, openid: r.openid, lift: r.lift, weight: r.weight, reps: r.reps,
    oneRM: r.one_rm, date: r.date, operator: r.operator, createdAt: r.created_at
  }
}`,
    `function strengthRow(r) {
  return {
    _id: r.id, openid: r.openid, lift: r.lift, weight: r.weight, reps: r.reps,
    oneRM: r.one_rm, date: r.date, operator: r.operator, createdAt: r.created_at,
    // 力量成绩可以附一段视频（录错/争议时回看）
    videoUrl: r.video_url || '',
    videoThumb: r.video_thumb || ''
  }
}`
  )
  return t
}, 'strengthRow 返回视频')

// ---------- 3. saveStrength 接收视频 ----------
edit('lib/fitness.js', t => {
  if (t.includes('videoUrl')) return t
  t = t.replace(
    `  // one_rm 列存的是「按该项目算法算出的成绩」，排行榜直接按它排名
  const score = liftItems.computeValue(item.metric, weight, reps)`,
    `  // one_rm 列存的是「按该项目算法算出的成绩」，排行榜直接按它排名
  const score = liftItems.computeValue(item.metric, weight, reps)
  // 可选：附一段视频（已由 /api/video 上传，超时长的会被自动裁切）
  const videoUrl = String(data.videoUrl || '')
  const videoThumb = String(data.videoThumb || '')
  if (videoUrl && !/^(cloud:\\/\\/|https:\\/\\/)/.test(videoUrl)) fail('视频地址不正确')`
  )
  t = t.replace(
    `      \`insert into strength_records (id, openid, lift, weight, reps, one_rm, date, operator, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)\`,
      [newId(), target._id, lift, weight, reps, score, date, me._id, now]`,
    `      \`insert into strength_records (id, openid, lift, weight, reps, one_rm, date, video_url, video_thumb, operator, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)\`,
      [newId(), target._id, lift, weight, reps, score, date, videoUrl, videoThumb, me._id, now]`
  )
  // 返回值带上视频
  t = t.replace(
    `      weight,
      reps,
      oneRM: score,
      value: score,`,
    `      weight,
      reps,
      oneRM: score,
      value: score,
      videoUrl,
      videoThumb,`
  )
  return t
}, 'saveStrength 支持视频')

// ---------- 4. momentList 支持搜索与只看视频 ----------
edit('lib/moment.js', t => {
  const from = `async function momentList({ me, data }) {
  need(me, 'member')
  const before = Number(data.before) || 0
  const list = (await query(
    \`select * from moments where status = 'normal'
       and ($1::bigint = 0 or created_at < $1::bigint)
     order by created_at desc limit $2\`,
    [before, PAGE_SIZE]
  )).rows.map(momentRow)`
  const to = `async function momentList({ me, data }) {
  need(me, 'member')
  const before = Number(data.before) || 0
  // 搜索：1 个字起就能搜（内容或作者名）；只看视频
  const keyword = String(data.keyword || '').trim().slice(0, 30)
  const onlyVideo = data.onlyVideo === true || data.onlyVideo === '1'
  const params = [before, PAGE_SIZE]
  let where = \`status = 'normal' and ($1::bigint = 0 or created_at < $1::bigint)\`
  if (keyword) {
    params.push('%' + keyword + '%')
    where += ' and (content ilike $' + params.length + ' or author_name ilike $' + params.length + ')'
  }
  if (onlyVideo) {
    where += " and type = 'video'"
  }
  const list = (await query(
    \`select * from moments where \` + where + \` order by created_at desc limit $2\`,
    params
  )).rows.map(momentRow)`
  if (!t.includes(from)) {
    console.log('  [!] 未匹配 momentList')
    return t
  }
  t = t.replace(from, to)
  return t
}, 'momentList 支持搜索')

// 列表出参带上搜索条件（前端好判断还有没有更多）
edit('lib/moment.js', t => {
  t = t.replace(
    `    hasMore: list.length === PAGE_SIZE,
    feedThumbs: cfg.feedThumbs`,
    `    hasMore: list.length === PAGE_SIZE,
    feedThumbs: cfg.feedThumbs,
    keyword: String(data.keyword || '').trim(),
    onlyVideo: data.onlyVideo === true || data.onlyVideo === '1'`
  )
  return t
}, '列表出参带搜索条件')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['lib/common.js', 'lib/fitness.js', 'lib/moment.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', SERVER + '/' + f])
  console.log('  ✓ 语法 ' + f)
}
