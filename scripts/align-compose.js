// 对齐仓库 compose 与生产实际部署：
//   生产是 server 直接占 80（外部 nginx 负责 TLS），caddy 并未运行
//   之前仓库版本里 caddy 占 80 + server 只 expose，和实际不符
const fs = require('fs')

const FILE = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/docker-compose.yml'
let yml = fs.readFileSync(FILE, 'utf8')
const EOL = yml.includes('\r\n') ? '\r\n' : '\n'
const lines = yml.split(/\r?\n/)
const out = []
let inServer = false
let inCaddy = false
let serverPortsDone = false

for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  const trimmed = line.trim()

  if (/^  \S+:/.test(line)) {
    inServer = trimmed === 'server:'
    inCaddy = trimmed === 'caddy:'
    out.push(line)
    continue
  }

  // server 段：把 expose 改成 ports: 80:3000
  if (inServer && trimmed === 'expose:') {
    out.push('    # 对外 80：域名由外部 nginx 反代到这里（TLS 在 nginx 上）')
    out.push('    ports:')
    out.push('      - "80:3000"')
    serverPortsDone = true
    // 跳过原来的 "      - \"3000\""
    if (lines[i + 1] && lines[i + 1].trim() === '- "3000"') i++
    continue
  }

  // caddy 段：加 profile，默认不启动（本机不用它）
  if (inCaddy && trimmed === 'restart: unless-stopped') {
    out.push(line)
    out.push('    # 生产环境用外部 nginx 终止 TLS，caddy 默认不启动；需要时 --profile caddy')
    out.push('    profiles: ["caddy"]')
    continue
  }

  out.push(line)
}

let result = out.join(EOL)

// caddy 的 80/443 端口和 server 的 80 冲突，注释掉避免误启用
result = result.replace(
  /    ports:\r?\n      - "80:80"\r?\n      - "443:443"\r?\n/,
  '    ports:' + EOL + '      - "8080:80"' + EOL + '      - "8443:443"' + EOL
)

fs.writeFileSync(FILE, result)
console.log('server 段已改为 ports 80:3000：', serverPortsDone)
console.log('\n--- 结果 ---')
console.log(result.split(/\r?\n/).filter(l => /ports|expose|profiles|80|3000|8080|8443/.test(l)).join('\n'))
