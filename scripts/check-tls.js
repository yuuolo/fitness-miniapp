// 用 TLS 连接读取证书有效期
const tls = require('tls')

const host = 'gym.novrein.com'
const socket = tls.connect({ host, port: 443, servername: host, timeout: 15000 }, () => {
  const cert = socket.getPeerCertificate()
  if (!cert || !cert.valid_to) {
    console.log('  没拿到证书')
    socket.end()
    return
  }
  const to = new Date(cert.valid_to)
  const from = new Date(cert.valid_from)
  const days = Math.round((to - Date.now()) / 86400000)
  console.log('  主体: ' + (cert.subject && cert.subject.CN))
  console.log('  颁发: ' + (cert.issuer && (cert.issuer.O || cert.issuer.CN)))
  console.log('  生效: ' + from.toISOString().slice(0, 10) + '  到期: ' + to.toISOString().slice(0, 10))
  console.log('  剩余: ' + days + ' 天' + (days < 30 ? '  ⚠ 需要关注' : '  ✓'))
  console.log('  协议: ' + socket.getProtocol())
  socket.end()
})

socket.on('error', e => console.log('  连接失败: ' + e.message))
socket.on('timeout', () => { console.log('  超时'); socket.destroy() })
