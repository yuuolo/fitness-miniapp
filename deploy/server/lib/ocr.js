// 图片 OCR：把体测报告图片识别成文字
//
// 这里不绑定某一家云服务，走通用的 HTTP 约定：
//   POST {OCR_URL}  body: {"image": "<base64>", "mime": "image/jpeg"}
//   可选请求头：Authorization: Bearer {OCR_KEY}
// 返回 JSON，自动兼容几种常见结构：
//   {"text": "..."}
//   {"result": {"text": "..."}}
//   {"data": {"text": "..."}}
//   {"Response": {"TextDetections": [{"DetectedText": "..."}]}}   ← 腾讯云印刷体识别
//   {"words_result": [{"words": "..."}]}                          ← 百度通用文字识别
//
// 这样既能接腾讯云/百度/阿里，也能接自建的 PaddleOCR 网关。
// 没配置 OCR_URL 时，前端会提示改用「提取文字 → 粘贴」的方式，功能不阻塞。
const CONFIG = {
  url: (process.env.OCR_URL || '').trim(),
  key: (process.env.OCR_KEY || '').trim(),
  timeout: Number(process.env.OCR_TIMEOUT || 15000)
}

function isConfigured() {
  return !!CONFIG.url
}

/** 从各家返回结构里抽出纯文本 */
function extractText(payload) {
  if (!payload) return ''
  const join = arr => arr.filter(Boolean).join('\n')

  if (typeof payload === 'string') return payload
  if (typeof payload.text === 'string') return payload.text
  if (payload.result && typeof payload.result.text === 'string') return payload.result.text
  if (payload.data && typeof payload.data.text === 'string') return payload.data.text

  // 腾讯云
  const tencent = payload.Response && payload.Response.TextDetections
  if (Array.isArray(tencent)) return join(tencent.map(x => x && x.DetectedText))

  // 百度
  if (Array.isArray(payload.words_result)) return join(payload.words_result.map(x => x && x.words))

  // 阿里云
  if (payload.Data && typeof payload.Data.content === 'string') return payload.Data.content

  // 自定义网关：{ lines: [...] }
  if (Array.isArray(payload.lines)) return join(payload.lines)

  return ''
}

/**
 * 识别一张图片
 * @param {Buffer} buffer 图片二进制
 * @param {string} mime 图片类型
 * @returns {Promise<string>} 识别出的文字（可能为空）
 */
async function recognize(buffer, mime) {
  if (!isConfigured()) {
    const err = new Error('服务器还没配置图片识别服务（OCR_URL）')
    err.code = 'NO_OCR'
    throw err
  }
  if (!buffer || !buffer.length) {
    const err = new Error('图片内容为空')
    err.code = 'EMPTY'
    throw err
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CONFIG.timeout)
  try {
    const headers = { 'content-type': 'application/json' }
    if (CONFIG.key) headers.authorization = 'Bearer ' + CONFIG.key

    const res = await fetch(CONFIG.url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        image: buffer.toString('base64'),
        mime: mime || 'image/jpeg'
      })
    })

    if (!res.ok) {
      const err = new Error('识别服务返回 HTTP ' + res.status)
      err.code = 'HTTP'
      throw err
    }
    const payload = await res.json().catch(() => null)
    return extractText(payload).trim()
  } catch (e) {
    if (e.name === 'AbortError') {
      const err = new Error('识别超时，请重试或改用粘贴文字')
      err.code = 'TIMEOUT'
      throw err
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

function describe() {
  return {
    configured: isConfigured(),
    url: CONFIG.url ? CONFIG.url.replace(/\/\/[^/]+/, '//***') : '',
    // 给管理页/前端提示用
    hint: isConfigured()
      ? ''
      : '没配置 OCR 服务。可以先用微信自带的「提取文字」把报告转成文本，再粘贴到录入页。'
  }
}

module.exports = { isConfigured, recognize, extractText, describe }
