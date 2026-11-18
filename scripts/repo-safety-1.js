// 仓库侧同步安全措施：危险脚本改名 + 加锁
const fs = require('fs')
const path = require('path')

const DIR = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/scripts'
const done = []

function guardFile(oldName, newName, guardText, msg) {
  const oldPath = path.join(DIR, oldName)
  const newPath = path.join(DIR, newName)
  if (!fs.existsSync(oldPath)) {
    console.log('  [!] 不存在：' + oldName)
    return
  }
  let t = fs.readFileSync(oldPath, 'utf8')
  if (t.includes('ALLOW_PROD_DELETE') || t.includes('ALLOW_PROD_WRITE')) {
    console.log('  · 已有锁：' + oldName)
    return
  }
  // 在 shebang 之后插入守卫
  t = t.replace(/^(#!\/usr\/bin\/env bash\n)/, '$1' + guardText)
  fs.writeFileSync(newPath, t)
  if (newName !== oldName) fs.unlinkSync(oldPath)
  done.push(msg)
}

guardFile(
  'cleanup-chart-data.sh',
  'DANGER-cleanup-chart-data.sh',
  `# ⚠️ 危险：这个脚本会删除生产库里**所有**力量成绩（历史事故来源之一）
# 必须显式确认：ALLOW_PROD_DELETE=1 bash DANGER-cleanup-chart-data.sh
if [ "\${ALLOW_PROD_DELETE:-}" != "1" ]; then
  echo '已拒绝执行：这会删除生产库的全部力量成绩。'
  echo '确实要清空的话：ALLOW_PROD_DELETE=1 bash $0'
  exit 1
fi

`,
  '改名加锁：DANGER-cleanup-chart-data.sh'
)

guardFile(
  'cleanup-member-demo.sh',
  'cleanup-member-demo.sh',
  `# ⚠️ 这个脚本直接操作生产库 gym，执行前请确认
if [ "\${ALLOW_PROD_WRITE:-}" != "1" ]; then
  echo "已拒绝执行：$0 直接操作生产库。确认请加 ALLOW_PROD_WRITE=1"
  exit 1
fi

`,
  '加锁：cleanup-member-demo.sh'
)

guardFile(
  'show-strength.sh',
  'show-strength.sh',
  `# ⚠️ 这个脚本直接读生产库 gym（只读也要确认，避免误以为是测试库）
if [ "\${ALLOW_PROD_WRITE:-}" != "1" ]; then
  echo "已拒绝执行：$0 直连生产库。确认请加 ALLOW_PROD_WRITE=1"
  exit 1
fi

`,
  '加锁：show-strength.sh'
)

console.log(done.map(x => '  ✓ ' + x).join('\n'))
