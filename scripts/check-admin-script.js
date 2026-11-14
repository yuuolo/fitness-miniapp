// 把 admin.html 里的内联 script 抽出来做语法检查（避免只靠肉眼看）
const fs = require('fs')
const FILE = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/public/admin.html'
const html = fs.readFileSync(FILE, 'utf8')

const m = html.match(/<script>([\s\S]*?)<\/script>/)
if (!m) {
  console.error('没找到内联 script')
  process.exit(1)
}
const code = m[1]
console.log('内联脚本长度:', code.length, '字节')

try {
  // 只做语法解析，不执行（不碰 DOM）
  new Function(code)
  console.log('✓ 语法检查通过')
} catch (e) {
  console.error('✗ 语法错误:', e.message)
  process.exit(1)
}

// 顺带检查是否引用了不存在的元素 id
const ids = new Set()
for (const mm of html.matchAll(/id="([^"]+)"/g)) ids.add(mm[1])
const refs = new Set()
for (const mm of code.matchAll(/\$\('([^']+)'\)/g)) refs.add(mm[1])
const missing = [...refs].filter(r => !ids.has(r))
console.log('引用的元素:', refs.size, '个 | 页面里定义的 id:', ids.size, '个')
if (missing.length) {
  console.error('✗ 引用了不存在的元素:', missing.join(', '))
  process.exit(1)
}
console.log('✓ 所有 $() 引用的元素都存在于页面上')
