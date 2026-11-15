// 体测报告识别：文字解析 + 图片 OCR 两个动作放进 fitness 模块
const fs = require('fs')

const FILE = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/fitness.js'
let src = fs.readFileSync(FILE, 'utf8')

// ---------- 1. 顶部引入 ----------
const OLD_HEAD = "const liftItems = require('./lift-items')"
const NEW_HEAD = `const liftItems = require('./lift-items')
const bodyReport = require('./body-report')
const ocr = require('./ocr')
const { query: dbQuery } = require('./db')`
if (!src.includes(OLD_HEAD)) throw new Error('找不到 liftItems 引入')
src = src.replace(OLD_HEAD, NEW_HEAD)

// ---------- 2. 追加两个 action ----------
const ACTIONS = `
// ---------- 体测报告识别 ----------

/**
 * 解析报告文字 → 体测字段（不落库，前端回填给教练核对后再保存）
 * 教练也能用：只是把图片上的数字转成字段，不涉及改别人资料。
 */
async function parseBodyReport({ me, data }) {
  need(me, 'coach')
  const text = String((data && data.text) || '')
  if (!text.trim()) fail('请把报告文字粘贴进来')
  if (text.length > 8000) fail('文字太长了，请只保留报告部分')
  const result = bodyReport.parse(text)
  const filled = result.filled || []
  if (!filled.length) fail('没认出任何体测指标，请确认粘贴的是体测报告文字')
  return {
    fields: result.fields,
    meta: result.meta,
    warnings: result.warnings,
    filled,
    textLength: text.length
  }
}

/** 读一张已上传图片的二进制：数据库存的直接查 media 表，云存储的回源下载 */
async function readUploadedImage(fileID) {
  const id = String(fileID || '').trim()
  if (!id) fail('缺少图片')

  const direct = (id.match(/\\/api\\/media\\/([\\w-]+)/) || [])[1]
  if (direct) {
    const row = (await dbQuery('select mime, bytes from media where id = $1', [direct])).rows[0]
    if (!row) fail('图片不存在或已过期，请重新上传')
    return { buffer: row.bytes, mime: row.mime || 'image/jpeg' }
  }

  if (!/^https:\\/\\//.test(id)) fail('图片地址不正确')
  const res = await fetch(id)
  if (!res.ok) fail('下载图片失败（HTTP ' + res.status + '）')
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > 12 * 1024 * 1024) fail('图片超过 12MB')
  return { buffer: buf, mime: res.headers.get('content-type') || 'image/jpeg' }
}

/** 识别报告图片：OCR 拿到文字后再解析成字段 */
async function ocrBodyReport({ me, data }) {
  need(me, 'coach')
  if (!ocr.isConfigured()) {
    fail(ocr.describe().hint)
  }
  const img = await readUploadedImage(data && data.fileID)

  let text = ''
  try {
    text = await ocr.recognize(img.buffer, img.mime)
  } catch (e) {
    fail(e.message)
  }
  if (!text) fail('没识别出文字，换一张清晰点的图，或改用粘贴文字')

  const result = bodyReport.parse(text)
  if (!result.filled.length) {
    fail('识别到文字但没解析出体测指标，建议改用粘贴文字的方式')
  }
  return {
    fields: result.fields,
    meta: result.meta,
    warnings: result.warnings,
    filled: result.filled,
    rawText: text.slice(0, 2000)
  }
}

`

const anchor = '// ---------- 隐私开关 ----------'
if (!src.includes(anchor)) throw new Error('找不到插入位置')
src = src.replace(anchor, ACTIONS + anchor)

// ---------- 3. 导出 ----------
src = src.replace(
  '  listLiftItems, saveLiftItem, setLiftItemEnabled, deleteLiftItem,',
  '  listLiftItems, saveLiftItem, setLiftItemEnabled, deleteLiftItem,\n  parseBodyReport, ocrBodyReport,'
)
fs.writeFileSync(FILE, src)

// ---------- 4. 路由映射 ----------
const IDX = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/index.js'
let idx = fs.readFileSync(IDX, 'utf8')
idx = idx.replace(
  "  bodyTrend: 'fitness',",
  "  bodyTrend: 'fitness',\n  parseBodyReport: 'fitness',\n  ocrBodyReport: 'fitness',"
)
fs.writeFileSync(IDX, idx)

console.log('fitness.js 已加入 parseBodyReport / ocrBodyReport')
console.log('index.js 已加入 ACTION_FEATURE 映射')
