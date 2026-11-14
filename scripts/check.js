#!/usr/bin/env node
// 小程序静态自检：不需要微信开发者工具，也不需要连服务器。
//
//   node scripts/check.js
//
// 检查项：
//   1. 所有 .json 文件可解析
//   2. wxml 里绑定的事件在页面 JS 里存在（绑定漏写会表现为"点了没反应"）
//   3. app.json tabBar 引用的图标文件存在
//   4. wxml 引用的标识符在页面 JS 里出现过（抓拼写错误）
//   5. 小程序调用的 action 在自建后端里都有实现
const fs = require('fs')
const path = require('path')

function read(file) {
  return fs.readFileSync(file, 'utf8')
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

/**
 * 对给定仓库根目录做检查。
 * @param {string} root 仓库根目录（含 miniprogram/ 与 deploy/server/lib/）
 * @returns {{problems: string[], stats: object}}
 */
function check(root) {
  const MP = path.join(root, 'miniprogram')
  const SERVER_LIB = path.join(root, 'deploy', 'server', 'lib')
  const problems = []
  const stats = { pages: 0, bindings: 0, json: 0, clientActions: 0, serverActions: 0 }

  const app = JSON.parse(read(path.join(MP, 'app.json')))

  // ---------- 1. JSON 合法性 ----------
  for (const file of walk(MP, []).filter(f => f.endsWith('.json'))) {
    stats.json++
    try {
      JSON.parse(read(file))
    } catch (e) {
      problems.push('JSON 解析失败: ' + path.relative(root, file) + ' -> ' + e.message)
    }
  }

  // ---------- 2. 事件绑定 vs JS 方法 ----------
  const extractMethods = jsText => {
    const names = new Set()
    const re = /^\s{2}([a-zA-Z_$][\w$]*)\s*(?:\(|:\s*(?:function|async|=))/gm
    let m
    while ((m = re.exec(jsText)) !== null) names.add(m[1])
    return names
  }

  const extractHandlers = wxmlText => {
    const names = []
    const re = /(?:bind|catch|capture-bind|capture-catch)[:a-zA-Z-]*\s*=\s*"([^"{}]+)"/g
    let m
    while ((m = re.exec(wxmlText)) !== null) {
      const value = m[1].trim()
      if (value && /^[a-zA-Z_$][\w$]*$/.test(value)) names.push(value)
    }
    return names
  }

  for (const page of app.pages) {
    stats.pages++
    const base = path.join(MP, page)
    const wxml = base + '.wxml'
    const js = base + '.js'
    if (!fs.existsSync(wxml) || !fs.existsSync(js)) {
      problems.push('页面缺少文件: ' + page)
      continue
    }
    const methods = extractMethods(read(js))
    const handlers = extractHandlers(read(wxml))
    stats.bindings += handlers.length
    const missing = [...new Set(handlers)].filter(h => !methods.has(h))
    if (missing.length) problems.push('事件绑定在 JS 里找不到: ' + page + ' -> ' + missing.join(', '))
  }

  // ---------- 3. tabBar 图标 ----------
  if (app.tabBar && Array.isArray(app.tabBar.list)) {
    for (const item of app.tabBar.list) {
      for (const key of ['iconPath', 'selectedIconPath']) {
        const icon = item[key]
        if (icon && !fs.existsSync(path.join(MP, icon))) problems.push('tabBar 图标缺失: ' + icon)
      }
    }
  } else {
    problems.push('app.json 没有 tabBar 配置')
  }

  // ---------- 4. wxml 引用的标识符在 JS 里出现过 ----------
  const wxmlAliases = wxmlText => {
    const alias = new Set()
    let m
    const re = /wx:for-(?:item|index)\s*=\s*"([^"]+)"/g
    while ((m = re.exec(wxmlText)) !== null) alias.add(m[1].trim())
    const re2 = /<wxs[^>]*\bmodule\s*=\s*"([^"]+)"/g
    while ((m = re2.exec(wxmlText)) !== null) alias.add(m[1].trim())
    return alias
  }

  const BUILTINS = new Set(['true', 'false', 'null', 'undefined', 'this'])
  const FOR_DEFAULTS = new Set(['item', 'index']) // wx:for 未声明别名时的默认值

  for (const page of app.pages) {
    const wxmlPath = path.join(MP, page + '.wxml')
    if (!fs.existsSync(wxmlPath)) continue
    const wxmlText = read(wxmlPath)
    const jsText = read(path.join(MP, page + '.js'))
    const alias = wxmlAliases(wxmlText)

    const refs = new Set()
    const re = /\{\{\s*([a-zA-Z_$][\w$]*)/g
    let m
    while ((m = re.exec(wxmlText)) !== null) refs.add(m[1])

    const missing = [...refs].filter(r =>
      !alias.has(r) && !FOR_DEFAULTS.has(r) && !BUILTINS.has(r) &&
      !new RegExp('(^|[^\\w$.])' + r.replace(/\$/g, '\\$') + '($|[^\\w$])').test(jsText)
    )
    if (missing.length) problems.push('wxml 引用的标识符在 JS 里没有: ' + page + ' -> ' + missing.join(', '))
  }

  // ---------- 5. 页面里的相对 require 能否解析 ----------
  // 少写一级 ../ 会让页面 JS 加载失败，页面组件注册不上，
  // 表现为「点进去白屏」并报 Component is not found in path "wx://not-found"。
  for (const page of app.pages) {
    const jsPath = path.join(MP, page + '.js')
    if (!fs.existsSync(jsPath)) continue
    const text = read(jsPath)
    const re = /require\(\s*'(\.[^']+)'\s*\)/g
    let m
    while ((m = re.exec(text)) !== null) {
      const rel = m[1]
      const base = path.resolve(path.dirname(jsPath), rel)
      const candidates = [base, base + '.js', path.join(base, 'index.js')]
      if (!candidates.some(c => fs.existsSync(c))) {
        problems.push('require 路径解析不到: ' + page + '.js -> ' + rel)
      }
    }
  }

  // ---------- 6. action 一致性 ----------
  const clientActions = () => {
    const actions = new Set()
    for (const file of walk(MP, [])) {
      if (!file.endsWith('.js')) continue
      const name = path.basename(file)
      if (name === 'api.js' || name === 'api-cloud.js') continue
      const text = read(file)
      const re = /call\(\s*'([a-zA-Z0-9_]+)'/g
      let m
      while ((m = re.exec(text)) !== null) actions.add(m[1])
    }
    return actions
  }

  const serverActions = () => {
    const actions = new Set()
    // 只统计真正的 action 模块；common/db/cron/notify/templates/lift-items 是内部工具
    const MODULES = ['system', 'member', 'booking', 'entry', 'admin', 'fitness', 'moment', 'competition']
    const internal = new Set([
      'LIFTS', 'bmiOf', 'oneRM', 'scoreBody', 'publicMe', 'isInitialized',
      'markNoShows', 'remindClasses', 'remindExpiringCards'
    ])
    for (const file of fs.readdirSync(SERVER_LIB).filter(f => f.endsWith('.js'))) {
      if (!MODULES.includes(file.slice(0, -3))) continue
      const text = read(path.join(SERVER_LIB, file))
      const start = /module\.exports\s*=\s*\{/.exec(text)
      if (!start) continue
      let i = start.index + start[0].length
      let depth = 1
      let body = ''
      while (i < text.length && depth > 0) {
        const ch = text[i]
        if (ch === '{') depth++
        else if (ch === '}') depth--
        if (depth > 0) body += ch
        i++
      }
      for (const part of body.split(',')) {
        const key = part.split(':')[0].trim()
        if (/^[a-zA-Z_$][\w$]*$/.test(key) && !internal.has(key)) actions.add(key)
      }
    }
    return actions
  }

  const client = clientActions()
  const server = serverActions()
  stats.clientActions = client.size
  stats.serverActions = server.size
  const unimplemented = [...client].filter(a => !server.has(a))
  if (unimplemented.length) {
    problems.push('小程序调用了后端未实现的 action: ' + unimplemented.join(', '))
  }

  return { problems, stats }
}

module.exports = { check }

if (require.main === module) {
  const root = path.join(__dirname, '..')
  const { problems, stats } = check(root)
  console.log('页面 ' + stats.pages + '  事件绑定 ' + stats.bindings + '  JSON ' + stats.json)
  console.log('小程序 action ' + stats.clientActions + '  后端 action ' + stats.serverActions)
  if (problems.length) {
    console.log('\n发现 ' + problems.length + ' 个问题：')
    for (const p of problems) console.log('  x ' + p)
    process.exit(1)
  }
  console.log('\n全部检查通过')
}
