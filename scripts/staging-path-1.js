// 测试环境改走 https://gym.novrein.com/test-api（老域名解析稳定，微信上传不再报 DNS 失败）
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

// 1. 小程序：测试环境 base 改成路径前缀
edit(MP + '/utils/api.js', t => {
  t = t.replace(
    `const BASE_TEST = 'https://test-gym.novrein.com'`,
    `// 测试环境挂在老域名下用路径区分：老域名解析稳定，微信上传不会报 DNS 失败
const BASE_TEST = 'https://gym.novrein.com/test-api'`
  )
  return t
}, 'api.js：BASE_TEST → gym.novrein.com/test-api')

// 2. staging compose / 脚本里的 PUBLIC_BASE_URL
edit(DEPLOY + '/docker-compose.staging.yml', t => t.replace(
  /PUBLIC_BASE_URL: \$\{STAGING_PUBLIC_BASE_URL:-https:\/\/[^}]+\}/,
  'PUBLIC_BASE_URL: ${STAGING_PUBLIC_BASE_URL:-https://gym.novrein.com/test-api}'
), 'compose：PUBLIC_BASE_URL 默认值带路径')

for (const f of ['scripts/deploy-staging.sh', 'scripts/seed-staging.sh', 'scripts/fix-staging-media-base.sh']) {
  edit(DEPLOY + '/' + f, t => t.split('https://test-gym.novrein.com').join('https://gym.novrein.com/test-api'), f + '：域名改路径')
}

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', MP + '/utils/api.js'])
console.log('  ✓ 语法通过')
