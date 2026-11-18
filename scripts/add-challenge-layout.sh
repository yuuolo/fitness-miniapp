#!/usr/bin/env bash
# 把「挑战预览」模块插到生产首页布局（快捷入口之后），三个角色都加
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }

cat > /tmp/add-challenge-block.py <<'PY'
import json, sys

raw = sys.stdin.read().strip()
data = json.loads(raw) if raw and raw != 'null' else None
if not data:
    print('NO_LAYOUT')
    sys.exit(0)

block = {
    "id": "challenge",
    "type": "challenge",
    "title": "挑战预览",
    "desc": "待你应战 / 待你判决 / 进行中",
    "enabled": True,
    "feature": "rank",
}

changed = []
for role in ["member", "coach", "admin"]:
    blocks = data.get("roles", {}).get(role) or []
    if any(b.get("type") == "challenge" for b in blocks):
        continue
    # 插在 quick 之后；没有 quick 就插在第一个位置
    idx = next((i for i, b in enumerate(blocks) if b.get("type") == "quick"), -1)
    pos = idx + 1 if idx >= 0 else 0
    blocks.insert(pos, dict(block))
    data.setdefault("roles", {})[role] = blocks
    changed.append(role)

if changed:
    data["updatedAt"] = int(__import__('time').time() * 1000)
    print(json.dumps({"changed": changed, "layout": data}, ensure_ascii=False))
else:
    print(json.dumps({"changed": [], "layout": data}, ensure_ascii=False))
PY

docker cp /tmp/add-challenge-block.py gym-db-1:/tmp/ >/dev/null 2>&1 || true

RAW=$(psql -tAc "select value::text from config where key = 'layout';")
if [ -z "$RAW" ]; then
  echo '配置里还没有 layout，跳过（默认布局已包含挑战模块）'
  exit 0
fi

NEW=$(printf '%s' "$RAW" | python3 /tmp/add-challenge-block.py)
CHANGED=$(printf '%s' "$NEW" | python3 -c "import sys,json;print(','.join(json.load(sys.stdin)['changed']))")
echo "变更角色: ${CHANGED:-（无，已存在）}"

if [ -n "$CHANGED" ]; then
  printf '%s' "$NEW" | python3 -c "
import sys, json
d = json.load(sys.stdin)['layout']
print(json.dumps(d, ensure_ascii=False).replace(\"'\", \"''\"))
" > /tmp/layout-new.json
  psql -c "update config set value = pg_read_file('/tmp/layout-new.json')::jsonb where key = 'layout';" 2>/dev/null || \
  { docker cp /tmp/layout-new.json gym-db-1:/tmp/layout-new.json >/dev/null; psql -c "update config set value = (select pg_read_file('/tmp/layout-new.json'))::jsonb where key = 'layout';"; }
  echo '=== 更新后的模块顺序 ==='
  psql -tAc "select value::text from config where key = 'layout';" | python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
for role, blocks in (d.get('roles') or {}).items():
    print(' ', role, '→', ' / '.join(b.get('type') for b in blocks))
"
fi
