// 校验管理页 HTML 的结构完整性（元素、处理函数、括号平衡）
const fs = require('fs')
const file = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/public/admin.html'
const text = fs.readFileSync(file, 'utf8')

let bad = 0
const need = (label, ok) => {
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + label)
  if (!ok) bad++
}

console.log('=== 元素 ===')
for (const id of ['loginCard', 'main', 'stats', 'bizData', 'runtimeConfig',
  'featureList', 'featSaveBtn', 'featReloadBtn', 'featMsg',
  'liftList', 'liftName', 'liftMetric', 'liftAddBtn', 'liftReloadBtn', 'liftMsg',
  'driver', 'saveBtn', 'testBtn', 'storageMsg']) {
  need('#' + id, text.includes('id="' + id + '"'))
}

console.log('=== 处理函数 ===')
for (const fn of ['loginBtn', 'saveBtn', 'testBtn', 'featSaveBtn', 'featReloadBtn',
  'liftAddBtn', 'liftReloadBtn', 'logoutBtn']) {
  need("$('" + fn + "').addEventListener", text.includes("$('" + fn + "')"))
}

console.log('=== 函数定义 ===')
for (const fn of ['renderLifts', 'loadLifts', 'renderFeatures', 'loadFeatures', 'fillStorage', 'loadStorage', 'loadStatus']) {
  need(fn + '()', text.includes('function ' + fn))
}

console.log('=== 括号平衡 ===')
const open = (text.match(/\{/g) || []).length
const close = (text.match(/\}/g) || []).length
need('{ ' + open + ' / } ' + close, open === close)

console.log('=== 启动时加载 ===')
need('loadFeatures 在启动流程里', /loadStatus\(\), loadStorage\(\), loadFeatures\(\)/.test(text))
need('loadLifts 在启动流程里', /loadStatus\(\), loadStorage\(\), loadFeatures\(\), loadLifts\(\)/.test(text) ||
  text.includes('loadFeatures(), loadLifts()'))

console.log('')
console.log(bad ? bad + ' 项缺失' : '结构完整')
process.exit(bad ? 1 : 0)
