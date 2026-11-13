# 小程序自动化回归（不需要手点）

用微信开发者工具自带的自动化接口驱动小程序，把「打开就能发现」的问题在没人盯着的时候跑掉。
**前提**：本机装了微信开发者工具并已登录；下面的步骤只需做一次。

## 一次性准备

```powershell
# 1. 安装驱动库
cd scripts\automator
npm init -y
npm install miniprogram-automator

# 2. 打开开发者工具的 CLI 服务端口
#    设置 → 安全设置 → 服务端口：打开（也可用 cli 命令，见下）
# 3. 启动自动化
& "C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat" auto `
    --project <项目绝对路径> --auto-port 9421 --trust-project
```

`cli auto` 成功后会返回 `{"autoPort":9421}`，此时自动化端口就在 `ws://127.0.0.1:9421`。

## 跑三支脚本

```powershell
cd scripts\automator
$env:NODE_PATH = "$PWD\node_modules"

# 1. 页面级：登录链路、配置读取、8 个页面是否正常打开、入场码是否生成
node regression.js

# 2. 交互级：真点「预约」、看我的预约、会员卡、发友圈、资料回填
node interaction.js

# 3. 门店闭环：会员入场码 → 前台扫码核验 → 扣次/积分 → 当天不重复扣
$env:GYM_SECRET = '<数据库 config.secret 的值>'
$env:GYM_OPENID = '<测试会员 openid>'
node entry-verify.js
```

`GYM_SECRET` / `GYM_OPENID` 只用于「构造一个合法的入场码去喂给前台页」，
可以从服务器取：

```bash
ssh gym "cd /opt/gym && PW=\$(sed -n 's/^POSTGRES_PASSWORD=//p' .env) && \
  docker compose exec -T -e PGPASSWORD=\$PW db psql -U postgres -d gym -tAc \
  \"select value->>'value' from config where key='secret';\""
```

## 脚本里用到的两个技巧

1. **`mockWxMethod('showModal', { confirm: true })`** — 页面里很多操作（预约、取消、初始化）
   会先弹确认框，自动化点不到原生弹窗，直接把返回值 mock 成「确定」。
2. **`mockWxMethod('requestSubscribeMessage', {...})`** — 订阅授权面板不会自己返回，
   不 mock 的话 `subscribe().then(...)` 之后的业务请求永远不会发出（表现为点了没反应）。

## 已知边界

- 自动化只在**开发者工具的模拟器**里跑，真机差异（尤其 iOS 渲染、`getSystemInfo`）仍需人工过一次。
- `wx.scanCode` / `wx.chooseMedia` 这类需要真实硬件的接口，脚本里是 mock 的。
- 视频上传、海报保存到相册这类依赖本地文件系统的行为，自动化覆盖不到。
