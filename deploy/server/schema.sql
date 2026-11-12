-- 自建后端初始表结构（docker compose 首次启动自动执行）
-- 只建了最小可用集合，迁移时按云开发集合逐个补

create table if not exists members (
  openid       text primary key,
  nick_name    text default '',
  phone        text default '',
  role         text default 'member',
  points       int  default 0,
  created_at   timestamptz default now()
);

create table if not exists body_records (
  id           bigserial primary key,
  openid       text not null references members(openid) on delete cascade,
  date         date,
  weight       numeric(5,1),
  height       numeric(5,1),
  body_fat     numeric(4,1),
  muscle       numeric(5,1),
  visceral     numeric(4,1),
  bmi          numeric(4,1),
  score        int,
  measured_at  timestamptz default now()
);

create index if not exists idx_body_openid_time on body_records (openid, measured_at desc);

create table if not exists moments (
  id           bigserial primary key,
  openid       text not null references members(openid) on delete cascade,
  content      text default '',
  media        jsonb default '[]'::jsonb,
  status       text default 'normal',
  coach_name   text default '',
  created_at   timestamptz default now()
);

create index if not exists idx_moments_time on moments (created_at desc);
