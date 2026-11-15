#!/usr/bin/env bash
# 实测 parseBodyReport：把两张小米 S800 报告的文字喂给接口，看解析结果
set -uo pipefail
cd /opt/gym
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
PORT=3018
TOKEN=report-check-token
psql() { docker compose exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym "$@"; }

COACH=$(psql -tAc "select openid from members where role in ('coach','admin') order by role limit 1;" | tr -d '\r\n')

docker rm -f gym-reportcheck >/dev/null 2>&1 || true
docker run -d --rm --name gym-reportcheck \
  --network gym_default -p 127.0.0.1:${PORT}:3000 \
  -e DATABASE_URL="postgres://postgres:${PW}@db:5432/gym" \
  -e DEV_LOGIN_TOKEN="$TOKEN" \
  -e WX_APPID=unused -e WX_SECRET=unused \
  -e CONFIG_SECRET="$(sed -n 's/^CONFIG_SECRET=//p' .env)" \
  gym-server node index.js >/dev/null
for i in $(seq 1 30); do
  curl -sf -m 2 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 && break
  sleep 1
done

python3 - "$PORT" "$TOKEN" "$COACH" <<'PY'
import json, sys, urllib.request

port, token, coach = sys.argv[1], sys.argv[2], sys.argv[3]
BASE = 'http://127.0.0.1:' + port

def call(action, data):
    body = json.dumps({'action': action, 'code': 'dev:' + coach, 'data': data}).encode()
    req = urllib.request.Request(BASE + '/api', data=body, method='POST')
    req.add_header('content-type', 'application/json')
    req.add_header('x-dev-token', token)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode())

ZHAO = """人体成分分析报告
名称: 小赵   性别: 男   年龄: 31 岁   身高: 175cm   测量时间: 2026/07/19
体重 80.25kg 偏高
BMI 26.2 偏高
体脂率 27.6% 过高
心率 122次/分 偏高
肌肉量 55.0kg 标准
肌肉率 68.6% 标准
蛋白质量 11.4kg 标准
蛋白质率 14.2% 标准
体水分量 43.0kg 标准
身体水分 53.6% 标准
骨盐量 3.1kg 不足
骨盐率 3.9% 不足
脂肪量 22.1kg 过高
骨骼肌量 31.2kg 标准
内脏脂肪等级 9.0 警戒
身体形态 倒三角型
身体类型 肥胖
推测腰臀比 0.9
身体年龄 30 岁
骨骼肌指数 7.8
建议热量摄入 2356kcal
基础代谢率 1625kcal
去脂体重 58.1kg
节段脂肪分析
1.5kg 左上肢    1.5kg 右上肢
11.5kg 躯干
3.3kg 左下肢    3.3kg 右下肢
节段肌肉分析
2.9kg 左上肢    2.9kg 右上肢
25.4kg 躯干
9.1kg 左下肢    9.1kg 右下肢
身体得分
74 分 建议控制饮食
数据来源: 米家八电极体脂秤 S800"""

print('=== 解析小赵的报告 ===')
d = call('parseBodyReport', {'text': ZHAO})
if d.get('code') != 0:
    print('  失败：' + str(d.get('msg'))); raise SystemExit(1)
r = d['data']
f = r['fields']
print('  识别到 %d 项：%s' % (len(r['filled']), '、'.join(r['filled'])))
print('  体重 %s / 身高 %s / 体脂率 %s%% / BMI %s' % (f.get('weight'), f.get('height'), f.get('bodyFat'), f.get('bmi')))
print('  肌肉 %s / 骨骼肌 %s / 内脏脂肪 %s / 身体得分 %s' % (f.get('muscle'), f.get('skeletalMuscle'), f.get('visceral'), f.get('deviceScore')))
print('  形态 %s / 类型 %s / 日期 %s / 性别 %s' % (f.get('bodyShape'), f.get('bodyType'), f.get('date'), f.get('gender')))
print('  节段脂肪 %s' % json.dumps(f.get('segmentFat'), ensure_ascii=False))
print('  节段肌肉 %s' % json.dumps(f.get('segmentMuscle'), ensure_ascii=False))
print('  告警 %s' % (r['warnings'] or '无'))

print()
print('=== 解析一份残缺文字（只有体重）===')
d2 = call('parseBodyReport', {'text': '体重 70kg'})
if d2.get('code') == 0:
    print('  识别 %d 项，告警：%s' % (len(d2['data']['filled']), d2['data']['warnings']))
else:
    print('  返回：' + str(d2.get('msg')))

print()
print('=== 空文本应被拒绝 ===')
d3 = call('parseBodyReport', {'text': '   '})
print('  ' + ('失败：' + str(d3.get('msg')) if d3.get('code') != 0 else '未拒绝（不符合预期）'))

print()
print('=== 未配置 OCR 时，图片识别应给出可用提示 ===')
d4 = call('ocrBodyReport', {'fileID': '/api/media/xxxxxxxx'})
print('  ' + ('提示：' + str(d4.get('msg')) if d4.get('code') != 0 else '未拒绝（不符合预期）'))
PY

docker rm -f gym-reportcheck >/dev/null 2>&1 || true
echo "REPORT_CHECK_DONE"
