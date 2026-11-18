#!/usr/bin/env bash
# ⚠️ 危险：这个脚本会删除生产库里**所有**力量成绩（历史事故来源之一）
# 必须显式确认：ALLOW_PROD_DELETE=1 bash DANGER-cleanup-chart-data.sh
if [ "${ALLOW_PROD_DELETE:-}" != "1" ]; then
  echo '已拒绝执行：这会删除生产库的全部力量成绩。'
  echo '确实要清空的话：ALLOW_PROD_DELETE=1 bash $0'
  exit 1
fi

# 清理图表验证用的测试数据（保留原有账号与数据）
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }

echo "=== 清理前 ==="
psql -c "select role, count(*) from members group by role;"
psql -c "select count(*) as strength_records from strength_records;"

psql -q <<'SQL'
begin;
delete from strength_records;
delete from members where openid like 'chart-seed-%';
commit;
SQL

echo "=== 清理后 ==="
psql -c "select openid, nick_name, role from members order by role desc, created_at;"
psql -c "select count(*) as strength_records from strength_records;"
