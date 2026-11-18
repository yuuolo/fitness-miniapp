#!/usr/bin/env bash
# 验证模板 ID 已配置 + 跑全量测试
set -uo pipefail
cd /opt/gym
echo '=== 模板 ID ==='
docker compose exec -T server node -e "
const t = require('/app/lib/templates')
const keys = ['challengeInvite', 'challengeStart', 'challengeResult']
keys.forEach(k => console.log(' ', k, '=', (t[k] && t[k].id) || '(空)'))
"
echo
echo '=== 全量测试 ==='
bash /tmp/run-all-tests2.sh 2>&1 | grep -E '=====|全部|退出码|✗|✘' | head -20
