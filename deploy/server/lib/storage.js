// 上传文件的存储层：可切换「数据库 / 腾讯云 COS / 阿里云 OSS」
//
// 设计目标：
//  - 调用方只关心 put(buffer) 拿回一个可访问的 https 地址，不关心存到哪
//  - 配置存在 config 表（key='storage'），敏感字段 AES-256-GCM 加密
//  - 切换驱动不影响已上传的文件：数据库里的老文件仍由 /api/media/:id 提供
const crypto = require('crypto')
const { query, one } = require('./db')
const { encrypt, decrypt, isEncrypted } = require('./secret')

const CONFIG_KEY = 'storage'
const DRIVERS = ['postgres', 'cos', 'oss']
const DRIVER_NAMES = { postgres: '服务器数据库', cos: '腾讯云 COS', oss: '阿里云 OSS' }

function defaultConfig() {
  return {
    driver: 'postgres',
    postgres: {
      baseUrl: process.env.PUBLIC_BASE_URL || 'https://gym.novrein.com'
    },
    cos: {
      secretId: '',
      secretKey: '',
      bucket: '',
      region: 'ap-guangzhou',
      publicBaseUrl: '',
      prefix: 'uploads/'
    },
    oss: {
      accessKeyId: '',
      accessKeySecret: '',
      bucket: '',
      region: 'oss-cn-shenzhen',
      publicBaseUrl: '',
      prefix: 'uploads/'
    },
    updatedAt: 0,
    updatedBy: ''
  }
}

function mergeDeep(base, patch) {
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base)
  if (!patch || typeof patch !== 'object') return out
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = mergeDeep(out[key] || {}, value)
    } else {
      out[key] = value
    }
  }
  return out
}

/** 读原始配置（敏感字段仍是密文） */
async function rawConfig() {
  const row = await one('select value from config where key = $1', [CONFIG_KEY])
  return mergeDeep(defaultConfig(), row ? row.value : {})
}

/** 读运行配置（敏感字段已解密） */
async function getConfig() {
  const cfg = await rawConfig()
  const out = mergeDeep(defaultConfig(), cfg)
  out.cos.secretKey = decrypt(cfg.cos && cfg.cos.secretKey)
  out.oss.accessKeySecret = decrypt(cfg.oss && cfg.oss.accessKeySecret)
  return out
}

/** 给管理页面用的配置：密钥只回显「是否已配置」，不回显明文 */
async function getPublicConfig() {
  const cfg = await getConfig()
  return {
    driver: cfg.driver,
    driverName: DRIVER_NAMES[cfg.driver] || cfg.driver,
    postgres: { baseUrl: cfg.postgres.baseUrl },
    cos: {
      secretId: cfg.cos.secretId,
      hasSecretKey: !!cfg.cos.secretKey,
      bucket: cfg.cos.bucket,
      region: cfg.cos.region,
      publicBaseUrl: cfg.cos.publicBaseUrl,
      prefix: cfg.cos.prefix
    },
    oss: {
      accessKeyId: cfg.oss.accessKeyId,
      hasAccessKeySecret: !!cfg.oss.accessKeySecret,
      bucket: cfg.oss.bucket,
      region: cfg.oss.region,
      publicBaseUrl: cfg.oss.publicBaseUrl,
      prefix: cfg.oss.prefix
    },
    updatedAt: cfg.updatedAt,
    updatedBy: cfg.updatedBy,
    drivers: DRIVERS.map(d => ({ key: d, name: DRIVER_NAMES[d] }))
  }
}

