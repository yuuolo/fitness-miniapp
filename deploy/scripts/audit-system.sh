#!/usr/bin/env bash
# 系统现状体检：运行状态、资源、数据、配置、错误日志
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }

echo '########## 1. 容器与运行时间 ##########'
docker compose ps --format '{{.Name}}\t{{.Status}}\t{{.Ports}}'
echo
echo '--- 宿主机 ---'
uptime
free -h | head -2
df -h / | tail -1
echo
echo '--- 容器资源占用（快照）---'
timeout 12 docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}' 2>/dev/null || echo '(docker stats 超时)'

echo
echo '########## 2. 服务健康 ##########'
curl -sS -m 5 -o /dev/null -w 'health=%{http_code} 耗时=%{time_total}s\n' http://127.0.0.1/health
curl -sS -m 5 -o /dev/null -w 'admin=%{http_code} 耗时=%{time_total}s\n' http://127.0.0.1/admin
echo '--- 首页接口耗时（未登录应 400，看响应时间）---'
curl -sS -m 5 -o /dev/null -w 'api=%{http_code} 耗时=%{time_total}s\n' -X POST http://127.0.0.1/api \
  -H 'content-type: application/json' --data-binary '{"action":"home","data":{}}'

echo
echo '########## 3. 数据库 ##########'
psql -tAc "select 'DB 大小: ' || pg_size_pretty(pg_database_size('gym'));"
psql -tAc "select '连接数: ' || count(*) from pg_stat_activity where datname='gym';"
echo '--- 各表大小 Top 8 ---'
psql -tAc "select relname || '  ' || pg_size_pretty(pg_total_relation_size(c.oid))
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
order by pg_total_relation_size(c.oid) desc limit 8;"
echo '--- 数据量 ---'
psql -tAc "select relname || '=' || n_live_tup from pg_stat_user_tables where n_live_tup>0 order by n_live_tup desc;"

echo
echo '########## 4. 配置完整性（只看有没有配，不打印值）##########'
for k in DOMAIN POSTGRES_PASSWORD WX_APPID WX_SECRET WX_TPL_BOOKING_SUCCESS WX_TPL_CLASS_REMINDER WX_TPL_CARD_EXPIRE ADMIN_PASSWORD CONFIG_SECRET OCR_URL PUBLIC_BASE_URL; do
  v=$(sed -n "s/^$k=//p" .env)
  if [ -z "$v" ]; then echo "  $k: 未配置"
  else echo "  $k: 已配置（${#v} 字符）"; fi
done

echo
echo '########## 5. 备份 ##########'
ls -lat backups/*.gz 2>/dev/null | head -5
echo '  应用备份份数: '"$(ls -1 backups/app-*.jsonl.gz 2>/dev/null | wc -l)"
echo '  备份目录占用: '"$(du -sh backups 2>/dev/null | cut -f1)"

echo
echo '########## 6. 错误日志（最近 200 行里的异常）##########'
docker compose logs --tail=200 server 2>&1 | grep -iE 'error|failed|异常|ECONN|timeout' | tail -12 || echo '  无明显错误'
echo
echo '--- OCR 服务日志尾部 ---'
docker compose logs --tail=20 ocr 2>&1 | tail -5

echo
echo '########## 7. 定时任务是否在跑 ##########'
docker compose logs --tail=500 server 2>&1 | grep -c 'cron' || true
psql -tAc "select 'lastBackup(config): ' || coalesce(value::text,'(无)') from config where key='lastBackup';" 2>/dev/null || true
