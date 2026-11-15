#!/usr/bin/env bash
# 部署后体检：容器、端口、内部/公网可达、OCR 连通
set -uo pipefail
cd /opt/gym

echo '=== 容器 ==='
docker compose ps --format '{{.Name}}	{{.Status}}	{{.Ports}}'

echo
echo '=== 内部 ==='
curl -sS -m 5 http://127.0.0.1/health; echo
curl -sS -m 5 -o /dev/null -w 'admin=%{http_code}\n' http://127.0.0.1/admin

echo
echo '=== OCR 连通（从 server 容器访问）==='
docker compose exec -T server node -e "fetch('http://ocr:8000/health').then(r=>r.json()).then(j=>console.log('ocr ok:', JSON.stringify(j))).catch(e=>{console.log('ocr ERR:', e.message);process.exit(1)})"

echo
echo '=== 公网（走外部 nginx）==='
curl -sS -m 10 -o /dev/null -w 'https health=%{http_code}\n' https://gym.novrein.com/health
curl -sS -m 10 -o /dev/null -w 'https admin=%{http_code}\n' https://gym.novrein.com/admin

echo
echo '=== 端口监听 ==='
docker compose ps --format '{{.Name}} {{.Ports}}'
