#!/usr/bin/env bash
# 验证：限制可以设成 >60 秒，也可以设成 0（不限）
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
ADMINPW=$(sed -n 's/^ADMIN_PASSWORD=//p' .env)
MEMBER=$(docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -tAc "select openid from members where role='member' limit 1;" | tr -d '\r')
BASE=http://127.0.0.1

echo '=== 生成 90 秒测试视频 ==='
docker compose exec -T server ffmpeg -y -loglevel error -f lavfi -i 'testsrc=duration=90:size=320x240:rate=15' \
  -c:v libx264 -preset ultrafast -crf 32 /tmp/t90.mp4
docker cp gym-server-1:/tmp/t90.mp4 /tmp/t90.mp4 >/dev/null

docker rm -f gym-vidunlim >/dev/null 2>&1 || true
docker run -d --rm --name gym-vidunlim --network gym_default -p 127.0.0.1:3043:3000 \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/gym" \
  -e DEV_LOGIN_TOKEN=vid-token -e WX_APPID=x -e WX_SECRET=x \
  -e CONFIG_SECRET="$(sed -n 's/^CONFIG_SECRET=//p' .env)" \
  gym-server node index.js >/dev/null
for i in $(seq 1 30); do curl -sf -m 2 http://127.0.0.1:3043/health >/dev/null 2>&1 && break; sleep 1; done

TOKEN=$(curl -sS -X POST "$BASE/api/admin/login" -H 'content-type: application/json' \
  --data-binary "{\"password\":\"$ADMINPW\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")

setlim() {
  curl -sS -X PUT "$BASE/api/admin/media-limits" -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
    --data-binary "$1" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ',d.get('data',{}).get('summary') or d.get('msg'))"
}

upload() {
  curl -sS -m 300 -X POST "http://127.0.0.1:3043/api/video?ext=mp4&code=dev:$MEMBER" \
    -H "x-dev-token: vid-token" -F "file=@/tmp/t90.mp4" | tee /tmp/up.json \
    | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('code') != 0:
    print('  失败:', d.get('msg'))
else:
    x = d['data']
    print('  原 %ss → 成 %ss ｜ 裁切=%s ｜ 成品 %.2fMB ｜ 不限=%s' % (
      x['originalDuration'], x['duration'], x['trimmed'], x['bytes']/1048576,
      json.dumps(x.get('unlimited'))))
    print('  ID:', x['fileID'].rsplit('/',1)[-1])
"
}

echo '=== 1. 全部设成 0（不限）==='
setlim '{"value":{"maxDuration":0,"maxVideoMB":0,"maxTotalMB":0,"maxRawVideoMB":0}}'
upload
ID1=$(python3 -c "import json;d=json.load(open('/tmp/up.json'));print(d['data']['fileID'].rsplit('/',1)[-1] if d.get('code')==0 else '')")

echo '=== 2. 设成 300 秒（超过 60 也行）==='
setlim '{"value":{"maxDuration":300,"maxVideoMB":500,"maxTotalMB":1000,"maxRawVideoMB":800}}'
upload
ID2=$(python3 -c "import json;d=json.load(open('/tmp/up.json'));print(d['data']['fileID'].rsplit('/',1)[-1] if d.get('code')==0 else '')")

echo '=== 3. 设成 30 秒（应裁切）==='
setlim '{"value":{"maxDuration":30}}'
upload
ID3=$(python3 -c "import json;d=json.load(open('/tmp/up.json'));print(d['data']['fileID'].rsplit('/',1)[-1] if d.get('code')==0 else '')")

echo '=== 4. 恢复默认 + 清理测试视频 ==='
setlim '{"value":{"maxDuration":15,"maxVideoMB":12,"maxRawVideoMB":60,"maxCount":9,"maxTotalMB":40,"feedThumbs":9}}'
docker rm -f gym-vidunlim >/dev/null 2>&1 || true
docker compose exec -T server rm -f /tmp/t90.mp4 || true
rm -f /tmp/t90.mp4 /tmp/up.json
IDS=$(printf "'%s'," "$ID1" "$ID2" "$ID3" | sed "s/,$//")
echo "  删除测试视频: $IDS"
docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -c "delete from media where id in ($IDS);"
