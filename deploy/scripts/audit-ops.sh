#!/usr/bin/env bash
# 运维层面的现状：TLS、日志轮转、重启策略、端口暴露、备份任务、磁盘趋势
set -uo pipefail

echo '########## TLS 证书 ##########'
echo | timeout 15 openssl s_client -servername gym.novrein.com -connect gym.novrein.com:443 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates 2>/dev/null || echo '  无法获取（可能证书在另一台机器上）'

echo
echo '########## 端口暴露面 ##########'
echo '--- 宿主机对外监听（容器映射）---'
cd /opt/gym && docker compose ps --format '{{.Name}} {{.Ports}}'

echo
echo '########## Docker 日志管理 ##########'
if [ -f /etc/docker/daemon.json ]; then
  echo '  /etc/docker/daemon.json:'
  cat /etc/docker/daemon.json
else
  echo '  没有 /etc/docker/daemon.json → 容器日志无限增长（默认 json-file 无上限）'
fi
echo '--- 当前容器日志体积 ---'
for c in $(docker ps --format '{{.Names}}'); do
  sz=$(docker inspect --format='{{.LogPath}}' "$c" 2>/dev/null | xargs -r ls -l 2>/dev/null | awk '{print $5}')
  printf '  %-18s %s bytes\n' "$c" "${sz:-0}"
done

echo
echo '########## 重启策略 / 自愈 ##########'
docker ps --format '{{.Names}}\t{{.Status}}' | while read -r line; do echo "  $line"; done
echo '--- 容器重启次数 ---'
for c in $(docker ps --format '{{.Names}}'); do
  printf '  %-18s RestartCount=%s\n' "$c" "$(docker inspect -f '{{.RestartCount}}' "$c")"
done

echo
echo '########## 是否有监控/告警 ##########'
which prometheus node_exporter 2>/dev/null || echo '  没有装监控组件'
ls /etc/cron.d 2>/dev/null | grep -v -E 'e2scrub|^$' || echo '  没有其它定时任务'

echo
echo '########## 备份任务是否真的在跑 ##########'
echo '  应用备份文件（按时间）：'
ls -lat /opt/gym/backups/app-*.jsonl.gz 2>/dev/null | head -3
echo '  最近一次备份距今：'
latest=$(ls -1t /opt/gym/backups/app-*.jsonl.gz 2>/dev/null | head -1)
if [ -n "$latest" ]; then
  echo "    $(( ($(date +%s) - $(stat -c %Y "$latest")) / 60 )) 分钟前"
else
  echo '    没有备份'
fi

echo
echo '########## 数据库连接池与慢查询 ##########'
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' /opt/gym/.env)
docker compose -f /opt/gym/docker-compose.yml exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -tAc \
  "select 'max_connections=' || current_setting('max_connections') || ', 当前=' || count(*) from pg_stat_activity;"
docker compose -f /opt/gym/docker-compose.yml exec -T -e PGPASSWORD="$PW" db psql -U postgres -d gym -tAc \
  "select 'idx_scan=' || coalesce(sum(idx_scan),0) || ', seq_scan=' || coalesce(sum(seq_scan),0) from pg_stat_user_tables;"
