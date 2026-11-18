// 接线：schema 加挑战表/字段、注册 challenge 模块、ACTION_FEATURE、memberRow 加禁赛字段
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

// ---------- 1. schema ----------
edit('schema.sql', t => {
  if (t.includes('create table if not exists challenges')) return t
  return t + `

-- ---------- 会员挑战（裁判制） ----------
create table if not exists challenges (
  id             text primary key,
  challenger     text not null,
  opponent       text not null,
  referee        text not null default '',
  lift_key       text not null default '',
  metric         text not null default 'absolute',
  trash_talk     text not null default '',
  status         text not null default 'pending',
  referee_state  text not null default 'invited',   -- invited / accepted / declined
  judge_result   text not null default '',          -- win_challenger / win_opponent / draw
  judge_note     text not null default '',
  judge_history  jsonb not null default '[]'::jsonb,
  judged_at      bigint not null default 0,
  expire_at      bigint not null default 0,         -- 应战截止
  submit_by      bigint not null default 0,         -- 视频提交截止
  judge_by       bigint not null default 0,         -- 裁判判决截止
  created_at     bigint not null default 0,
  finished_at    bigint not null default 0
);
create index if not exists idx_challenges_opponent on challenges (opponent, status);
create index if not exists idx_challenges_challenger on challenges (challenger, status);
create index if not exists idx_challenges_referee on challenges (referee, status);
create index if not exists idx_challenges_created on challenges (created_at desc);

create table if not exists challenge_videos (
  id           text primary key,
  challenge_id text not null references challenges(id) on delete cascade,
  openid       text not null,
  video_url    text not null,
  video_thumb  text not null default '',
  uploaded_by  text not null default '',
  cheat_flag   boolean not null default false,
  cheat_reason text not null default '',
  created_at   bigint not null default 0
);
create index if not exists idx_challenge_videos on challenge_videos (challenge_id);

create table if not exists challenge_comments (
  id           text primary key,
  challenge_id text not null references challenges(id) on delete cascade,
  openid       text not null,
  content      text not null,
  like_count   int not null default 0,
  status       text not null default 'normal',
  created_at   bigint not null default 0
);
create index if not exists idx_challenge_comments on challenge_comments (challenge_id, created_at);

-- 会员的挑战相关状态：作弊次数 + 禁赛截止
alter table members add column if not exists challenge_cheat_count int not null default 0;
alter table members add column if not exists challenge_ban_until bigint not null default 0;
`
}, 'schema 增加挑战表')

// ---------- 2. index.js：注册模块 + 功能开关映射 ----------
edit('index.js', t => {
  t = t.replace(
    `const MODULES = ['system', 'member', 'admin', 'fitness', 'moment', 'competition']`,
    `const MODULES = ['system', 'member', 'admin', 'fitness', 'moment', 'competition', 'challenge']`
  )
  if (!t.includes('createChallenge:')) {
    t = t.replace(
      `  // 排行榜与竞赛`,
      `  // 会员挑战（裁判制）
  createChallenge: 'rank',
  pickReferee: 'rank',
  respondChallenge: 'rank',
  refereeRespond: 'rank',
  submitChallengeVideo: 'rank',
  judgeChallenge: 'rank',
  challengeList: 'rank',
  challengeDetail: 'rank',
  challengeSummary: 'rank',
  refereeOptions: 'rank',
  // 排行榜与竞赛`
    )
  }
  return t
}, '注册 challenge 模块与 action')

// ---------- 3. memberRow 暴露禁赛信息 ----------
edit('lib/common.js', t => {
  if (t.includes('challengeBanUntil')) return t
  return t.replace(
    `    latestBody: r.latest_body || null,
    createdAt: r.created_at || 0`,
    `    latestBody: r.latest_body || null,
    // 挑战：作弊次数 + 禁赛截止（禁赛期间不能发起/应战）
    challengeCheatCount: r.challenge_cheat_count || 0,
    challengeBanUntil: Number(r.challenge_ban_until) || 0,
    createdAt: r.created_at || 0`
  )
}, 'memberRow 增加挑战字段')

// ---------- 4. 测试表白名单加挑战表 ----------
edit('test/run.js', t => {
  if (t.includes("'challenge_videos'")) return t
  return t.replace(
    `  'competitions', 'competition_entries'`,
    `  'competitions', 'competition_entries',
  'challenges', 'challenge_videos', 'challenge_comments'`
  )
}, '测试清表加入挑战表')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
for (const f of ['lib/challenge.js', 'lib/common.js', 'lib/fitness.js', 'index.js']) {
  require('child_process').execFileSync(process.execPath, ['--check', SERVER + '/' + f])
  console.log('  ✓ 语法 ' + f)
}
