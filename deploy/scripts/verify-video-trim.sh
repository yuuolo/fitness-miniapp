#!/usr/bin/env bash
# 端到端验证 /api/video：上传 90 秒视频，按配置自动裁切
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
ADMINPW=$(sed -n 's/^ADMIN_PASSWORD=//p' .env)
MEMBER=$(docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -tAc "select openid from members where role='member' limit 1;" | tr -d '\r')
BASE=http://127.0.0.1

echo '=== 1. 生成 90 秒测试视频（在 server 容器里用 ffmpeg）==='
docker compose exec -T server ffmpeg -y -loglevel error -f lavfi -i 'testsrc=duration=90:size=320x240:rate=15' \
  -f lavfi -i 'sine=frequency=440:duration=90' -c:v libx264 -preset ultrafast -crf 30 -c:a aac -b:a 64k -shortest /tmp/t90.mp4
docker cp gym-server-1:/tmp/t90.mp4 /tmp/t90.mp4 >/dev/null
ls -lh /tmp/t90.mp4 | awk '{print "  视频大小:", $5}'

echo '=== 2. 起一个带 dev token 的实例 ==='
docker rm -f gym-vidcheck >/dev/null 2>&1 || true
docker run -d --rm --name gym-vidcheck --network gym_default -p 127.0.0.1:3039:3000 \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/gym" \
  -e DEV_LOGIN_TOKEN=vid-token -e WX_APPID=x -e WX_SECRET=x \
  -e CONFIG_SECRET="$(sed -n 's/^CONFIG_SECRET=//p' .env)" \
  gym-server node index.js >/dev/null
for i in $(seq 1 30); do curl -sf -m 2 http://127.0.0.1:3039/health >/dev/null 2>&1 && break; sleep 1; done

show() {
  python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('code') != 0:
    print('  失败:', d.get('msg'))
else:
    x = d['data']
    print('  原 %ss → 成 %ss ｜ 裁切=%s ｜ 成品 %.2fMB ｜ 方式=%s' % (
      x['originalDuration'], x['duration'], x['trimmed'], x['bytes']/1048576, x['method']))
    print('  fileID:', x['fileID'])
    print('  提示文案: %s' % ('已自动裁切，原视频 %ss，已保留前 %ss' % (x['originalDuration'], x['keptSeconds']) if x['trimmed'] else '无需裁切'))
"
}

upload() {
  curl -sS -m 180 -X POST "http://127.0.0.1:3039/api/video?ext=mp4&code=dev:$MEMBER" \
    -H "x-dev-token: vid-token" -F "file=@/tmp/t90.mp4" | show
}

TOKEN=$(curl -sS -X POST "$BASE/api/admin/login" -H 'content-type: application/json' \
  --data-binary "{\"password\":\"$ADMINPW\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")

echo '=== 3. 顶到 60 秒上限（默认配置）==='
curl -sS -X PUT "$BASE/api/admin/media-limits" -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
  --data-binary '{"value":{"maxDuration":60}}' | python3 -c "import sys,json;print('  配置:',json.load(sys.stdin)['data']['value']['maxDuration'],'秒')"
upload

echo '=== 4. 改成 20 秒再传同一段 ==='
curl -sS -X PUT "$BASE/api/admin/media-limits" -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
  --data-binary '{"value":{"maxDuration":20}}' | python3 -c "import sys,json;print('  配置:',json.load(sys.stdin)['data']['value']['maxDuration'],'秒')"
upload

echo '=== 5. 原视频超过「原视频上限」时应被拒 ==='
curl -sS -X PUT "$BASE/api/admin/media-limits" -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
  --data-binary '{"value":{"maxRawVideoMB":5}}' >/dev/null
curl -sS -m 180 -X POST "http://127.0.0.1:3039/api/video?ext=mp4&code=dev:$MEMBER" \
  -H "x-dev-token: vid-token" -F "file=@/tmp/t90.mp4" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  code=%s msg=%s' % (d.get('code'), d.get('msg')))"

echo '=== 6. 恢复默认 ==='
curl -sS -X PUT "$BASE/api/admin/media-limits" -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
  --data-binary '{"value":{"maxDuration":15,"maxVideoMB":12,"maxRawVideoMB":60,"maxCount":9,"maxTotalMB":40,"feedThumbs":9}}' \
  | python3 -c "import sys,json;print('  ',json.load(sys.stdin)['data']['summary'])"

docker rm -f gym-vidcheck >/dev/null 2>&1 || true
docker compose exec -T server rm -f /tmp/t90.mp4 || true
rm -f /tmp/t90.mp4
