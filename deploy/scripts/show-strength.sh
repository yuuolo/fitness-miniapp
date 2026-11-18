#!/usr/bin/env bash
# ⚠️ 这个脚本直接读生产库 gym（只读也要确认，避免误以为是测试库）
if [ "${ALLOW_PROD_WRITE:-}" != "1" ]; then
  echo "已拒绝执行：$0 直连生产库。确认请加 ALLOW_PROD_WRITE=1"
  exit 1
fi

# 看线上力量记录明细，判断默认应该选中哪一项
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }

psql -c "select s.lift, s.one_rm, to_char(to_timestamp(s.created_at/1000) at time zone 'Asia/Shanghai','MM-DD HH24:MI') as at, m.nick_name, m.role
           from strength_records s join members m on m.openid = s.openid
          order by s.created_at desc;"
