-- 自建后端完整表结构（幂等：服务启动时会再执行一次，必须全部使用 IF NOT EXISTS）
-- 所有时间字段都存 epoch 毫秒（bigint），与云开发后端返回给小程序的值完全一致；
-- 所有业务日期存 'YYYY-MM-DD' 文本（北京时间），避免时区换算。

create table if not exists config (
  key    text primary key,
  value  jsonb not null default '{}'::jsonb
);

create table if not exists members (
  openid         text primary key,
  nick_name      text not null default '',
  phone          text not null default '',
  role           text not null default 'member',
  no_show        int  not null default 0,
  block_until    bigint not null default 0,
  avatar         text not null default '',
  gender         text not null default '',
  height         numeric(5,1) not null default 0,
  is_body_public boolean not null default false,
  best_lift      jsonb not null default '{}'::jsonb,
  sbd_total      numeric(7,1) not null default 0,
  latest_body    jsonb,
  created_at     bigint not null default 0
);











create table if not exists body_records (
  id                      text primary key,
  openid                  text not null references members(openid) on delete cascade,
  date                    text not null,
  measured_at             bigint not null default 0,
  weight                  numeric(5,1) not null default 0,
  height                  numeric(5,1) not null default 0,
  bmi                     numeric(5,1) not null default 0,
  gender                  text not null default '',
  body_fat                numeric(4,1),
  heart_rate              numeric(5,1),
  muscle                  numeric(5,1),
  muscle_rate             numeric(5,1),
  protein                 numeric(5,1),
  protein_rate            numeric(5,1),
  water                   numeric(5,1),
  water_rate              numeric(5,1),
  bone_mass               numeric(5,1),
  bone_rate               numeric(5,1),
  fat_mass                numeric(6,1),
  skeletal_muscle         numeric(5,1),
  visceral                numeric(4,1),
  waist_hip_ratio         numeric(4,2),
  body_age                numeric(5,1),
  skeletal_muscle_index   numeric(6,1),
  recommended_calories    numeric(7,1),
  bmr                     numeric(6,1),
  fat_free_mass           numeric(6,1),
  device_score            numeric(5,1),
  segment_fat             jsonb not null default '{}'::jsonb,
  segment_muscle          jsonb not null default '{}'::jsonb,
  body_shape              text not null default '',
  body_type               text not null default '',
  device_name             text not null default '',
  report_image            text not null default '',
  score                   numeric(5,0),
  detail                  jsonb not null default '[]'::jsonb,
  source                  text not null default 'staff',
  operator                text not null default '',
  created_at              bigint not null default 0
);
create index if not exists idx_body_openid_time on body_records (openid, measured_at desc);

create table if not exists strength_records (
  id         text primary key,
  openid     text not null references members(openid) on delete cascade,
  lift       text not null,
  weight     numeric(5,1) not null default 0,
  reps       int  not null default 1,
  one_rm     numeric(6,1) not null default 0,
  date       text not null,
  operator   text not null default '',
  created_at bigint not null default 0,
  video_url   text not null default '',
  video_thumb text not null default ''
);
create index if not exists idx_strength_openid on strength_records (openid, created_at desc);

create table if not exists activity_records (
  id         text primary key,
  openid     text not null references members(openid) on delete cascade,
  date       text not null,
  type       text not null default 'other',
  steps      int  not null default 0,
  distance   numeric not null default 0,
  duration   int  not null default 0,
  calories   int  not null default 0,
  avg_hr     int  not null default 0,
  source     text not null default 'staff',
  external_id text not null default '',
  operator   text not null default '',
  created_at bigint not null default 0
);
create index if not exists idx_activity_openid on activity_records (openid, date desc);
-- 对接手机/手环/手表时用来去重（同来源同外部 ID 只留一条）
alter table activity_records add column if not exists external_id text not null default '';
create index if not exists idx_activity_external on activity_records (external_id);

create table if not exists moments (
  id          text primary key,
  openid      text not null,
  author_name text not null default '',
  content     text not null default '',
  media       jsonb not null default '[]'::jsonb,
  type        text not null default 'text',
  coach_id    text not null default '',
  coach_name  text not null default '',
  liked_by    jsonb not null default '[]'::jsonb,
  short       text not null default '',
  poster_qr   text not null default '',
  status      text not null default 'normal',
  date        text not null,
  created_at  bigint not null default 0
);
create index if not exists idx_moments_time on moments (status, created_at desc);
create unique index if not exists uq_moments_short on moments (short) where short <> '';

