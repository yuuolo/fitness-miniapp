#!/usr/bin/env bash
# 生产部署前准备（macOS / Linux）：配 SSH 免密 + 服务器装 Docker
#
# 用法：
#   bash deploy/scripts/prepare.sh root@1.2.3.4
#   bash deploy/scripts/prepare.sh ubuntu@1.2.3.4 2222 gym
#   SKIP_DOCKER=1 bash deploy/scripts/prepare.sh root@1.2.3.4   # 只配免密

set -euo pipefail

SERVER="${1:-}"
PORT="${2:-22}"
ALIAS="${3:-gym}"
KEY="${KEY_PATH:-$HOME/.ssh/id_ed25519_gym}"

if [ -z "$SERVER" ]; then
  echo "用法: bash $0 user@host [port] [alias]" >&2
  exit 1
fi
if [[ "$SERVER" != *@* ]]; then
  echo "Server 格式应为 user@host" >&2
  exit 1
fi

HOST="${SERVER#*@}"
USER_NAME="${SERVER%@*}"
SSH_DIR="$HOME/.ssh"
CONFIG="$SSH_DIR/config"

log() { printf '\033[1;32m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$1"; }

for c in ssh ssh-keygen scp; do
  command -v "$c" >/dev/null 2>&1 || { echo "缺少 $c" >&2; exit 1; }
done

mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

# ---------- 1. 生成密钥 ----------
if [ -f "$KEY" ]; then
  log "已有密钥：$KEY"
else
  log "生成密钥：$KEY"
  ssh-keygen -t ed25519 -f "$KEY" -N "" -C "gym-deploy@$(hostname)" >/dev/null
fi

# ---------- 2. 上传公钥 ----------
log "上传公钥到 $SERVER（可能要求输入一次密码）"
# ssh-copy-id 行为是幂等的：已存在的 key 不会重复写入
if command -v ssh-copy-id >/dev/null 2>&1; then
  ssh-copy-id -i "$KEY.pub" -p "$PORT" "$SERVER"
else
  ssh -p "$PORT" -o StrictHostKeyChecking=accept-new "$SERVER" \
    "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && sort -u ~/.ssh/authorized_keys -o ~/.ssh/authorized_keys" \
    < "$KEY.pub"
fi

# ---------- 3. 写 ssh config ----------
if grep -Eq "^[[:space:]]*Host[[:space:]]+${ALIAS}[[:space:]]*$" "$CONFIG" 2>/dev/null; then
  log "ssh config 里已有 Host $ALIAS"
else
  log "追加 Host $ALIAS 到 ssh config"
  {
    echo ""
    echo "Host $ALIAS"
    echo "    HostName $HOST"
    echo "    User $USER_NAME"
    echo "    Port $PORT"
    echo "    IdentityFile $KEY"
    echo "    IdentitiesOnly yes"
    echo "    ServerAliveInterval 30"
  } >> "$CONFIG"
  chmod 600 "$CONFIG"
fi

# ---------- 4. 验证 ----------
log "验证免密登录"
ssh -o BatchMode=yes -o ConnectTimeout=10 "$ALIAS" 'echo ok' >/dev/null
log "免密登录成功：ssh $ALIAS"

# ---------- 5. 服务器装 Docker ----------
if [ "${SKIP_DOCKER:-0}" = "1" ]; then
  log "已跳过 Docker 安装（SKIP_DOCKER=1）"
else
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REMOTE=/tmp/gym-setup-server.sh
  log "推送服务器准备脚本"
  scp -P "$PORT" "$SCRIPT_DIR/setup-server.sh" "$ALIAS:$REMOTE" >/dev/null
  log "在服务器上执行"
  ssh "$ALIAS" "sudo bash $REMOTE"
fi

echo
log "准备完成"
echo "    ssh $ALIAS"
echo
echo "下一步："
echo "    scp -P $PORT -r deploy/* $ALIAS:/opt/gym/"
echo "    ssh $ALIAS"
echo "    cd /opt/gym && cp .env.example .env && vi .env"
echo "    docker compose up -d --build"
