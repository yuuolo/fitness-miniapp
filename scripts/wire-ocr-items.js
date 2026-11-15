// 把 OCR 的坐标信息串到解析器里，并调整返回结构
const fs = require('fs')

const SERVER = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server'

// ---------- ocr.js：recognize 返回 { text, items } ----------
const ocrPath = SERVER + '/lib/ocr.js'
let ocr = fs.readFileSync(ocrPath, 'utf8')

ocr = ocr.replace(
  `/**
 * 识别一张图片
 * @param {Buffer} buffer 图片二进制
 * @param {string} mime 图片类型
 * @returns {Promise<string>} 识别出的文字（可能为空）
 */`,
  `/**
 * 识别一张图片
 * @param {Buffer} buffer 图片二进制
 * @param {string} mime 图片类型
 * @returns {Promise<{text: string, items: Array}>}
 *   text  纯文字（按阅读顺序）
 *   items 每个词的文字与方框坐标，用来做「数值↔部位」的空间配对
 */`
)

ocr = ocr.replace(
  `    const payload = await res.json().catch(() => null)
    return extractText(payload).trim()`,
  `    const payload = await res.json().catch(() => null)
    return {
      text: extractText(payload).trim(),
      items: extractItems(payload)
    }`
)

// 新增 extractItems
ocr = ocr.replace(
  `function describe() {`,
  `/** 从返回结构里抽出带坐标的词项（支持自建网关的 items 结构） */
function extractItems(payload) {
  if (!payload || typeof payload !== 'object') return []
  // 自建 RapidOCR 网关的格式
  if (Array.isArray(payload.items)) {
    return payload.items
      .filter(it => it && typeof it.text === 'string' && typeof it.x === 'number' && typeof it.y === 'number')
      .map(it => ({
        text: it.text,
        score: Number(it.score) || 0,
        x: Number(it.x) || 0,
        y: Number(it.y) || 0,
        w: Number(it.w) || 0,
        h: Number(it.h) || 0
      }))
  }
  // 腾讯云带坐标的结构
  const tencent = payload.Response && payload.Response.TextDetections
  if (Array.isArray(tencent)) {
    return tencent
      .filter(x => x && x.DetectedText && x.ItemPolygon)
      .map(x => {
        const xs = x.ItemPolygon.XCoordinates || []
        const ys = x.ItemPolygon.YCoordinates || []
        return {
          text: x.DetectedText,
          score: (Number(x.Confidence) || 0) / 100,
          x: Math.min.apply(null, xs),
          y: Math.min.apply(null, ys),
          w: Math.max.apply(null, xs) - Math.min.apply(null, xs),
          h: Math.max.apply(null, ys) - Math.min.apply(null, ys)
        }
      })
  }
  return []
}

function describe() {`
)

ocr = ocr.replace(
  'module.exports = { isConfigured, recognize, extractText, describe }',
  'module.exports = { isConfigured, recognize, extractText, extractItems, describe }'
)
fs.writeFileSync(ocrPath, ocr)
console.log('ocr.js：recognize 现在返回 text + items')

// ---------- fitness.js：把 items 传给解析器 ----------
const fitPath = SERVER + '/lib/fitness.js'
let fit = fs.readFileSync(fitPath, 'utf8')

fit = fit.replace(
  `  let text = ''
  try {
    text = await ocr.recognize(img.buffer, img.mime)
  } catch (e) {
    fail(e.message)
  }
  if (!text) fail('没识别出文字，换一张清晰点的图，或改用粘贴文字')

  const result = bodyReport.parse(text)`,
  `  let recognized = { text: '', items: [] }
  try {
    recognized = await ocr.recognize(img.buffer, img.mime)
  } catch (e) {
    fail(e.message)
  }
  const text = recognized.text || ''
  if (!text) fail('没识别出文字，换一张清晰点的图，或改用粘贴文字')

  // 带上坐标：报告的节段数据必须按空间位置配对，否则会串行
  const result = bodyReport.parse(text, recognized.items)`
)

fit = fit.replace(
  `    filled: result.filled,
    rawText: text.slice(0, 2000)
  }
}`,
  `    filled: result.filled,
    rawText: text.slice(0, 2000),
    // 让前端知道这次是靠坐标解析的（节段更准）
    spatial: !!(recognized.items && recognized.items.length),
    boxes: (recognized.items || []).length
  }
}`
)
fs.writeFileSync(fitPath, fit)
console.log('fitness.js：ocrBodyReport 已传入坐标')

// ---------- 小程序：提示里体现
const mpPath = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/pages/staff/fitness/fitness.js'
let mj = fs.readFileSync(mpPath, 'utf8')
mj = mj.replace(
  `        }).then(r => {
          wx.hideLoading()
          this.setData({ recognizing: false })
          this.applyParsed(r.fields, r.meta || {}, r.warnings || [])
        }).catch(err => {`,
  `        }).then(r => {
          wx.hideLoading()
          this.setData({ recognizing: false })
          this.applyParsed(r.fields, r.meta || {}, r.warnings || [])
        }).catch(err => {`
)
fs.writeFileSync(mpPath, mj)

for (const f of [ocrPath, fitPath]) {
  require('child_process').execFileSync(process.execPath, ['--check', f])
}
console.log('语法检查通过')
