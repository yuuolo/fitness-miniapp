// 修 base64：先按 UTF-8 编码成字节，再 base64（否则 SVG 里的中文会编码坏掉）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/index/index.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

const start = t.indexOf('function base64(str) {')
if (start < 0) {
  console.log('⚠ 找不到 base64 函数')
  process.exit(1)
}
const end = t.indexOf('\n}\n', start) + 2

const neu = `// 字符串 → UTF-8 字节数组（SVG 里可能有中文，不能按单字节编码）
function utf8Bytes(str) {
  const out = []
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    if (c < 0x80) {
      out.push(c)
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
    } else if (c < 0xd800 || c >= 0xe000) {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
    } else {
      const c2 = str.charCodeAt(++i)
      const cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00)
      out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
    }
  }
  return out
}

function base64(str) {
  const bytes = utf8Bytes(str)
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i]
    const b2 = bytes[i + 1]
    const b3 = bytes[i + 2]
    out += B64CHARS[b1 >> 2]
    out += B64CHARS[((b1 & 3) << 4) | (b2 === undefined ? 0 : b2 >> 4)]
    if (b2 === undefined) { out += '=='; break }
    out += B64CHARS[((b2 & 15) << 2) | (b3 === undefined ? 0 : b3 >> 6)]
    if (b3 === undefined) { out += '='; break }
    out += B64CHARS[b3 & 63]
  }
  return out
}
`

t = t.slice(0, start) + neu + t.slice(end)
fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('  ✓ base64 改为 UTF-8 编码')
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('  ✓ 语法通过')
