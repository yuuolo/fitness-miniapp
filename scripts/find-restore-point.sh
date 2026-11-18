#!/usr/bin/env bash
# 查各个备份里 strength_records 的行数，找最新的可用备份
set -uo pipefail
cd /opt/gym
for F in $(ls -t /opt/gym/backups/gym-2026111[6-8]-*.sql.gz 2>/dev/null); do
  echo "--- $(basename $F) ---"
  gunzip -c "$F" > /tmp/bk.sql 2>/dev/null
  awk '/^COPY public.strength_records/{flag=1;next}/^\\\.$/{flag=0}flag{c++}END{print "  strength_records 行数:", c+0}' /tmp/bk.sql
  awk '/^COPY public.members/{flag=1;next}/^\\\.$/{flag=0}flag{c++}END{print "  members 行数:", c+0}' /tmp/bk.sql
  rm -f /tmp/bk.sql
done

echo
echo '=== 服务器上是否有历史命令痕迹 ==='
grep -h -E 'cleanup-chart-data|delete from strength_records' /root/.bash_history /home/gym/.bash_history 2>/dev/null | tail -10 || echo '（没有）'
ls -lht /tmp/*.sh 2>/dev/null | head -10
