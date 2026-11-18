#!/usr/bin/env bash
# 看 Nov 16 20:20 备份里力量和 best_lift 的具体内容
set -uo pipefail
cd /opt/gym
F=/opt/gym/backups/gym-20261116-202017.sql.gz
gunzip -c "$F" > /tmp/bk16.sql 2>/dev/null

echo '=== 备份里的 strength_records（5 行）==='
awk '/^COPY public.strength_records/{flag=1;next}/^\\\.$/{flag=0}flag' /tmp/bk16.sql

echo
echo '=== 备份里 members 的 best_lift / sbd_total ==='
awk -F'\t' '/^COPY public.members/{flag=1;next}/^\\\.$/{flag=0}flag{print $1"\t"$2"\t"$3"\t"$4"\t"$5}' /tmp/bk16.sql | head -3

echo
echo '=== 备份表结构与列顺序（members）==='
grep -A2 '^COPY public.members' /tmp/bk16.sql | head -3

rm -f /tmp/bk16.sql
