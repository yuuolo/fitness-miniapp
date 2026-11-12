# 自建后端部署包

把业务从「微信云开发」迁到自己的服务器。小程序只当入口。

> **两个"备案"要分清**
>
> - **域名 ICP 备案**：自建后端必须。你们已有，这条路已通。
> - **小程序备案**：小程序自己的备案（微信公众平台 → 设置 → 基本设置 → 小程序备案），
>   和域名备案是两件事，2023 年 9 月起新小程序发布前必须完成。**没做的话仍只能发体验版。**
>
> 另外：小程序 `request` 合法域名必须 HTTPS、不能带端口、不能用 IP。

> **如果服务器上已经有 nginx 占着 80/443**，Caddy 会起不来。二选一：
> 1. 停掉原 nginx（`systemctl stop nginx && systemctl disable nginx`），让 Caddy 接管；
> 2. 或不用 Caddy，把 `server` 容器端口映射出来，自己用 nginx 反代（把 `caddy` 服务删掉，
>    `server` 加 `ports: ["127.0.0.1:3000:3000"]`，nginx 里 `proxy_pass http://127.0.0.1:3000;`）。

## 软硬件要求

### 最低配置（单店、几百会员）

| 项 | 要求 | 说明 |
| --- | --- | --- |
| CPU | 1–2 核 | 一个 Node 进程足够 |
| 内存 | 2 GB 起，建议 4 GB | Docker + Postgres + 构建余量 |
| 磁盘 | 40 GB SSD | 数据库 + 图片；**视频不要放这里** |
| 带宽 | 3–5 Mbps | 视频走对象存储/CDN，不占服务器带宽 |
| 系统 | Ubuntu 22.04 / Debian 12 | 其他 Linux 也行，命令略有差异 |

### 软件

| 组件 | 版本 | 用途 |
| --- | --- | --- |
| Docker | 24+ | 运行容器 |
| Docker Compose | v2 | 一键编排 |
| Node.js | 20 LTS | 镜像内自带，无需装 |
| PostgreSQL | 16 | 镜像内自带 |
| Caddy | 2 | 反向代理 + **自动申请 HTTPS 证书** |

### 你还需要准备

1. 一台云服务器（腾讯云轻量 / 阿里云 ECS 都行，2核4G 首年通常几百块）
2. 一个**已备案**的域名，解析到服务器 IP
3. 小程序 AppID 和 AppSecret（mp.weixin.qq.com → 开发管理 → 开发设置）
4. 安全组放行 **80 / 443** 端口

## 一键部署

```bash
# 1. 上传本目录到服务器
scp -r deploy/ user@your-server:/opt/gym

# 2. 服务器上执行
cd /opt/gym
cp .env.example .env
vi .env          # 填 DOMAIN / POSTGRES_PASSWORD / WX_APPID / WX_SECRET

# 3. 启动（首次会自动构建镜像、初始化数据库表）
docker compose up -d --build

# 4. 看日志确认
docker compose logs -f server
```

启动后访问 `https://你的域名/health` 应返回 `{"ok":true}`。Caddy 会自动签发证书（首次约 30 秒）。

## 小程序侧切换

1. 把 `client-api-http.js` 拷到 `miniprogram/utils/api-http.js`，改掉里面的 `BASE`
2. 在页面里把 `require('../../utils/api')` 换成 `require('../../utils/api-http')`（接口签名保持一致：`call(action, data)`）
3. 小程序后台 → 开发管理 → 开发设置 → **服务器域名** → request 合法域名填你的域名
4. 开发者工具里需要勾掉「不校验合法域名」再测

## 当前实现范围

这个包是**能跑起来的骨架**，不是全量迁移：

| 已实现 | 说明 |
| --- | --- |
| `POST /api` | 与云函数同款 `{ action, data }` 协议，统一 `{ code, msg, data }` 返回 |
| 登录 | `wx.login` 的 code 换 openid，5 分钟缓存 |
| `ping` | 连通性自测 |
| `bodyTrend` | 按时间段查身体数据（对应云开发同名 action） |
| `saveBodyRecord` | 写一条身体数据 |
| 数据库 | 建表 + 索引脚本，容器首次启动自动执行 |
| HTTPS | Caddy 自动签发、自动续期 |

待迁移：会员卡、预约、入场码、排行榜、友圈、云函数里的定时任务（需换成服务器 cron 或系统定时器）。

## 视频放哪

**不要放服务器磁盘**。用对象存储：

- 腾讯云 COS / 阿里云 OSS：100 GB 存储约几块钱/月
- 配 CDN 后下行流量便宜很多
- 小程序 `wx.uploadFile` 直传对象存储（需要后端签发临时密钥）

视频转码（压缩、截封面）建议用对象存储自带的数据处理能力，不要在 2 核服务器上跑 ffmpeg。

## 常见问题

| 现象 | 原因 |
| --- | --- |
| Caddy 启动后证书失败 | 域名没解析到本机，或 80/443 没放行，或域名未备案 |
| 小程序报「不在合法域名列表」 | 服务器域名没配，或用了 http/端口 |
| `/api` 返回 500 | 看 `docker compose logs server`，多半是数据库连不上 |
| 数据库密码改了但连不上 | `pgdata` 卷已初始化过，改密码要删卷重建：`docker compose down -v` |
