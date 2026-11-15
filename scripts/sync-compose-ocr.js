// 把 ocr 服务写进仓库的 docker-compose.yml（注意文件是 CRLF）
const fs = require('fs')

const FILE = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/docker-compose.yml'
let yml = fs.readFileSync(FILE, 'utf8')
const EOL = yml.includes('\r\n') ? '\r\n' : '\n'

if (yml.includes('  ocr:')) {
  console.log('compose 里已有 ocr 服务')
} else {
  const svc = [
    '  ocr:',
    '    build: ./ocr',
    '    restart: unless-stopped',
    '    environment:',
    '      PYTHONUNBUFFERED: "1"',
    '    expose:',
    '      - "8000"',
    '',
    ''
  ].join(EOL)
  const anchor = '  caddy:' + EOL
  if (!yml.includes(anchor)) throw new Error('找不到 caddy 服务')
  yml = yml.replace(anchor, svc + anchor)
  console.log('已加入 ocr 服务')
}

if (yml.includes('OCR_URL:')) {
  console.log('server 已声明 OCR_URL')
} else {
  const anchor = '      CONFIG_SECRET: ${CONFIG_SECRET:-}' + EOL
  if (!yml.includes(anchor)) throw new Error('找不到 CONFIG_SECRET')
  const add = [
    '      # 体测报告图片识别（自建 OCR 服务，见 ./ocr）',
    '      OCR_URL: ${OCR_URL:-}',
    '      OCR_TIMEOUT: ${OCR_TIMEOUT:-20000}',
    ''
  ].join(EOL)
  yml = yml.replace(anchor, anchor + add)
  console.log('server 已声明 OCR_URL')
}

fs.writeFileSync(FILE, yml)
console.log('\n--- 结果 ---')
console.log(yml.split(/\r?\n/).filter(l => /ocr|OCR/.test(l)).join('\n'))
