#!/usr/bin/env bash
# 查力量成绩是什么时候没的：统计信息 + 应用备份里是否还有
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }

echo '=== strength_records 的统计信息 ==='
psql -c "select relname, n_live_tup, n_tup_ins, n_tup_del, last_vacuum, last_autovacuum, last_analyze
           from pg_stat_user_tables where relname in ('strength_records','members','body_records');"

echo '=== 应用备份里有没有力量成绩 ==='
for F in $(ls -t /opt/gym/backups/app-*.jsonl.gz 2>/dev/null | head -2); do
  echo "--- $F ---"
  gunzip -c "$F" | grep -c '"table":"strength_records"' || true
  gunzip -c "$F" | grep '"table":"strength_records"' | head -2 | cut -c1-200 || true
done

echo '=== 备份文件的时间顺序 ==='
ls -lht /opt/gym/backups/app-*.jsonl.gz 2>/dev/null | head -4
