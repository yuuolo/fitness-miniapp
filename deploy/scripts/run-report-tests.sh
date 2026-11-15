#!/usr/bin/env bash
# 体测报告解析测试：纯逻辑，不需要数据库
set -uo pipefail
cd /opt/gym
docker run --rm --network gym_default gym-server node test/body-report.js
