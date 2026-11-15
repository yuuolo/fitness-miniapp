#!/usr/bin/env bash
# 安全与运维细节检查
set -uo pipefail
cd /opt/gym

echo '########## 文件权限 ##########'
ls -l .env | awk '{print "  .env: " $1 " " $3 ":" $4}'
ls -ld backups | awk '{print "  backups/: " $1}'
echo "  backups 里的文件属主分布："
ls -l backups/*.gz 2>/dev/null | awk '{print "    " $3 ":" $4 " " $9}' | head -5

echo
echo '########## 生产环境是否启用了测试后门 ##########'
grep -q '^DEV_LOGIN_TOKEN=' .env && echo '  ⚠ DEV_LOGIN_TOKEN 已设置（测试登录后门是可用的）' || echo '  ✓ 没有 DEV_LOGIN_TOKEN（测试后门关闭）'

echo
echo '########## 登录是否有限流 ##########'
grep -n 'rate\|limit\|attempt\|失败次数' server/index.js | head -5 || echo '  index.js 里没有明显限流代码'
grep -n 'loginFail\|failCount\|blocked' server/index.js | head -5 || true

echo
echo '########## 管理页登录实现 ##########'
grep -n -A6 "api/admin/login" server/index.js | head -20

echo
echo '########## 容器内的敏感环境变量（只看键名）##########'
docker compose config 2>/dev/null | grep -E '^      [A-Z_]+:' | sed 's/:.*//' | sort -u | sed 's/^/  /'

echo
echo '########## 镜像与体积 ##########'
docker images --format '{{.Repository}}:{{.Tag}}\t{{.Size}}' | grep -E 'gym|postgres|caddy' | sed 's/^/  /'
