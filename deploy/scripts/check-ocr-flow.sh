#!/usr/bin/env bash
# 用真实的体测报告图跑一次 OCR，确认识别链路可用（识别后报告图会作为 reportImage 保存）
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }
ADMIN=$(psql -tAc "select openid from members where role='admin' limit 1;" | tr -d ' \r\n')

docker rm -f gym-ocrcheck >/dev/null 2>&1 || true
docker run -d --rm --name gym-ocrcheck --network gym_default -p 127.0.0.1:3034:3000 \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/gym" \
  -e DEV_LOGIN_TOKEN=ocr-token -e WX_APPID=x -e WX_SECRET=x \
  -e CONFIG_SECRET="$(sed -n 's/^CONFIG_SECRET=//p' .env)" \
  -e OCR_URL="http://ocr:8000/ocr" -e OCR_TIMEOUT=30000 \
  gym-server node index.js >/dev/null
for i in $(seq 1 30); do curl -sf -m 2 http://127.0.0.1:3034/health >/dev/null 2>&1 && break; sleep 1; done

echo '=== OCR 识别一张真实报告图 ==='
curl -sS -m 60 -X POST http://127.0.0.1:3034/api \
  -H 'content-type: application/json' -H 'x-dev-token: ocr-token' \
  --data-binary "{\"action\":\"ocrBodyReport\",\"code\":\"dev:$ADMIN\",\"data\":{\"fileID\":\"https://gym.novrein.com/api/media/9c23dfbde22451c786ee875098f904f4\"}}" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
data = d.get('data') or {}
fields = data.get('fields') or {}
print('  返回码:', d.get('code'), d.get('msg',''))
print('  识别字段数:', len(fields))
for k, v in list(fields.items())[:10]:
    print('   ', k, '=', v)
"

docker rm -f gym-ocrcheck >/dev/null 2>&1 || true
