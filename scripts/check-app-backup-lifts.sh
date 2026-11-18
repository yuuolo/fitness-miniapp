#!/usr/bin/env bash
# 从应用备份（jsonl）里找 members 的 best_lift，看能不能还原力量成绩
set -uo pipefail
cd /opt/gym
F=/opt/gym/backups/app-20261117-145016.jsonl.gz
echo "备份: $(basename $F)"
gunzip -c "$F" | grep '"table":"members"' | head -12 | python3 -c "
import sys, json
for line in sys.stdin:
    try:
        d = json.loads(line)
    except Exception:
        continue
    row = d.get('row') or {}
    bl = row.get('best_lift') or {}
    if isinstance(bl, str):
        try: bl = json.loads(bl)
        except Exception: bl = {}
    print('%-8s %-6s best_lift=%s sbd=%s' % (
        (row.get('nick_name') or '')[:8],
        row.get('role', ''),
        json.dumps(bl, ensure_ascii=False)[:160],
        row.get('sbd_total')))
"