function validate(cfg) {
  if (!DRIVERS.includes(cfg.driver)) throw new Error('存储方式不正确')
  const need = (value, label) => {
    if (!String(value || '').trim()) throw new Error('请填写' + label)
  }
  if (cfg.driver === 'postgres') {
    need(cfg.postgres.baseUrl, '对外访问地址')
    if (!/^https?:\/\//.test(cfg.postgres.baseUrl)) throw new Error('对外访问地址要以 http(s):// 开头')
  }
  if (cfg.driver === 'cos') {
    need(cfg.cos.secretId, 'SecretId')
    need(cfg.cos.secretKey, 'SecretKey')
    need(cfg.cos.bucket, '存储桶名称')
    need(cfg.cos.region, '地域')
  }
  if (cfg.driver === 'oss') {
    need(cfg.oss.accessKeyId, 'AccessKey ID')
    need(cfg.oss.accessKeySecret, 'AccessKey Secret')
    need(cfg.oss.bucket, 'Bucket 名称')
    need(cfg.oss.region, '地域')
  }
}

/**
 * 保存配置。敏感字段：不传或传空字符串表示「保持不变」，
 * 传 __CLEAR__ 表示清空（若清空后当前驱动缺少必填项，会被校验拒绝，
 * 需要先把 driver 切走再清空）。
 */
async function saveConfig(patch, operator) {
  const current = await rawConfig()
  const next = mergeDeep(current, patch || {})

  if (!DRIVERS.includes(next.driver)) throw new Error('存储方式不正确')

  // 敏感字段处理
  const handleSecret = (driverKey, fieldKey, rawPath) => {
    const incoming = patch && patch[driverKey] ? patch[driverKey][fieldKey] : undefined
    if (incoming === '__CLEAR__') {
      next[driverKey][fieldKey] = ''
      return
    }
    if (incoming === undefined || String(incoming).trim() === '') {
      // 保持不变
      next[driverKey][fieldKey] = (current[driverKey] && current[driverKey][fieldKey]) || ''
      return
    }
    next[driverKey][fieldKey] = isEncrypted(incoming) ? incoming : encrypt(String(incoming).trim())
  }
  handleSecret('cos', 'secretKey')
  handleSecret('oss', 'accessKeySecret')

  // 数值/文本字段归一
  next.postgres.baseUrl = String(next.postgres.baseUrl || '').replace(/\/+$/, '')
  for (const d of ['cos', 'oss']) {
    next[d].publicBaseUrl = String(next[d].publicBaseUrl || '').replace(/\/+$/, '')
    let prefix = String(next[d].prefix || '').trim()
    if (prefix && !prefix.endsWith('/')) prefix += '/'
    next[d].prefix = prefix
  }

  // 用解密后的值做校验
  const runtime = mergeDeep({}, next)
  runtime.cos.secretKey = decrypt(next.cos.secretKey)
  runtime.oss.accessKeySecret = decrypt(next.oss.accessKeySecret)
  validate(runtime)

  next.updatedAt = Date.now()
  next.updatedBy = operator || 'admin'
  await query(
    `insert into config (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value`,
    [CONFIG_KEY, JSON.stringify(next)]
  )
  return getPublicConfig()
}

// ---------- 驱动实现 ----------

function buildKey(prefix, ext) {
  const now = new Date(Date.now() + 8 * 3600e3) // 北京时间
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const rand = crypto.randomBytes(10).toString('hex')
  const cleanExt = String(ext || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin'
  return `${prefix || ''}${y}/${m}/${rand}.${cleanExt}`
}

function trimSlash(url) {
  return String(url || '').replace(/\/+$/, '')
}

async function putPostgres(buffer, mime, cfg) {
  const id = crypto.randomBytes(16).toString('hex')
  await query('insert into media (id, mime, bytes, created_at) values ($1, $2, $3, $4)',
    [id, mime, buffer, Date.now()])
  return { url: trimSlash(cfg.postgres.baseUrl) + '/api/media/' + id, key: 'media/' + id }
}

function cosClient(cfg) {
  const COS = require('cos-nodejs-sdk-v5')
  return new COS({ SecretId: cfg.cos.secretId, SecretKey: cfg.cos.secretKey })
}

function cosUrl(cfg, key) {
  const base = trimSlash(cfg.cos.publicBaseUrl)
  if (base) return base + '/' + key
  return `https://${cfg.cos.bucket}.cos.${cfg.cos.region}.myqcloud.com/${key}`
}

async function putCos(buffer, mime, cfg, ext) {
  const key = buildKey(cfg.cos.prefix, ext)
  const cos = cosClient(cfg)
  await new Promise((resolve, reject) => {
    cos.putObject({
      Bucket: cfg.cos.bucket,
      Region: cfg.cos.region,
      Key: key,
      Body: buffer,
      ContentType: mime
    }, (err, data) => (err ? reject(normalizeError('腾讯云 COS', err)) : resolve(data)))
  })
  return { url: cosUrl(cfg, key), key }
}

function ossClient(cfg) {
  const OSS = require('ali-oss')
  const options = {
    region: cfg.oss.region,
    accessKeyId: cfg.oss.accessKeyId,
    accessKeySecret: cfg.oss.accessKeySecret,
    bucket: cfg.oss.bucket
  }
  return new OSS(options)
}

function ossUrl(cfg, key) {
  const base = trimSlash(cfg.oss.publicBaseUrl)
  if (base) return base + '/' + key
  const region = cfg.oss.region
  const host = region.startsWith('oss-') ? `${cfg.oss.bucket}.${region}.aliyuncs.com`
    : `${cfg.oss.bucket}.${region}.aliyuncs.com`
  return `https://${host}/${key}`
}

async function putOss(buffer, mime, cfg, ext) {
  const key = buildKey(cfg.oss.prefix, ext)
  const client = ossClient(cfg)
  try {
    await client.put(key, buffer, { mime })
  } catch (e) {
    throw normalizeError('阿里云 OSS', e)
  }
  return { url: ossUrl(cfg, key), key }
}

// 把各云厂商的错误整理成一句中文
function normalizeError(who, err) {
  const code = err && (err.code || err.name || err.status)
  const message = (err && (err.message || err.error)) || String(err)
  if (/AccessDenied|AccessDeniedError|403/i.test(String(code) + ' ' + message)) {
    return new Error(who + '：拒绝访问（检查密钥权限与存储桶 ACL）')
  }
  if (/NoSuchBucket|404/i.test(String(code) + ' ' + message)) {
    return new Error(who + '：存储桶不存在（检查桶名与地域）')
  }
  if (/InvalidAccessKey|SignatureDoesNotMatch|401/i.test(String(code) + ' ' + message)) {
    return new Error(who + '：密钥不正确')
  }
  if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED|getaddrinfo/i.test(String(code) + ' ' + message)) {
    return new Error(who + '：网络不可达（服务器无法访问该地域的接口）')
  }
  const e = new Error(who + '：' + message)
  e.code = code
  return e
}

/**
 * 保存一个文件到当前配置的存储。
 * @param {Buffer} buffer 文件内容
 * @param {{ext:string, mime:string}} meta 扩展名与 MIME
 * @returns {Promise<{url:string, key:string, driver:string}>}
 */
async function put(buffer, meta) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('没有收到文件内容')
  const cfg = await getConfig()
  const mime = meta.mime || 'application/octet-stream'
  const ext = meta.ext || 'bin'
  let result
  if (cfg.driver === 'cos') result = await putCos(buffer, mime, cfg, ext)
  else if (cfg.driver === 'oss') result = await putOss(buffer, mime, cfg, ext)
  else result = await putPostgres(buffer, mime, cfg)
  return Object.assign({ driver: cfg.driver }, result)
}

