// 生产后端加一个「测试环境代理」：/test-api/* → staging 容器
// 这样体验版全部走老域名 gym.novrein.com（解析稳定、已在白名单），不用再依赖新域名，也不用改外层 nginx
const fs = require('fs')

const SERVER = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server'
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

// 1. index.js：加代理中间件
edit(SERVER + '/index.js', t => {
  if (t.includes('/test-api')) return t

  // 确保引入了 http
  if (!/require\('http'\)/.test(t)) {
    t = t.replace(/^(const express = require\('express'\)\n)/m, "$1const http = require('http')\n")
  }

  const anchor = `app.use(express.json({ limit: '2mb' }))`
  const block = `app.use(express.json({ limit: '2mb' }))

// ---------- 测试环境反代（体验版专用） ----------
// 体验版把请求发到 https://gym.novrein.com/test-api/*，这里转发给 staging 容器。
// 好处：只用一个老域名（解析稳定、已在微信白名单），大文件上传也不会再遇到 DNS 问题。
if (process.env.STAGING_PROXY_URL) {
  const stagingUrl = process.env.STAGING_PROXY_URL
  app.use('/test-api', (req, res) => {
    let target
    try {
      target = new URL(stagingUrl)
    } catch (e) {
      res.statusCode = 500
      return res.end(JSON.stringify({ code: 500, msg: '测试环境地址配置错误' }))
    }
    const headers = Object.assign({}, req.headers)
    headers.host = target.host

    const preq = http.request({
      hostname: target.hostname,
      port: target.port || 80,
      path: req.url,
      method: req.method,
      headers
    }, pres => {
      res.writeHead(pres.statusCode || 502, pres.headers)
      pres.pipe(res)
    })

    preq.on('error', err => {
      console.warn('staging proxy error', err.message)
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ code: 502, msg: '测试环境暂时不可用' }))
      } else {
        res.end()
      }
    })

    req.pipe(preq)
  })
  console.log('staging proxy enabled ->', stagingUrl)
}`

  if (!t.includes(anchor)) return t
  return t.replace(anchor, block)
}, 'index.js：测试环境代理 /test-api')

// 2. 生产 compose：注入 STAGING_PROXY_URL
edit('C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/docker-compose.yml', t => {
  if (t.includes('STAGING_PROXY_URL')) return t
  return t.replace(
    `      # 体测报告图片识别（自建 OCR 服务，见 ./ocr）`,
    `      # 体验版代理：把 /test-api/* 转发给测试环境容器（不配则关闭）
      STAGING_PROXY_URL: \${STAGING_PROXY_URL:-http://server-staging:3000}
      # 体测报告图片识别（自建 OCR 服务，见 ./ocr）`
  )
}, 'compose：注入 STAGING_PROXY_URL')

console.log(done.map(x => '  ✓ ' + x).join('\n'))
require('child_process').execFileSync(process.execPath, ['--check', SERVER + '/index.js'])
console.log('  ✓ 语法通过')
