// 从外网逐个检查测试库友圈媒体可访问性
const { execFileSync } = require('child_process')
const https = require('https')
const { execSync } = require('child_process')

function ssh(cmd) {
  return execSync('ssh -o BatchMode=yes gym "' + cmd.replace(/"/g, '\\"') + '"', { encoding: 'utf8' })
}

function head(url) {
  return new Promise(resolve => {
    const req = https.request(url, { method: 'GET', timeout: 15000 }, res => {
      let bytes = 0
      res.on('data', c => { bytes += c.length })
      res.on('end', () => resolve({ code: res.statusCode, bytes, type: res.headers['content-type'] || '' }))
    })
    req.on('error', e => resolve({ code: 0, error: e.message }))
    req.on('timeout', () => { req.destroy(); resolve({ code: 0, error: 'timeout' }) })
    req.end()
  })
}

;(async () => {
  const pw = ssh(`cd /opt/gym && sed -n 's/^POSTGRES_PASSWORD=//p' .env`).trim()
  const sql = "select m.id || '|' || coalesce(mb.nick_name,'?') || '|' || m.media::text from moments m left join members mb on mb.openid=m.openid order by m.created_at desc;"
  const raw = ssh(`docker exec -e PGPASSWORD='${pw}' gym-db-staging-1 psql -U postgres -d gym_staging -tAc "${sql}"`)

  const rows = raw.trim().split('\n').filter(Boolean).map(line => {
    const [id, author, mediaJson] = line.split('|')
    let media = []
    try { media = JSON.parse(mediaJson) } catch (e) {}
    return { id, author, media }
  })

  console.log('动态总数: ' + rows.length + '\n')
  let bad = 0
  for (const r of rows) {
    const report = []
    for (const m of r.media) {
      const url = m.fileID || m.url || ''
      const thumb = m.thumb || ''
      if (url) {
        const res = await head(url)
        report.push({ kind: '文件', url, ...res })
      }
      if (thumb) {
        const res = await head(thumb)
        report.push({ kind: '封面', url: thumb, ...res })
      }
    }
    const fails = report.filter(x => x.code !== 200)
    if (fails.length) {
      bad++
      console.log('✗ ' + r.author + ' (' + r.id.slice(0, 8) + ')')
      fails.forEach(f => console.log('   ' + f.kind + ' ' + f.code + ' ' + (f.error || '') + '  ' + f.url.slice(-40)))
    }
  }
  console.log('\n有问题的动态: ' + bad + ' / ' + rows.length)
})().catch(e => { console.error('异常: ' + e.message); process.exit(1) })
