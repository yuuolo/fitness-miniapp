#!/usr/bin/env bash
# 在服务器上加入并启动自建 OCR 服务（内部网络，不对外暴露端口）
set -euo pipefail
cd /opt/gym

if grep -q '^  ocr:' docker-compose.yml; then
  echo "compose 里已有 ocr 服务，跳过追加"
else
  python3 - <<'PY'
import re
p = '/opt/gym/docker-compose.yml'
t = open(p, encoding='utf-8').read()
svc = """  ocr:
    build: ./ocr
    restart: unless-stopped
    environment:
      PYTHONUNBUFFERED: "1"
    expose:
      - "8000"

"""
anchor = '  caddy:\n'
if anchor not in t:
    raise SystemExit('找不到 caddy 服务，无法插入')
t = t.replace(anchor, svc + anchor, 1)
open(p, 'w', encoding='utf-8').write(t)
print('compose 已加入 ocr 服务')
PY
fi

# server 需要知道 OCR 地址
if grep -q '^OCR_URL=' .env; then
  echo ".env 里已有 OCR_URL"
else
  printf '\n# 自建 OCR 服务（体测报告识别用）\nOCR_URL=http://ocr:8000/ocr\nOCR_TIMEOUT=20000\n' >> .env
  echo ".env 已加入 OCR_URL"
fi

# 让 server 容器拿到环境变量
python3 - <<'PY'
p = '/opt/gym/docker-compose.yml'
t = open(p, encoding='utf-8').read()
if 'OCR_URL:' in t:
    print('server 已声明 OCR_URL')
else:
    t = t.replace(
        '      CONFIG_SECRET: ${CONFIG_SECRET:-}\n',
        '      CONFIG_SECRET: ${CONFIG_SECRET:-}\n'
        '      # 体测报告图片识别（自建 OCR 服务）\n'
        '      OCR_URL: ${OCR_URL:-}\n'
        '      OCR_TIMEOUT: ${OCR_TIMEOUT:-20000}\n',
        1
    )
    open(p, 'w', encoding='utf-8').write(t)
    print('server 已声明 OCR_URL')
PY

echo '--- 启动 ocr（首次构建要装依赖，耐心等）---'
docker compose build ocr
docker compose up -d ocr

for i in $(seq 1 60); do
  if docker compose exec -T server node -e "fetch('http://ocr:8000/health').then(r=>r.json()).then(j=>{console.log(JSON.stringify(j));process.exit(j.ok?0:1)}).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "OCR 服务已就绪"
    break
  fi
  sleep 3
done

docker compose up -d --force-recreate server
echo '--- 完成 ---'
docker compose ps
