#!/usr/bin/env node
// scripts/check.js 的自测：故意制造问题，确认检查器真的能抓到。
//
//   node scripts/check.selftest.js
//
// 如果这个自测通过但 check.js 报错，说明代码真的有问题；
// 如果自测失败，说明检查器失灵，需要先修检查器。
const fs = require('fs')
const path = require('path')
const os = require('os')

const REPO = path.join(__dirname, '..')
const { check } = require('./check.js')

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dst, entry.name)
    if (entry.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

function makeTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-check-'))
  copyDir(path.join(REPO, 'miniprogram'), path.join(root, 'miniprogram'))
  copyDir(path.join(REPO, 'deploy', 'server', 'lib'), path.join(root, 'deploy', 'server', 'lib'))
  return root
}

function run(root) {
  try {
    return check(root)
  } catch (e) {
    return { problems: ['抛出异常: ' + e.message] }
  }
}

let failures = 0

// 基线：原始代码应无问题
{
  const root = makeTree()
  const result = run(root)
  const ok = result.problems.length === 0
  console.log('[' + (ok ? 'OK' : 'FAIL') + '] 基线（原始代码）')
  if (!ok) {
    failures++
    result.problems.forEach(p => console.log('    ' + p))
  }
  fs.rmSync(root, { recursive: true, force: true })
}

const cases = [
  {
    name: '事件绑定指向不存在的方法',
    expect: '事件绑定在 JS 里找不到',
    mutate(root) {
      const f = path.join(root, 'miniprogram', 'pages', 'mine', 'mine.wxml')
      fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('bindtap="goProfile"', 'bindtap="goNowhere"'))
    }
  },
  {
    name: 'wxml 字段拼写错误',
    expect: 'wxml 引用的标识符在 JS 里没有',
    mutate(root) {
      const f = path.join(root, 'miniprogram', 'pages', 'mine', 'mine.wxml')
      fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/roleName/g, 'roleNames'))
    }
  },
  {
    name: 'JSON 语法错误',
    expect: 'JSON 解析失败',
    mutate(root) {
      fs.writeFileSync(path.join(root, 'miniprogram', 'sitemap.json'), '{ "desc": "oops", }')
    }
  },
  {
    name: '调用了后端未实现的 action',
    expect: '小程序调用了后端未实现的 action',
    mutate(root) {
      const f = path.join(root, 'miniprogram', 'pages', 'mine', 'mine.js')
      fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace("api.call('myPoints'", "api.call('myPointsNotExist'"))
    }
  },
  {
    name: 'tabBar 图标缺失',
    expect: 'tabBar 图标缺失',
    mutate(root) {
      const f = path.join(root, 'miniprogram', 'app.json')
      const app = JSON.parse(fs.readFileSync(f, 'utf8'))
      app.tabBar.list[0].iconPath = 'images/definitely-not-here.png'
      fs.writeFileSync(f, JSON.stringify(app, null, 2))
    }
  }
]

for (const testCase of cases) {
  const root = makeTree()
  testCase.mutate(root)
  const result = run(root)
  const caught = result.problems.some(p => p.includes(testCase.expect))
  console.log('[' + (caught ? 'OK' : 'FAIL') + '] ' + testCase.name)
  if (!caught) {
    failures++
    console.log('    未抓到「' + testCase.expect + '」，实际：')
    result.problems.forEach(p => console.log('      ' + p))
  }
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('')
if (failures) {
  console.log(failures + ' 项没被正确检出，检查器不可靠')
  process.exit(1)
}
console.log('基线 + ' + cases.length + ' 类问题全部符合预期，检查器有效')
