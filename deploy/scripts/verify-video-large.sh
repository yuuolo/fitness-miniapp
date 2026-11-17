#!/usr/bin/env bash
# 验证大文件（35MB / 30秒）在 60MB 上限内能被自动裁到 15 秒
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
ADMINPW=$(sed -n 's/^ADMIN_PASSWORD=//p' .env)
MEMBER=$(docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -tAc "select openid from members where role='member' limit 1;" | tr -d '\r')
BASE=http://127.0.0.1

echo '=== 生成 30 秒 720p 视频 ==='
docker compose exec -T server ffmpeg -y -loglevel error -f lavfi -i 'testsrc2=duration=30:size=1280x720:rate=30' \
  -c:v libx264 -preset ultrafast -crf 18 /tmp/big.mp4
docker cp gym-server-1:/tmp/big.mp4 /tmp/big.mp4 >/dev/null
ls -lh /tmp/big.mp4 | awk '{print "  大小:", $5}'

docker rm -f gym-vidok >/dev/null 2>&1 || true
docker run -d --rm --name gym-vidok --network gym_default -p 127.0.0.1:3042:3000 \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/gym" \
  -e DEV_LOGIN_TOKEN=vid-token -e WX_APPID=x -e WX_SECRET=x \
  -e CONFIG_SECRET="$(sed -n 's/^CONFIG_SECRET=//p' .env)" \
  gym-server node index.js >/dev/null
for i in $(seq 1 30); do curl -sf -m 2 http://127.0.0.1:3042/health >/dev/null 2>&1 && break; sleep 1; done

echo '=== 上传（60MB 上限内，最长 15 秒）==='
START=$(date +%s)
curl -sS -m 300 -X POST "http://127.0.0.1:3042/api/video?ext=mp4&code=dev:$MEMBER" \
  -H "x-dev-token: vid-token" -F "file=@/tmp/big.mp4" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('code') != 0:
    print('  失败:', d.get('msg'))
else:
    x = d['data']
    print('  原 %.1fs → 成 %.1fs ｜ 裁切=%s ｜ 成品 %.2fMB ｜ 方式=%s' % (
      x['originalDuration'], x['duration'], x['trimmed'], x['bytes']/1048576, x['method']))
    print('  fileID:', x['fileID'])
"
END=$(date +%s)
echo "  耗时: $((END-START)) 秒"

docker rm -f gym-vidok >/dev/null 2>&1 || true
docker compose exec -T server rm -f /tmp/big.mp4 || true
rm -f /tmp/big.mp4
