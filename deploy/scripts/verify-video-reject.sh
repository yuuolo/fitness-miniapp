#!/usr/bin/env bash
# 验证：原视频超过「原视频上限」时被拒（生成一个更大的测试视频）
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
ADMINPW=$(sed -n 's/^ADMIN_PASSWORD=//p' .env)
MEMBER=$(docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -tAc "select openid from members where role='member' limit 1;" | tr -d '\r')
BASE=http://127.0.0.1

echo '=== 生成 30 秒高清视频（体积大一些）==='
docker compose exec -T server ffmpeg -y -loglevel error -f lavfi -i 'testsrc2=duration=30:size=1280x720:rate=30' \
  -c:v libx264 -preset ultrafast -crf 18 /tmp/big.mp4
docker cp gym-server-1:/tmp/big.mp4 /tmp/big.mp4 >/dev/null
ls -lh /tmp/big.mp4 | awk '{print "  大小:", $5}'

docker rm -f gym-vidcheck2 >/dev/null 2>&1 || true
docker run -d --rm --name gym-vidcheck2 --network gym_default -p 127.0.0.1:3041:3000 \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/gym" \
  -e DEV_LOGIN_TOKEN=vid-token -e WX_APPID=x -e WX_SECRET=x \
  -e CONFIG_SECRET="$(sed -n 's/^CONFIG_SECRET=//p' .env)" \
  gym-server node index.js >/dev/null
for i in $(seq 1 30); do curl -sf -m 2 http://127.0.0.1:3041/health >/dev/null 2>&1 && break; sleep 1; done

TOKEN=$(curl -sS -X POST "$BASE/api/admin/login" -H 'content-type: application/json' \
  --data-binary "{\"password\":\"$ADMINPW\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")

echo '=== 把原视频上限设成 5MB，再传这个大视频（应被拒）==='
curl -sS -X PUT "$BASE/api/admin/media-limits" -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
  --data-binary '{"value":{"maxRawVideoMB":5}}' >/dev/null
curl -sS -m 180 -X POST "http://127.0.0.1:3041/api/video?ext=mp4&code=dev:$MEMBER" \
  -H "x-dev-token: vid-token" -F "file=@/tmp/big.mp4" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('  code=%s msg=%s' % (d.get('code'), d.get('msg')))"

echo '=== 恢复默认 + 清理 ==='
curl -sS -X PUT "$BASE/api/admin/media-limits" -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
  --data-binary '{"value":{"maxDuration":15,"maxVideoMB":12,"maxRawVideoMB":60,"maxCount":9,"maxTotalMB":40,"feedThumbs":9}}' \
  | python3 -c "import sys,json;print('  ',json.load(sys.stdin)['data']['summary'])"
docker rm -f gym-vidcheck2 >/dev/null 2>&1 || true
docker compose exec -T server rm -f /tmp/big.mp4 /tmp/t90.mp4 || true
rm -f /tmp/big.mp4 /tmp/t90.mp4

echo '=== 删掉测试产生的两个裁切视频 ==='
docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -c \
  "delete from media where id in ('1301629a08d8a907e94f0aa1fb0bad16','64ea9e442aa47c715c3f11d897a644fe');"