-- 小程序/海报等静态媒体（自建后端自己的文件存储，替代云存储 fileID）
create table if not exists media (
  id         text primary key,
  mime       text not null default 'image/jpeg',
  bytes      bytea not null,
  created_at bigint not null default 0
);

-- ---------- 排行榜项目（可增删） ----------
create table if not exists lift_items (
  key        text primary key,
  name       text not null,
  metric     text not null default 'oneRM',   -- oneRM 估算1RM / maxWeight 最大重量 / reps 次数 / volume 单组容量
  unit       text not null default 'kg',
  enabled    boolean not null default true,
  sort       int  not null default 0,
  created_at bigint not null default 0
);

-- 默认项目不在这里插入：schema.sql 每次启动都会执行，
-- 放在这里会导致管理员删掉的项目被重启自动补回来。
-- 首次启动的空表初始化由 lib/lift-items.js 的 ensureSeed() 负责，
-- 想找回删掉的项目用管理页「恢复默认五项」。

-- ---------- 竞赛（教练/店员发起，有起止时间和奖品） ----------
create table if not exists competitions (
  id              text primary key,
  title           text not null,
  descr           text not null default '',
  lift_key        text not null default '',
  lift_name       text not null default '',
  metric          text not null default 'oneRM',
  unit            text not null default 'kg',
  start_at        bigint not null default 0,
  end_at          bigint not null default 0,
  prize           text not null default '',
  rules           text not null default '',
  status          text not null default 'active',  -- active / ended / cancelled
  created_by      text not null default '',
  created_by_name text not null default '',
  created_at      bigint not null default 0
);
create index if not exists idx_competitions_status on competitions (status, end_at desc);

-- ---------- 竞赛成绩（每个参赛者可以有多条，取最好的一条参与排名） ----------
create table if not exists competition_entries (
  id             text primary key,
  competition_id text not null references competitions(id) on delete cascade,
  openid         text not null,
  member_name    text not null default '',
  value          numeric(8,2) not null default 0,
  weight         numeric(6,2) not null default 0,
  reps           int  not null default 0,
  note           text not null default '',
  video_url      text not null default '',
  video_thumb    text not null default '',
  operator       text not null default '',
  recorded_at    bigint not null default 0,
  created_at     bigint not null default 0
);
create index if not exists idx_entries_comp on competition_entries (competition_id, value desc);
create index if not exists idx_entries_member on competition_entries (competition_id, openid);

-- 早期骨架版本建的 members 表缺这些列：补列保证旧库可以平滑升级
alter table members add column if not exists no_show        int  not null default 0;
alter table members add column if not exists block_until    bigint not null default 0;
alter table members add column if not exists avatar         text not null default '';
alter table members add column if not exists gender         text not null default '';
alter table members add column if not exists height         numeric(5,1) not null default 0;
alter table members add column if not exists is_body_public boolean not null default false;
alter table members add column if not exists best_lift      jsonb not null default '{}'::jsonb;
alter table members add column if not exists sbd_total      numeric(7,1) not null default 0;
alter table members add column if not exists latest_body    jsonb;

-- 「前台」角色已移除：历史 staff 账号一次性迁移成管理员（幂等）
update members set role = 'admin' where role = 'staff';

-- 运动数据补「距离」列（骑行/跑步/游泳用），老库升级用
alter table activity_records add column if not exists distance numeric not null default 0;


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

-- 评论点赞（一人一次，可取消）
create table if not exists challenge_comment_likes (
  comment_id text not null references challenge_comments(id) on delete cascade,
  openid     text not null,
  created_at bigint not null default 0,
  primary key (comment_id, openid)
);

-- 判定时的成绩快照（「以下克上」徽章用）
alter table challenges add column if not exists judge_snapshot jsonb not null default '{}'::jsonb;

-- 「内容更新通知」订阅票（一次授权一张票，发一条扣一张）
create table if not exists notify_subscriptions (
  openid     text not null,
  topic      text not null,
  tickets    int not null default 0,
  updated_at bigint not null default 0,
  primary key (openid, topic)
);
