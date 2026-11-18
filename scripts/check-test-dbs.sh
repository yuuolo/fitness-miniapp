#!/usr/bin/env bash
# 检查所有测试脚本连接的是哪个库
set -uo pipefail
cd /opt/gym/scripts
for f in run-*.sh; do
  echo "--- $f ---"
  grep -nE 'DATABASE_URL|psql -d|/gym|gym_' "$f" | head -6
done
