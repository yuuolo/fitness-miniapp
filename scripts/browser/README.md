# 管理页无头浏览器测试

用本机 Chrome 无头模式真跑一遍 `/admin`，覆盖：登录、状态渲染、业务数据渲染、
驱动切换、测试连接按钮，并顺带截图。不是必需步骤，改完管理页想快速确认时用。

## 准备

```powershell
cd scripts\browser
npm init -y
npm install puppeteer-core
```

本机需要有 Chrome（脚本默认 `C:/Program Files/Google/Chrome/Application/chrome.exe`，
其它路径改脚本里的 `CHROME` 常量）。

## 运行

```powershell
$env:ADMIN_URL      = 'http://192.168.1.31/admin'   # 也可以填 https://gym.novrein.com/admin
$env:ADMIN_PASSWORD = '<服务器 .env 里的 ADMIN_PASSWORD>'
node admin-ui-test.js
```

成功时最后一行是「全部通过」，并在同目录生成 `admin-login.png` 与 `admin-panel.png`。

## 说明

- 脚本会真的点一次「测试连接」，所以会对当前配置的存储后端上传一个几十字节的探针文件并删除。
- 数据库不可达或密码错误时，脚本会明确报出是哪一步失败。
