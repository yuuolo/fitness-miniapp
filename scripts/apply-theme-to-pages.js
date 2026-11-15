// 给所有页面挂主题类：utils/theme 的 sync + 根节点 {{themeClass}}
const fs = require('fs')
const path = require('path')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram'
const app = JSON.parse(fs.readFileSync(path.join(MP, 'app.json'), 'utf8'))

function relToUtils(pagePath) {
  // pages/a/b → ../../utils/theme；pages/a/b/c → ../../../utils/theme
  const dirs = pagePath.split('/').slice(0, -1) // 去掉文件名
  return '../'.repeat(dirs.length) + 'utils/theme'
}

let jsPatched = 0
let wxmlPatched = 0
const skipped = []

for (const page of app.pages) {
  const jsPath = path.join(MP, page + '.js')
  const wxmlPath = path.join(MP, page + '.wxml')
  if (!fs.existsSync(jsPath)) { skipped.push(page + '（无 js）'); continue }

  // ---------- wxml：根节点加 {{themeClass}} ----------
  if (fs.existsSync(wxmlPath)) {
    let wxml = fs.readFileSync(wxmlPath, 'utf8')
    const before = wxml
    // class="page" → class="page {{themeClass}}"（可能有多处根节点，例如详情页的两个分支）
    wxml = wxml.split('class="page"').join('class="page {{themeClass}}"')
    if (wxml !== before) {
      fs.writeFileSync(wxmlPath, wxml)
      wxmlPatched++
    }
  }

  // ---------- js：require + data + onShow ----------
  let js = fs.readFileSync(jsPath, 'utf8')
  const before = js

  const reqPath = relToUtils(page)
  if (!js.includes("utils/theme'")) {
    // 插到第一个 require 之后；没有 require 就插到文件顶部
    const firstRequire = js.match(/^const .*require\([^)]*\)\n/m)
    if (firstRequire) {
      const idx = js.indexOf(firstRequire[0]) + firstRequire[0].length
      js = js.slice(0, idx) + "const theme = require('" + reqPath + "')\n" + js.slice(idx)
    } else {
      js = "const theme = require('" + reqPath + "')\n" + js
    }
  }

  // data 里加 themeClass
  if (!js.includes('themeClass')) {
    js = js.replace(/Page\(\{\s*\n(\s*)data:\s*\{/, (m, indent) => m.replace('data: {', 'data: {\n' + indent + '  themeClass: \'theme-auto\','))
  }

  // onShow 里同步主题；没有 onShow 就补一个
  if (!js.includes('theme.sync(this)')) {
    if (/onShow\s*\(\s*\)\s*\{/.test(js)) {
      js = js.replace(/onShow\s*\(\s*\)\s*\{/, 'onShow() {\n    theme.sync(this)')
    } else {
      // 没有 onShow：插到 Page({ 之后第一个方法之前
      const pageStart = js.indexOf('Page({')
      const afterBrace = js.indexOf('\n', pageStart)
      js = js.slice(0, afterBrace + 1) +
        '\n  onShow() {\n    theme.sync(this)\n  },\n' +
        js.slice(afterBrace + 1)
    }
  }

  if (js !== before) {
    fs.writeFileSync(jsPath, js)
    jsPatched++
  }
}

console.log('页面 JS 已挂主题：' + jsPatched + ' 个')
console.log('页面 WXML 已挂主题类：' + wxmlPatched + ' 个')
if (skipped.length) console.log('跳过：' + skipped.join(', '))

// ---------- 自定义 tabBar ----------
const tabJsPath = path.join(MP, 'custom-tab-bar/index.js')
let tabJs = fs.readFileSync(tabJsPath, 'utf8')
if (!tabJs.includes('utils/theme')) {
  tabJs = tabJs.replace(
    "const features = require('../utils/features')",
    "const features = require('../utils/features')\nconst theme = require('../utils/theme')"
  )
  tabJs = tabJs.replace('    tabs: ALL_TABS,', '    tabs: ALL_TABS,\n    themeClass: \'theme-auto\',')
  // refresh 里同步主题类
  tabJs = tabJs.replace(
    "      this.setData({ tabs, current: route, ready: true })",
    "      this.setData({ tabs, current: route, ready: true, themeClass: theme.cls() })"
  )
  // 订阅主题变化
  tabJs = tabJs.replace(
    "  attached() {\n    this.off = features.subscribe(() => this.refresh())",
    "  attached() {\n    this.off = features.subscribe(() => this.refresh())\n    this.offTheme = theme.subscribe(() => this.refresh())"
  )
  tabJs = tabJs.replace(
    "  detached() {\n    if (this.off) this.off()",
    "  detached() {\n    if (this.off) this.off()\n    if (this.offTheme) this.offTheme()"
  )
  fs.writeFileSync(tabJsPath, tabJs)
  console.log('custom-tab-bar JS 已订阅主题')
}

// tabBar wxml 根节点加主题类
const tabWxmlPath = path.join(MP, 'custom-tab-bar/index.wxml')
let tabWxml = fs.readFileSync(tabWxmlPath, 'utf8')
if (!tabWxml.includes('themeClass')) {
  tabWxml = tabWxml.replace('class="tabbar"', 'class="tabbar {{themeClass}}"')
  fs.writeFileSync(tabWxmlPath, tabWxml)
  console.log('custom-tab-bar WXML 已挂主题类')
}
