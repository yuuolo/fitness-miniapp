// 把测试域名改成一级子域 test-gym.novrein.com（现有证书 *.novrein.com 才能覆盖）
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const DEPLOY = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy'
const done = []

function edit(p, fn, label) {
  let raw = fs.readFileSync(p, 'utf8')
  const CRLF = raw.includes('\r\n')
  let t = raw.replace(/\r\n/g, '\n')
  const before = t
  t = fn(t)
  if (t !== before) {
    fs.writeFileSync(p, CRLF ? t.replace(/\n/g, '\r\n') : t)
    done.push(label)
  } else {
    console.log('  [!] 无变化：' + label)
  }
}

edit(MP + '/utils/api.js', t => t
  .replace(/https:\/\/test\.gym\.novrein\.com/g, 'https://test-gym.novrein.com'), 'api.js：BASE_TEST → test-gym.novrein.com')

edit(DEPLOY + '/docker-compose.staging.yml', t => t
  .replace(/https:\/\/test\.gym\.novrein\.com/g, 'https://test-gym.novrein.com'), 'staging compose：PUBLIC_BASE_URL')

edit(DEPLOY + '/scripts/deploy-staging.sh', t => t
  .replace(/https:\/\/test\.gym\.novrein\.com/g, 'https://test-gym.novrein.com'), 'deploy-staging.sh 说明')

edit(DEPLOY + '/scripts/seed-staging.sh', t => t
  .replace(/https:\/\/test\.gym\.novrein\.com/g, 'https://test-gym.novrein.com'), 'seed-staging.sh 说明')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', MP + '/utils/api.js'])
console.log('  ✓ 语法通过')
