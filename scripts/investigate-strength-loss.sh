#!/usr/bin/env bash
# 排查：力量成绩为什么没了
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }

echo '=== strength_records 行数 ==='
psql -tAc "select count(*) from strength_records;"

echo '=== members.best_lift 现状 ==='
psql -c "select nick_name, best_lift::text, sbd_total, updated_at from members order by created_at;" 2>/dev/null || \
psql -c "select nick_name, best_lift::text, sbd_total from members order by created_at;"

echo '=== 最近的备份文件 ==='
ls -lht /opt/gym/backups/ | head -8

echo '=== 今天的备份里有多少条力量成绩（取最近一个 sql 备份）==='
LATEST=$(ls -t /opt/gym/backups/gym-*.sql.gz 2>/dev/null | head -1)
echo "检查: $LATEST"
if [ -n "$LATEST" ]; then
  gunzip -c "$LATEST" > /tmp/checkbackup.sql 2>/dev/null
  grep -c "COPY public.strength_records" /tmp/checkbackup.sql || true
  # 统计 strength_records 的数据行数量（COPY 块）
  awk '/^COPY public.strength_records/{flag=1;next}/^\\\.$/{flag=0}flag{c++}END{print "strength_records 行数:", c+0}' /tmp/checkbackup.sql
  rm -f /tmp/checkbackup.sql
fi

echo '=== 服务日志里最近的删除动作 ==='
docker compose logs server --since 24h 2>&1 | grep -iE 'delete|删除|strength' | tail -20 || true
