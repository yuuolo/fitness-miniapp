# 生产部署前准备（Windows）：配 SSH 免密 + 服务器装 Docker
#
# 用法：
#   .\prepare.ps1 -Server root@1.2.3.4
#   .\prepare.ps1 -Server ubuntu@1.2.3.4 -Port 2222 -Alias gym
#   .\prepare.ps1 -Server root@1.2.3.4 -SkipDocker    # 只配免密
#
# 第一次会提示输入一次服务器密码，之后全程免密。

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Server,                       # user@host

  [int]$Port = 22,

  [string]$Alias = 'gym',                # ssh 配置里的别名

  [string]$KeyPath = (Join-Path $env:USERPROFILE '.ssh\id_ed25519_gym'),

  [switch]$SkipDocker
)

$ErrorActionPreference = 'Stop'

function Info($msg) { Write-Host "==> $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "[x] $msg" -ForegroundColor Red; exit 1 }

# ---------- 0. 前置检查 ----------
foreach ($cmd in @('ssh', 'ssh-keygen', 'scp')) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Fail "找不到 $cmd，请先启用 Windows 可选功能「OpenSSH 客户端」"
  }
}

if ($Server -notmatch '^[^@]+@[^@]+$') {
  Fail "-Server 格式应为 user@host，例如 root@1.2.3.4"
}

$sshDir = Join-Path $env:USERPROFILE '.ssh'
if (-not (Test-Path $sshDir)) { New-Item -ItemType Directory -Path $sshDir | Out-Null }

$hostPart = $Server.Split('@')[1]
$userPart = $Server.Split('@')[0]

# ---------- 1. 生成密钥 ----------
if (Test-Path $KeyPath) {
  Info "已有密钥：$KeyPath"
} else {
  Info "生成密钥：$KeyPath"
  # PowerShell 传空字符串给原生程序会丢参数，用 '""' 让 ssh-keygen 收到空密码
  & ssh-keygen -t ed25519 -f $KeyPath -N '""' -C "gym-deploy@$env:COMPUTERNAME" | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail 'ssh-keygen 失败' }
}

$pubPath = "$KeyPath.pub"
if (-not (Test-Path $pubPath)) { Fail "找不到公钥 $pubPath" }
$pub = (Get-Content $pubPath -Raw).Trim()

# ---------- 2. 上传公钥 ----------
Info "上传公钥到 $Server（这一步可能要求输入一次密码）"
$remoteCmd = "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && sort -u ~/.ssh/authorized_keys -o ~/.ssh/authorized_keys"
$pub | & ssh -p $Port -o StrictHostKeyChecking=accept-new $Server $remoteCmd
if ($LASTEXITCODE -ne 0) { Fail '公钥上传失败，检查地址/端口/密码是否正确' }

# ---------- 3. 写 ssh config ----------
$configPath = Join-Path $sshDir 'config'
$block = @"
Host $Alias
    HostName $hostPart
    User $userPart
    Port $Port
    IdentityFile $KeyPath
    IdentitiesOnly yes
    ServerAliveInterval 30
"@

if (Test-Path $configPath) {
  $content = Get-Content $configPath -Raw
  if ($content -match "(?m)^Host\s+$([regex]::Escape($Alias))\s*$") {
    Info "ssh config 里已有 Host $Alias，跳过"
  } else {
    Add-Content -Path $configPath -Value "`r`n$block"
    Info "已追加 Host $Alias 到 ssh config"
  }
} else {
  Set-Content -Path $configPath -Value $block -Encoding utf8
  Info "已创建 ssh config"
}

# ---------- 4. 验证免密 ----------
Info "验证免密登录"
& ssh -o BatchMode=yes -o ConnectTimeout=10 $Alias 'echo ok' | Out-Null
if ($LASTEXITCODE -ne 0) {
  Fail "免密登录验证失败。手动排查：ssh -v $Alias"
}
Info "免密登录成功：以后用  ssh $Alias  即可"

# ---------- 5. 服务器装 Docker ----------
if ($SkipDocker) {
  Info "已跳过 Docker 安装（-SkipDocker）"
} else {
  $scriptPath = Join-Path $PSScriptRoot 'setup-server.sh'
  if (-not (Test-Path $scriptPath)) { Fail "找不到 $scriptPath" }

  Info "推送并执行服务器准备脚本"
  $remote = '/tmp/gym-setup-server.sh'
  & scp -P $Port $scriptPath "${Alias}:$remote"
  if ($LASTEXITCODE -ne 0) { Fail 'scp 上传失败' }

  & ssh $Alias "sudo bash $remote"
  if ($LASTEXITCODE -ne 0) { Fail '服务器端安装失败，看上面的输出' }
}

# ---------- 6. 汇总 ----------
Write-Host ''
Info '准备完成'
Write-Host "    免密别名 : ssh $Alias"
Write-Host "    私钥路径 : $KeyPath"
Write-Host ''
Write-Host '下一步：' -ForegroundColor Cyan
Write-Host "    1) scp -P $Port -r .\deploy\* ${Alias}:/opt/gym/"
Write-Host "    2) ssh $Alias"
Write-Host '    3) cd /opt/gym && cp .env.example .env && vi .env'
Write-Host '    4) docker compose up -d --build'
