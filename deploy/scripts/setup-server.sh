#!/usr/bin/env bash
# 服务器端准备脚本：安装 Docker / Compose 并放行端口
# 由 prepare.ps1 通过 ssh 推到服务器执行，也可以手动 scp 上去跑：
#   scp deploy/scripts/setup-server.sh user@host:/tmp/ && ssh user@host 'sudo bash /tmp/setup-server.sh'

set -euo pipefail

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    echo "需要 root 权限（没有 sudo）" >&2
    exit 1
  fi
fi

log() { printf '\033[1;32m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$1"; }

# ---------- 发行版 ----------
if [ -f /etc/os-release ]; then
  . /etc/os-release
  DISTRO="${ID:-unknown}"
else
  DISTRO="unknown"
fi
log "系统：${DISTRO} ${VERSION_ID:-}  架构：$(uname -m)"

# ---------- 基础依赖 ----------
install_base() {
  if command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get update -y
    $SUDO apt-get install -y ca-certificates curl gnupg git openssh-client
  elif command -v dnf >/dev/null 2>&1; then
    $SUDO dnf install -y ca-certificates curl gnupg2 git openssh-clients
  elif command -v yum >/dev/null 2>&1; then
    $SUDO yum install -y ca-certificates curl gnupg2 git openssh-clients
  else
    warn "没识别到包管理器，跳过基础依赖安装"
  fi
}
log "安装基础依赖"
install_base

# ---------- Docker ----------
if command -v docker >/dev/null 2>&1; then
  log "Docker 已存在：$(docker --version)"
else
  log "安装 Docker（官方脚本）"
  tmp=$(mktemp)
  curl -fsSL https://get.docker.com -o "$tmp"
  sh "$tmp"
  rm -f "$tmp"
fi

# ---------- Compose 插件 ----------
if docker compose version >/dev/null 2>&1; then
  log "Compose 已可用：$(docker compose version --short 2>/dev/null || echo ok)"
else
  log "补装 docker compose 插件"
  if command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get install -y docker-compose-plugin || true
  elif command -v dnf >/dev/null 2>&1; then
    $SUDO dnf install -y docker-compose-plugin || true
  fi
  if ! docker compose version >/dev/null 2>&1; then
    warn "docker compose 仍不可用，请手动检查"
  fi
fi

# ---------- 服务 ----------
if command -v systemctl >/dev/null 2>&1; then
  log "设置 Docker 开机自启"
  $SUDO systemctl enable --now docker
fi

# ---------- docker 组 ----------
# 用 sudo 跑的脚本里，SUDO_USER 是真正登录用户
TARGET_USER="${SUDO_USER:-${USER:-}}"
if [ -n "$TARGET_USER" ] && [ "$TARGET_USER" != "root" ]; then
  if id -nG "$TARGET_USER" | grep -qw docker; then
    log "$TARGET_USER 已在 docker 组"
  else
    log "把 $TARGET_USER 加入 docker 组（需重新登录生效）"
    $SUDO usermod -aG docker "$TARGET_USER"
  fi
fi

# ---------- 防火墙 ----------
if command -v ufw >/dev/null 2>&1 && $SUDO ufw status 2>/dev/null | grep -q "Status: active"; then
  log "放行 ufw 22/80/443"
  $SUDO ufw allow 22/tcp >/dev/null 2>&1 || true
  $SUDO ufw allow 80/tcp >/dev/null 2>&1 || true
  $SUDO ufw allow 443/tcp >/dev/null 2>&1 || true
elif command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
  log "放行 firewalld http/https"
  $SUDO firewall-cmd --permanent --add-service=ssh >/dev/null 2>&1 || true
  $SUDO firewall-cmd --permanent --add-service=http >/dev/null 2>&1 || true
  $SUDO firewall-cmd --permanent --add-service=https >/dev/null 2>&1 || true
  $SUDO firewall-cmd --reload >/dev/null 2>&1 || true
else
  warn "防火墙未启用或未识别，跳过放行（云服务器记得在安全组开 80/443）"
fi

# ---------- 验收 ----------
echo
log "验收"
docker --version || true
docker compose version || true
if docker info >/dev/null 2>&1; then
  echo "    docker daemon: 正常"
else
  echo "    docker daemon: 无权限或未启动（重登终端让 docker 组生效）"
fi
echo
log "服务器准备完成"
echo "    下一步：把 deploy/ 传到服务器，填好 .env，然后 docker compose up -d --build"