/**
 * 测试当前（或传入的）配置能否真正写入：上传一个几十字节的探针文件再删掉。
 * @param {object} [override] 未保存的配置（来自管理页表单），缺省用已保存的配置
 * @returns {Promise<{ok:boolean, message:string, driver:string}>}
 */
async function testConfig(override) {
  let cfg = await getConfig()
  if (override && override.driver) {
    cfg = mergeDeep(cfg, override)
    // 管理页里密钥留空表示「用已保存的」，这里补上
    if (!cfg.cos.secretKey) cfg.cos.secretKey = (await getConfig()).cos.secretKey
    if (!cfg.oss.accessKeySecret) cfg.oss.accessKeySecret = (await getConfig()).oss.accessKeySecret
  }
  validate(cfg)
  const probe = Buffer.from('gym-storage-probe ' + Date.now(), 'utf8')

  if (cfg.driver === 'postgres') {
    const saved = await putPostgres(probe, 'text/plain', cfg)
    await query('delete from media where id = $1', [saved.key.replace('media/', '')])
    return { ok: true, driver: cfg.driver, message: '数据库写入正常，探针文件已清理' }
  }

  if (cfg.driver === 'cos') {
    const key = buildKey(cfg.cos.prefix, 'txt')
    const cos = cosClient(cfg)
    await new Promise((resolve, reject) => {
      cos.putObject({
        Bucket: cfg.cos.bucket, Region: cfg.cos.region, Key: key,
        Body: probe, ContentType: 'text/plain'
      }, (err, data) => (err ? reject(normalizeError('腾讯云 COS', err)) : resolve(data)))
    })
    await new Promise(resolve => {
      cos.deleteObject({ Bucket: cfg.cos.bucket, Region: cfg.cos.region, Key: key }, () => resolve())
    })
    return { ok: true, driver: cfg.driver, message: 'COS 上传成功，探针文件已删除', url: cosUrl(cfg, key) }
  }

  const key = buildKey(cfg.oss.prefix, 'txt')
  const client = ossClient(cfg)
  try {
    await client.put(key, probe, { mime: 'text/plain' })
  } catch (e) {
    throw normalizeError('阿里云 OSS', e)
  }
  try {
    await client.delete(key)
  } catch (e) {
    /* 删除失败不影响结论 */
  }
  return { ok: true, driver: cfg.driver, message: 'OSS 上传成功，探针文件已删除', url: ossUrl(cfg, key) }
}

/** 存储相关的统计信息，给管理页展示 */
async function stats() {
  const cfg = await getPublicConfig()
  const media = await one(
    'select count(*)::int as files, coalesce(sum(length(bytes)),0)::bigint as bytes from media'
  )
  const dbSize = await one('select pg_database_size(current_database())::bigint as bytes')
  return {
    driver: cfg.driver,
    driverName: cfg.driverName,
    mediaFiles: Number(media.files || 0),
    mediaBytes: Number(media.bytes || 0),
    dbBytes: Number(dbSize.bytes || 0)
  }
}

module.exports = {
  DRIVERS,
  DRIVER_NAMES,
  getConfig,
  getPublicConfig,
  saveConfig,
  put,
  testConfig,
  stats
}
