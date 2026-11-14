// 存储层测试：密钥加解密、配置校验与脱敏、数据库驱动写入、探针测试
// 用法：DATABASE_URL=postgres://.../gym_storage node test/storage.js
const assert = require('assert')
const { query, pool, ensureSchema } = require('../lib/db')
const secret = require('../lib/secret')

let passed = 0
const ok = name => { passed++; console.log('  \u2713 ' + name) }

async function expectThrow(fn, contains, name) {
  let err = null
  try { await fn() } catch (e) { err = e }
  assert.ok(err, name + ' 应该失败')
  if (contains) assert.ok(String(err.message).includes(contains), name + ' 文案不符：' + err.message)
  ok(name)
}

async function main() {
  await ensureSchema()
  await query("delete from config where key = 'storage'")
  await query('truncate media')

  // ---------- 1. 加解密 ----------
  const plain = 'AKIDexample-secret-1234567890'
  const enc = secret.encrypt(plain)
  assert.ok(enc.startsWith('v1.'), '密文应带版本前缀')
  assert.ok(!enc.includes(plain), '密文不应包含明文')
  assert.strictEqual(secret.decrypt(enc), plain)
  ok('AES-256-GCM 加密后能正确解密，密文不含明文')

  assert.strictEqual(secret.decrypt('plain-text-legacy'), 'plain-text-legacy')
  ok('非加密格式（历史明文）原样返回，便于平滑升级')

  assert.strictEqual(secret.decrypt('v1.bad.bad.bad'), '')
  ok('损坏的密文返回空字符串而不是抛异常')

  const tampered = enc.slice(0, -4) + 'AAAA'
  assert.strictEqual(secret.decrypt(tampered), '')
  ok('密文被篡改后认证失败（GCM tag 校验）')

  // ---------- 2. 默认配置 ----------
  const storage = require('../lib/storage')
  let cfg = await storage.getPublicConfig()
  assert.strictEqual(cfg.driver, 'postgres')
  assert.deepStrictEqual(cfg.drivers.map(d => d.key), ['postgres', 'cos', 'oss'])
  ok('默认存储方式是数据库，提供三种驱动')

  // ---------- 3. 配置校验 ----------
  await expectThrow(() => storage.saveConfig({ driver: 'cos' }, 'test'), 'SecretId', '切到 COS 但没填凭据时拒绝保存')
  await expectThrow(() => storage.saveConfig({ driver: 'oss' }, 'test'), 'AccessKey ID', '切到 OSS 但没填凭据时拒绝保存')
  await expectThrow(() => storage.saveConfig({ driver: 'ftp' }, 'test'), '存储方式不正确', '未知驱动被拒绝')
  await expectThrow(
    () => storage.saveConfig({ driver: 'postgres', postgres: { baseUrl: 'gym.novrein.com' } }, 'test'),
    'http', '数据库驱动的对外地址必须带协议'
  )

  // ---------- 4. 保存 COS 配置：密钥应加密入库、对外脱敏 ----------
  const cosSecret = 'COS-SECRET-KEY-abcdef'
  const saved = await storage.saveConfig({
    driver: 'cos',
    cos: {
      secretId: 'AKIDtest',
      secretKey: cosSecret,
      bucket: 'gym-1250000000',
      region: 'ap-guangzhou',
      publicBaseUrl: 'https://cdn.example.com/',
      prefix: 'uploads'
    }
  }, 'test')
  assert.strictEqual(saved.driver, 'cos')
  assert.strictEqual(saved.cos.hasSecretKey, true)
  assert.strictEqual(saved.cos.secretKey, undefined, '对外配置不能包含密钥明文')
  assert.strictEqual(saved.cos.publicBaseUrl, 'https://cdn.example.com', '尾部斜杠应被去掉')
  assert.strictEqual(saved.cos.prefix, 'uploads/', '前缀应自动补斜杠')
  ok('COS 配置保存成功，密钥不回显、地址与前缀被归一')

  const raw = (await query("select value from config where key = 'storage'")).rows[0].value
  assert.ok(String(raw.cos.secretKey).startsWith('v1.'), '库里存的应是密文')
  assert.ok(!JSON.stringify(raw).includes(cosSecret), '库里不应出现密钥明文')
  ok('云存储密钥以密文形式落在数据库里')

  const runtime = await storage.getConfig()
  assert.strictEqual(runtime.cos.secretKey, cosSecret, '运行时能解出明文供 SDK 使用')
  ok('运行时能解密密钥供 SDK 调用')

  // 留空表示不修改
  const kept = await storage.saveConfig({ driver: 'cos', cos: { bucket: 'gym-2' } }, 'test')
  assert.strictEqual(kept.cos.hasSecretKey, true, '留空密钥应保持原值')
  ok('再次保存时密钥留空 → 保持原来保存的密钥')

  // __CLEAR__ 表示清空；但当前驱动是 COS 时清空会让配置非法，应先切走再清
  await expectThrow(
    () => storage.saveConfig({ driver: 'cos', cos: { secretKey: '__CLEAR__' } }, 'test'),
    'SecretKey',
    '当前驱动为 COS 时清空密钥会被拒绝（否则配置不可用）'
  )
  const cleared = await storage.saveConfig({
    driver: 'postgres',
    postgres: { baseUrl: 'https://gym.novrein.com' },
    cos: { secretKey: '__CLEAR__' }
  }, 'test')
  assert.strictEqual((await storage.getPublicConfig()).cos.hasSecretKey, false)
  ok('切回数据库驱动后可以用 __CLEAR__ 清空已保存的密钥')

  // ---------- 5. 数据库驱动：真正写入一个文件 ----------
  await storage.saveConfig({
    driver: 'postgres',
    postgres: { baseUrl: 'https://gym.novrein.com' }
  }, 'test')
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0x03])
  const putResult = await storage.put(bytes, { ext: 'jpg', mime: 'image/jpeg' })
  assert.strictEqual(putResult.driver, 'postgres')
  assert.ok(putResult.url.indexOf('https://gym.novrein.com/api/media/') === 0, 'URL 前缀应为配置的对外地址')
  const mediaId = putResult.url.split('/').pop()
  const row = (await query('select mime, bytes from media where id = $1', [mediaId])).rows[0]
  assert.strictEqual(row.mime, 'image/jpeg')
  assert.deepStrictEqual(Buffer.from(row.bytes), bytes)
  ok('数据库驱动写入成功，字节与 MIME 都能原样读回')

  // ---------- 6. 探针测试 ----------
  const probe = await storage.testConfig({ driver: 'postgres' })
  assert.strictEqual(probe.ok, true)
  assert.ok(probe.message.includes('探针'))
  const after = (await query('select count(*)::int as n from media')).rows[0].n
  assert.strictEqual(after, 1, '探针文件应被清理，只剩上一步写入的文件')
  ok('探针测试成功且自动清理临时文件')

  // ---------- 7. 统计 ----------
  const stats = await storage.stats()
  assert.strictEqual(stats.driver, 'postgres')
  assert.strictEqual(stats.mediaFiles, 1)
  assert.strictEqual(stats.mediaBytes, bytes.length)
  assert.ok(stats.dbBytes > 0)
  ok('统计接口返回文件数、占用字节与库大小')

  // ---------- 8. 未知驱动的运行时防护 ----------
  await query(
    "insert into config (key, value) values ('storage', $1) on conflict (key) do update set value = excluded.value",
    [JSON.stringify({ driver: 'ftp' })]
  )
  await expectThrow(() => storage.testConfig({ driver: 'ftp' }), '存储方式不正确', '库里被写入未知驱动时测试接口报错')
  await query("delete from config where key = 'storage'")

  console.log('\n全部 ' + passed + ' 项断言通过')
}

main()
  .then(() => pool.end())
  .catch(err => {
    console.error('\n存储层测试失败：', err)
    pool.end().finally(() => process.exit(1))
  })
