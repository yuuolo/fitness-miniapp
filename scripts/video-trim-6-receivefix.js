// 修 multipart 落盘：结尾 boundary 已处理后，end 事件不能再写（write after end）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/receive.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const from = `    req.on('end', () => {
      // 没找到结尾 boundary 也接受（有些客户端不带结尾）
      if (!started && !bytes) return fail(new Error('没有收到文件内容'))
      if (tail.length) {
        bytes += tail.length
        out.write(tail)
        tail = Buffer.alloc(0)
      }
      done()
    })`

const to = `    req.on('end', () => {
      // 已经在 data 里找到结尾 boundary 并结束了，这里别再写
      if (settled) return
      // 没找到结尾 boundary 也接受（有些客户端不带结尾）
      if (!started && !bytes && !tail.length) return fail(new Error('没有收到文件内容'))
      if (tail.length) {
        bytes += tail.length
        out.write(tail)
      }
      tail = Buffer.alloc(0)
      done()
    })`

if (!t.includes(from)) {
  console.log('⚠ 未匹配 end 处理')
  process.exit(1)
}
t = t.replace(from, to)

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 已修 write after end')
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')
