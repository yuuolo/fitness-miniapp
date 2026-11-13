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
  points         int  not null default 0,
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

create table if not exists card_types (
  id         text primary key,
  name       text not null,
  kind       text not null,
  times      int  not null default 0,
  days       int  not null default 0,
  price      int  not null default 0,
  descr      text not null default '',
  on_sale    boolean not null default true,
  created_at bigint not null default 0
);

create table if not exists member_cards (
  id                 text primary key,
  openid             text not null references members(openid) on delete cascade,
  type_id            text not null default '',
  name               text not null default '',
  kind               text not null default 'times',
  remain_times       int  not null default 0,
  total_times        int  not null default 0,
  pending            int  not null default 0,
  start_at           bigint not null default 0,
  expire_at          bigint not null default 0,
  status             text not null default 'active',
  paused_at          bigint not null default 0,
  expire_reminded_at bigint not null default 0,
  operator           text not null default '',
  created_at         bigint not null default 0
);
create index if not exists idx_cards_openid on member_cards (openid, created_at desc);

create table if not exists card_logs (
  id         text primary key,
  card_id    text not null default '',
  openid     text not null default '',
  change     int  not null default 0,
  reason     text not null default '',
  operator   text not null default '',
  created_at bigint not null default 0
);
create index if not exists idx_card_logs_card on card_logs (card_id, created_at desc);

create table if not exists offline_payments (
  id              text primary key,
  openid          text not null default '',
  member_name     text not null default '',
  card_id         text not null default '',
  type_name       text not null default '',
  list_price      int  not null default 0,
  amount          int  not null default 0,
  pay_method      text not null default '',
  pay_method_name text not null default '',
  remark          text not null default '',
  operator        text not null default '',
  operator_name   text not null default '',
  date            text not null,
  created_at      bigint not null default 0
);
create index if not exists idx_payments_date on offline_payments (date, created_at desc);

create table if not exists schedules (
  id          text primary key,
  course_name text not null default '',
  kind        text not null default 'group',
  coach_id    text not null default '',
  coach_name  text not null default '',
  start_at    bigint not null default 0,
  duration    int  not null default 60,
  capacity    int  not null default 1,
  booked      int  not null default 0,
  room        text not null default '',
  status      text not null default 'active',
  created_at  bigint not null default 0
);
create index if not exists idx_schedules_start on schedules (start_at);

create table if not exists bookings (
  id            text primary key,
  type          text not null,
  openid        text not null,
  member_name   text not null default '',
  member_phone  text not null default '',
  schedule_id   text not null default '',
  kind          text not null default '',
  title         text not null default '',
  coach_id      text not null default '',
  coach_name    text not null default '',
  room          text not null default '',
  venue_id      text not null default '',
  slot_id       text not null default '',
  date          text not null default '',
  hour          int  not null default 0,
  start_at      bigint not null default 0,
  end_at        bigint not null default 0,
  price         int  not null default 0,
  card_id       text not null default '',
  card_name     text not null default '',
  status        text not null default 'booked',
  reminded_at   bigint not null default 0,
  checked_at    bigint not null default 0,
  operator      text not null default '',
  cancelled_at  bigint not null default 0,
  cancelled_by  text not null default '',
  used_at       bigint not null default 0,
  created_at    bigint not null default 0
);
create index if not exists idx_bookings_openid on bookings (openid, start_at desc);
create index if not exists idx_bookings_schedule on bookings (schedule_id, status);
create index if not exists idx_bookings_venue on bookings (venue_id, date);

create table if not exists venues (
  id         text primary key,
  name       text not null,
  descr      text not null default '',
  open_hour  int  not null default 0,
  close_hour int  not null default 24,
  capacity   int  not null default 1,
  price      int  not null default 0,
  on_sale    boolean not null default true,
  created_at bigint not null default 0
);

create table if not exists venue_slots (
  id       text primary key,
  venue_id text not null,
  date     text not null,
  hour     int  not null,
  count    int  not null default 0
);

create table if not exists entry_logs (
  id         text primary key,
  openid     text not null default '',
  date       text not null,
  result     text not null default 'ok',
  reason     text not null default '',
  card_id    text not null default '',
  card_name  text not null default '',
  operator   text not null default '',
  created_at bigint not null default 0
);
create index if not exists idx_entry_logs_openid on entry_logs (openid, created_at desc);
create index if not exists idx_entry_logs_date on entry_logs (date, result);

create table if not exists points_logs (
  id         text primary key,
  openid     text not null,
  change     int  not null default 0,
  source     text not null default '',
  created_at bigint not null default 0
);
create index if not exists idx_points_openid on points_logs (openid, created_at desc);

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
  created_at bigint not null default 0
);
create index if not exists idx_strength_openid on strength_records (openid, created_at desc);

create table if not exists activity_records (
  id         text primary key,
  openid     text not null references members(openid) on delete cascade,
  date       text not null,
  type       text not null default 'other',
  steps      int  not null default 0,
  duration   int  not null default 0,
  calories   int  not null default 0,
  avg_hr     int  not null default 0,
  source     text not null default 'staff',
  operator   text not null default '',
  created_at bigint not null default 0
);
create index if not exists idx_activity_openid on activity_records (openid, date desc);

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
