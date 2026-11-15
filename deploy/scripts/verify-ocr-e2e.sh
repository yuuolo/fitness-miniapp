#!/usr/bin/env bash
# 端到端验证：真实报告图 → /api/upload → ocrBodyReport → 体测字段
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
PORT=3019
TOKEN=ocr-e2e-token
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }
COACH=$(psql -tAc "select openid from members where role in ('coach','admin') order by role limit 1;" | tr -d '\r\n')

docker rm -f gym-ocre2e >/dev/null 2>&1 || true
docker run -d --rm --name gym-ocre2e \
  --network gym_default -p 127.0.0.1:${PORT}:3000 \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/gym" \
  -e DEV_LOGIN_TOKEN="$TOKEN" \
  -e WX_APPID=unused -e WX_SECRET=unused \
  -e CONFIG_SECRET="$(sed -n 's/^CONFIG_SECRET=//p' .env)" \
  -e OCR_URL=http://ocr:8000/ocr -e OCR_TIMEOUT=120000 \
  gym-server node index.js >/dev/null
for i in $(seq 1 40); do
  curl -sf -m 2 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 && break
  sleep 1
done

python3 - "$PORT" "$TOKEN" "$COACH" <<'PY'
import json, sys, time, urllib.request

port, token, coach = sys.argv[1], sys.argv[2], sys.argv[3]
BASE = 'http://127.0.0.1:' + port

def upload(path, ext):
    raw = open(path, 'rb').read()
    req = urllib.request.Request(BASE + '/api/upload?ext=' + ext + '&code=dev:' + coach, data=raw, method='POST')
    req.add_header('content-type', 'application/octet-stream')
    req.add_header('x-dev-token', token)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())

def call(action, data):
    body = json.dumps({'action': action, 'code': 'dev:' + coach, 'data': data}).encode()
    req = urllib.request.Request(BASE + '/api', data=body, method='POST')
    req.add_header('content-type', 'application/json')
    req.add_header('x-dev-token', token)
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read().decode())

EXPECT = {
    'report1': {'weight': 80.25, 'bodyFat': 27.6, 'height': 175, 'deviceScore': 74,
                'fatTrunk': 11.5, 'musTrunk': 25.4, 'shape': '倒三角型'},
    'report2': {'weight': 57.7, 'bodyFat': 26.4, 'height': 158, 'deviceScore': 84,
                'fatTrunk': 7.4, 'musTrunk': 18.5, 'shape': '匀称型'},
}

ok = True
for name in ['report1', 'report2']:
    print('=== %s ===' % name)
    up = upload('/opt/gym/testdata/%s.webp' % name, 'webp')
    if up.get('code') != 0:
        print('  上传失败: ' + str(up.get('msg'))); ok = False; continue
    fileID = up['data']['fileID']
    print('  上传成功: ' + fileID)

    t0 = time.time()
    d = call('ocrBodyReport', {'fileID': fileID})
    cost = time.time() - t0
    if d.get('code') != 0:
        print('  识别失败: ' + str(d.get('msg'))); ok = False; continue

    r = d['data']
    f = r['fields']
    print('  耗时 %.1fs，识别 %d 项，词框 %d 个（spatial=%s）' % (cost, len(r['filled']), r.get('boxes', 0), r.get('spatial')))
    print('  ' + '、'.join(r['filled']))

    e = EXPECT[name]
    checks = [
        ('体重', f.get('weight'), e['weight']),
        ('体脂率', f.get('bodyFat'), e['bodyFat']),
        ('身高', f.get('height'), e['height']),
        ('身体得分', f.get('deviceScore'), e['deviceScore']),
        ('节段脂肪-躯干', (f.get('segmentFat') or {}).get('trunk'), e['fatTrunk']),
        ('节段肌肉-躯干', (f.get('segmentMuscle') or {}).get('trunk'), e['musTrunk']),
    ]
    for label, got, want in checks:
        same = got is not None and abs(float(got) - want) < 0.15
        print('  %s %s：%s（期望 %s）' % ('✓' if same else '✗', label, got, want))
        if not same: ok = False

    shape = f.get('bodyShape')
    print('  %s 身体形态：%s（期望 %s）' % ('✓' if shape == e['shape'] else '✗', shape, e['shape']))
    if shape != e['shape']: ok = False
    print('  节段脂肪 ' + json.dumps(f.get('segmentFat'), ensure_ascii=False))
    print('  节段肌肉 ' + json.dumps(f.get('segmentMuscle'), ensure_ascii=False))
    if r['warnings']:
        print('  告警：' + json.dumps(r['warnings'], ensure_ascii=False))

print()
print('END_TO_END_OK' if ok else 'END_TO_END_FAIL')
PY

docker rm -f gym-ocre2e >/dev/null 2>&1 || true
