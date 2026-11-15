#!/usr/bin/env bash
# 按 pk-backup.json 还原两个账号的身体数据（SQL 走管道，避免容器看不到宿主机 /tmp）
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }
BACKUP=/opt/gym/testdata/pk-backup.json

if [ ! -s "$BACKUP" ]; then echo '没有备份文件'; exit 1; fi

python3 - "$BACKUP" <<'PY' > /tmp/pk-restore.sql
import json, sys

def lit(v):
    if v is None:
        return 'null'
    return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"

for r in json.load(open(sys.argv[1])):
    print("update members set height = %s, best_lift = %s, sbd_total = %s, latest_body = %s where openid = '%s';"
          % (r['height'] or 0, lit(r['best_lift']), r['sbd_total'] or 0, lit(r['latest_body']), r['openid']))
PY

echo '=== 生成的 SQL ==='
cat /tmp/pk-restore.sql

echo '=== 执行 ==='
psql -v ON_ERROR_STOP=1 < /tmp/pk-restore.sql

echo '=== 复核 ==='
psql -c "select nick_name, height, sbd_total, coalesce(latest_body->>'weight','-') as weight, coalesce(latest_body->>'score','-') as score from members where nick_name in ('雷阵雨','小菜菜');"
