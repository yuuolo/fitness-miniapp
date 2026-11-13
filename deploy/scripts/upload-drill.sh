#!/usr/bin/env bash
# 真实图片的上传/下载链路验证：上传一张真实 JPEG，再取回做字节比对
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
DB=gym_upload
PORT=3003
TOKEN=upload-test-token
SRC=${1:-/tmp/real.jpg}

if [ ! -f "$SRC" ]; then
  echo "找不到测试图片 $SRC"
  exit 1
fi
echo "测试图片：$SRC  大小 $(du -h "$SRC" | cut -f1)"
file "$SRC" 2>/dev/null || true

docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d postgres \
  -c "drop database if exists $DB;" -c "create database $DB;" >/dev/null 2>&1

docker rm -f gym-upload-test >/dev/null 2>&1 || true
docker run -d --rm --name gym-upload-test \
  --network gym_default -p 127.0.0.1:${PORT}:3000 \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/${DB}" \
  -e DEV_LOGIN_TOKEN="$TOKEN" \
  -e WX_APPID=test -e WX_SECRET=test \
  -e PUBLIC_BASE_URL=https://gym.novrein.com \
  gym-server node index.js >/dev/null

for i in $(seq 1 40); do
  curl -sf -m 2 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 && break
  sleep 1
done
echo "服务就绪"

echo "=== 上传 ==="
RESP=$(curl -sS -m 120 -X POST \
  -H 'content-type: application/octet-stream' \
  -H "x-dev-token: $TOKEN" \
  --data-binary @"$SRC" \
  "http://127.0.0.1:${PORT}/api/upload?ext=jpg&code=dev:uploader")
echo "$RESP" | head -c 200; echo

URL=$(echo "$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['fileID'])")
PATH_ONLY=$(echo "$URL" | sed 's#^https\?://[^/]*##')
echo "文件地址：$URL"

echo "=== 取回 ==="
curl -sS -m 120 -o /tmp/downloaded.jpg -D /tmp/h.txt "http://127.0.0.1:${PORT}${PATH_ONLY}"
grep -iE '^(HTTP/|content-type|content-length|cache-control)' /tmp/h.txt

echo "=== 字节比对 ==="
A=$(md5sum "$SRC" | cut -d' ' -f1)
B=$(md5sum /tmp/downloaded.jpg | cut -d' ' -f1)
echo "  原图 md5: $A"
echo "  下载 md5: $B"
if [ "$A" = "$B" ]; then echo "  一致 ✅"; else echo "  不一致 ❌"; fi

echo "=== 库里记录 ==="
docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d "$DB" -tAc \
  "select 'media 行数=' || count(*) || ' 总字节=' || coalesce(sum(length(bytes)),0) from media;"

docker rm -f gym-upload-test >/dev/null 2>&1 || true
rm -f /tmp/downloaded.jpg /tmp/h.txt
echo "UPLOAD_DRILL_DONE"
