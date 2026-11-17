// 服务端：把小程序上传的请求体落盘（支持 wx.uploadFile 的 multipart，也支持原始二进制）
const fs = require('fs')

const BOUNDARY_HEAD_MAX = 64 * 1024

/**
 * @param req            入站请求
 * @param opts.filePath  落盘路径
 * @param opts.maxBytes  允许的最大字节数
 * @returns Promise<{ bytes, multipart }>
 */
function receiveToFile(req, opts) {
  const filePath = opts.filePath
  const maxBytes = opts.maxBytes || 200 * 1024 * 1024

  return new Promise((resolve, reject) => {
    const contentType = String(req.headers['content-type'] || '')
    const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)
    const multipart = /^multipart\/form-data/i.test(contentType) && m

    const out = fs.createWriteStream(filePath)
    let bytes = 0
    let settled = false

    const fail = err => {
      if (settled) return
      settled = true
      out.destroy()
      // 不能 destroy 请求：先把剩余数据读掉，响应（JSON）才能正常发回客户端
      try {
        req.removeAllListeners('data')
        req.on('error', () => {})
        req.resume()
      } catch (e) {}
      reject(err)
    }
    const done = () => {
      if (settled) return
      settled = true
      out.end()
      out.on('finish', () => resolve({ bytes, multipart: !!multipart }))
      out.on('error', e => reject(e))
    }

    if (!multipart) {
      req.on('data', chunk => {
        bytes += chunk.length
        if (bytes > maxBytes) return fail(new Error('文件超过上限'))
        out.write(chunk)
      })
      req.on('end', done)
      req.on('error', fail)
      return
    }

    // multipart：跳过第一条头信息，把后面的文件内容写到文件，
    // 末尾的 \r\n--boundary 不写入（相当于自己实现了个极简解析）
    const boundary = '\r\n--' + (m[1] || m[2]).trim()
    const tailSize = boundary.length + 8
    let head = Buffer.alloc(0)
    let started = false
    let tail = Buffer.alloc(0)

    req.on('data', chunk => {
      if (settled) return
      if (!started) {
        head = Buffer.concat([head, chunk])
        const idx = head.indexOf('\r\n\r\n')
        if (idx < 0) {
          if (head.length > BOUNDARY_HEAD_MAX) return fail(new Error('请求格式不正确'))
          return
        }
        started = true
        chunk = head.slice(idx + 4)
        head = Buffer.alloc(0)
        if (!chunk.length) return
      }

      const buf = tail.length ? Buffer.concat([tail, chunk]) : chunk
      const endIdx = buf.indexOf(boundary)
      if (endIdx >= 0) {
        const data = buf.slice(0, endIdx)
        if (data.length) {
          bytes += data.length
          if (bytes > maxBytes) return fail(new Error('文件超过上限'))
          out.write(data)
        }
        return done()
      }

      const keep = Math.min(tailSize, buf.length)
      const writePart = buf.slice(0, buf.length - keep)
      tail = buf.slice(buf.length - keep)
      if (writePart.length) {
        bytes += writePart.length
        if (bytes > maxBytes) return fail(new Error('文件超过上限'))
        out.write(writePart)
      }
    })
    req.on('end', () => {
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
    })
    req.on('error', fail)
  })
}

module.exports = { receiveToFile }
