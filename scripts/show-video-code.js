// 查看 uploadVideo 前端实现与 /api/video 后端实现
const fs = require('fs')

const MP = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/miniprogram/utils/api.js'
const API = fs.readFileSync(MP, 'utf8')
const i = API.indexOf('function uploadVideo')
console.log('=== 客户端 uploadVideo ===')
console.log(API.slice(i, i + 1000))

const IDX = 'C:/Users/yuuolo/Documents/deepseek/fitness-miniapp/deploy/server/index.js'
const S = fs.readFileSync(IDX, 'utf8')
const j = S.indexOf("'/api/video'")
console.log('\n=== 服务端 /api/video 前 60 行 ===')
console.log(S.slice(Math.max(0, j - 300), j + 2200))
