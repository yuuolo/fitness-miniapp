// 配置里敏感字段的加解密（AES-256-GCM）
//
// 密钥来源：环境变量 CONFIG_SECRET，缺省回退到 POSTGRES_PASSWORD。
// 注意：换掉这两个变量会导致已保存的密钥无法解密，需要重新填写存储凭据。
const crypto = require('crypto')

const PASSPHRASE = String(
  process.env.CONFIG_SECRET || process.env.POSTGRES_PASSWORD || 'gym-config-dev-only'
)
// scrypt 派生固定 32 字节密钥；salt 固定，因为 passphrase 本身是随机的
const KEY = crypto.scryptSync(PASSPHRASE, 'gym-config-v1', 32)
const PREFIX = 'v1.'

/**
 * 加密一段明文，返回可直接存库的字符串。
 * @param {string} plain 明文
 * @returns {string} v1.<iv>.<tag>.<ciphertext>，base64url
 */
function encrypt(plain) {
  const text = String(plain === undefined || plain === null ? '' : plain)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + [iv, tag, body].map(b => b.toString('base64url')).join('.')
}

/**
 * 解密；不是本模块产出的格式（比如早期明文）原样返回，方便平滑升级。
 * @param {string} value 存库的内容
 * @returns {string} 明文
 */
function decrypt(value) {
  const text = String(value === undefined || value === null ? '' : value)
  if (!text.startsWith(PREFIX)) return text
  const parts = text.slice(PREFIX.length).split('.')
  if (parts.length !== 3) return ''
  try {
    const [iv, tag, body] = parts.map(p => Buffer.from(p, 'base64url'))
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
  } catch (e) {
    return ''
  }
}

/**
 * 判断字符串是否已是加密格式。
 * @param {string} value 待判断内容
 * @returns {boolean}
 */
function isEncrypted(value) {
  return String(value || '').startsWith(PREFIX)
}

module.exports = { encrypt, decrypt, isEncrypted }
