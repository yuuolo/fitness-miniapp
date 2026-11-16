#!/usr/bin/env bash
# 还原评分封顶测试造成的改动（管理员数据 + 删掉测试体测记录）
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }
ADMIN=o5bjc4qI1ME8eNUtWE09sLqOE4aE

echo '=== 删除刚才测试写入的体测记录（体重 70 / 今天）==='
psql -c "delete from body_records where openid='$ADMIN' and weight = 70;"

echo '=== 还原会员档案 ==='
python3 - /tmp/score-cap-backup.json <<'PY' > /tmp/restore-score-cap.sql
import json, sys
d = json.load(open(sys.argv[1]))
def lit(v):
    if v is None or v == {}:
        return 'null' if v is None else "'{}'::jsonb"
    return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
print("update members set best_lift = %s, sbd_total = %s, height = %s, latest_body = %s where openid = 'o5bjc4qI1ME8eNUtWE09sLqOE4aE';" % (
    lit(d.get('best_lift')), d.get('sbd_total') or 0, d.get('height') or 0, lit(d.get('latest_body'))))
PY
cat /tmp/restore-score-cap.sql
psql -v ON_ERROR_STOP=1 < /tmp/restore-score-cap.sql

echo '=== 复核 ==='
psql -tAc "select best_lift::text, coalesce(latest_body->>'score','null'), coalesce(latest_body->>'weight','null') from members where openid='$ADMIN';"
psql -tAc "select count(*) from body_records where openid='$ADMIN';"
