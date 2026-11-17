// 剩下两处 scoreBody 调用（withScore、saveBodyRecord 的最新档案）也带上 sbdMissing
const fs = require('fs')

const P = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/lib/fitness.js'
let raw = fs.readFileSync(P, 'utf8')
const CRLF = raw.includes('\r\n')
let t = raw.replace(/\r\n/g, '\n')

// 1. withScore（member.bestLift）
t = t.replace(
  `    sbdTotal: sbdOf(member.bestLift),
    sbdCount: sbdCountOf(member.bestLift)
  })
  return Object.assign({}, body, { score: scored.score, detail: scored.detail })`,
  `    sbdTotal: sbdOf(member.bestLift),
    sbdCount: sbdCountOf(member.bestLift),
    sbdMissing: sbdMissingOf(member.bestLift)
  })
  return Object.assign({}, body, { score: scored.score, detail: scored.detail })`
)

// 2. saveBodyRecord 里的最新档案重算（target.bestLift）
t = t.replace(
  `      sbdTotal: sbdOf(target.bestLift),
      sbdCount: sbdCountOf(target.bestLift)
    })
    latestBody.score = latestScored.score`,
  `      sbdTotal: sbdOf(target.bestLift),
      sbdCount: sbdCountOf(target.bestLift),
      sbdMissing: sbdMissingOf(target.bestLift)
    })
    latestBody.score = latestScored.score`
)

fs.writeFileSync(P, CRLF ? t.replace(/\n/g, '\r\n') : t)
console.log('✓ 剩余调用已补 sbdMissing')

// 3. 重算脚本也带上
const S = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/scripts/recompute-scores.js'
let sr = fs.readFileSync(S, 'utf8')
const sCRLF = sr.includes('\r\n')
let st = sr.replace(/\r\n/g, '\n')
st = st.replace(
  "const { scoreBody, sbdOf, sbdCountOf } = require('../lib/fitness')",
  "const { scoreBody, sbdOf, sbdCountOf, sbdMissingOf } = require('../lib/fitness')"
)
st = st.replace(
  `      sbdCount: sbdCountOf(m.best_lift)
    })`,
  `      sbdCount: sbdCountOf(m.best_lift),
      sbdMissing: sbdMissingOf(m.best_lift)
    })`
)
st = st.replace(
  `      sbdCount: sbdCountOf(bestThen)
    })`,
  `      sbdCount: sbdCountOf(bestThen),
      sbdMissing: sbdMissingOf(bestThen)
    })`
)
fs.writeFileSync(S, sCRLF ? st.replace(/\n/g, '\r\n') : st)
console.log('✓ 重算脚本已更新')

require('child_process').execFileSync(process.execPath, ['--check', P])
require('child_process').execFileSync(process.execPath, ['--check', S])
console.log('✓ 语法通过')

const after = fs.readFileSync(P, 'utf8')
console.log('  带 sbdMissing 的调用: ' + (after.match(/sbdMissing: sbdMissingOf/g) || []).length + ' / ' +
  (after.match(/scoreBody\(\{/g) || []).length)
