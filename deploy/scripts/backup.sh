#!/usr/bin/env bash
# 数据库备份：docker exec pg_dump → /opt/gym/backups/gym-YYYYmmdd-HHMMSS.sql.gz，保留最近 14 份
#
# 手动执行：
#   ssh gym 'bash /opt/gym/scripts/backup.sh'
#
# 每天自动备份（在服务器上执行一次）：
#   ssh gym '(crontab -l 2>/dev/null; echo "17 4 * * * bash /opt/gym/scripts/backup.sh >> /opt/gym/backups/cron.log 2>&1") | crontab -'
#
# 恢复：
#   ssh gym 'gunzip -c /opt/gym/backups/gym-XXXX.sql.gz | docker compose -f /opt/gym/docker-compose.yml exec -T db psql -U postgres -d gym'
set -euo pipefail

cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
BACKUP_DIR="${BACKUP_DIR:-/opt/gym/backups}"
KEEP="${KEEP:-14}"

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
FILE="$BACKUP_DIR/gym-$STAMP.sql.gz"

docker compose exec -T -e PGPASSWORD="$PW" db \
  pg_dump -U postgres -d gym --no-owner --clean --if-exists \
  | gzip > "$FILE"

# 校验：gzip 完整且内容非空
if ! gzip -t "$FILE" 2>/dev/null || [ ! -s "$FILE" ]; then
  echo "[x] 备份文件损坏或为空：$FILE" >&2
  rm -f "$FILE"
  exit 1
fi

SIZE=$(du -h "$FILE" | cut -f1)
echo "[ok] $FILE ($SIZE)"

# 只保留最近 KEEP 份
ls -1t "$BACKUP_DIR"/gym-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  rm -f "$old"
  echo "[..] 清理旧备份 $old"
done

echo "[ok] 现有备份：$(ls -1 "$BACKUP_DIR"/gym-*.sql.gz 2>/dev/null | wc -l) 份"
