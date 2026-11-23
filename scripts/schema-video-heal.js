// schema 自愈：给已存在的表补视频列（staging 恢复旧备份后缺列，导致录力量成绩视频失败）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/schema.sql'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

if (t.includes('add column if not exists video_url')) {
  console.log('· 已有列补丁')
  process.exit(0)
}

t += `
-- ---------- 视频列自愈（老库恢复备份后可能缺列，create table if not exists 补不上） ----------
alter table strength_records add column if not exists video_url text not null default '';
alter table strength_records add column if not exists video_thumb text not null default '';
alter table competition_entries add column if not exists video_url text not null default '';
alter table competition_entries add column if not exists video_thumb text not null default '';
alter table moments add column if not exists status text not null default 'normal';
alter table moments add column if not exists short text not null default '';
`

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ schema.sql 增加视频列自愈语句')
