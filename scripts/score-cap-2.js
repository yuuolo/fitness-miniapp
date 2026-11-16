// 给三处 scoreBody 调用补上 sbdCount（按实际缩进匹配）
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/fitness.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')
let n = 0

const pairs = [
  ['    sbdTotal: sbdOf(bestLift)\n  })', '    sbdTotal: sbdOf(bestLift),\n    sbdCount: sbdCountOf(bestLift)\n  })'],
  ['    sbdTotal: sbdOf(target.bestLift)\n  })', '    sbdTotal: sbdOf(target.bestLift),\n    sbdCount: sbdCountOf(target.bestLift)\n  })'],
  ['      sbdTotal: sbdOf(member.bestLift)\n    })', '      sbdTotal: sbdOf(member.bestLift),\n      sbdCount: sbdCountOf(member.bestLift)\n    })']
]

for (const [from, to] of pairs) {
  if (t.includes(from)) {
    t = t.replace(from, to)
    n++
  } else {
    console.log('⚠ 未匹配: ' + JSON.stringify(from))
  }
}

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 更新 ' + n + ' / 3 处调用')
require('child_process').execFileSync(process.execPath, ['--check', P])
console.log('✓ 语法通过')

const calls = (fs.readFileSync(P, 'utf8').match(/sbdCount: sbdCountOf/g) || []).length
console.log('  sbdCount 调用点: ' + calls)
