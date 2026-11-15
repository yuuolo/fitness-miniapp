#!/usr/bin/env bash
# 每天自动备份数据库，保留最近 14 天
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p backups

docker compose exec -T -e PGPASSWORD="$PW" db pg_dump -U postgres -d gym \
  | gzip > "backups/gym-$TS.sql.gz"

# 校验备份不是空的
SIZE=$(stat -c %s "backups/gym-$TS.sql.gz")
if [ "$SIZE" -lt 1000 ]; then
  echo "备份文件太小（$SIZE 字节），可能失败" >&2
  exit 1
fi

# 只保留最近 14 个
ls -1t backups/gym-2*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "备份完成：backups/gym-$TS.sql.gz（$SIZE 字节）"
