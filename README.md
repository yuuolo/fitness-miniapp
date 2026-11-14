# 健身娱乐系统 · 第一阶段

微信小程序 + **自建后端**（Node + Express + PostgreSQL，Docker 部署在店内服务器，HTTPS 走 `https://gym.novrein.com`）。
这一阶段**不接在线支付**：会员在前台线下付款，由前台在小程序里开卡。

> 后端已从「微信云开发」全量迁移到自建服务（2026-11）。云函数版本仍保留在 `cloudfunctions/` 作为回滚参考，
> 小程序侧云开发封装保留为 `miniprogram/utils/api-cloud.js`。

## 功能

| 角色 | 能做什么 |
| --- | --- |
| 会员 | 查看会员卡、出示动态入场码（60 秒失效）、预约团课和私教课、按小时预约娱乐项目（到店付款）、查看预约和积分、看身体数据与力量排行榜、发健身友圈（视频/照片） |
| 教练 | 查看自己的课程、上课签到或标记缺席（私教课签到时扣课包）、给会员录入身体与力量数据、帮会员代拍友圈 |
| 前台 | 扫码核验入场（次卡每天首次入场扣 1 次）、搜索会员、线下收款后办卡、调整次数或有效期、停卡和作废、排课、娱乐预约核销 |
| 管理员 | 前台的全部功能，另外可以设置员工角色、管理卡种和娱乐项目 |

主要规则：

- 每天首次入场 +10 积分，上课签到 +5 积分
- 开课前 2 小时内不能取消团课；娱乐项目在开始前都可以取消
- 累计缺席 3 次，暂停预约 7 天；下课 30 分钟后仍未签到的预约会被自动记为缺席
- 停卡期间有效期不计时，恢复时自动顺延
- 订阅消息（会员授权后才会发送）：预约成功通知、开课前 2 小时提醒、会员卡到期前 3 天提醒（只在 9:00–21:00 发送）

## 目录

```
miniprogram/                小程序前端
  pages/                    会员页面：首页、约课、娱乐、我的、入场码、会员卡、我的预约、健身数据、友圈
  pages/staff/              员工页面：工作台、排课、上课名单、娱乐核销、会员、卡种、娱乐项目、录入数据
  utils/api.js              调用自建后端（https://gym.novrein.com/api）+ 文件上传
  utils/api-cloud.js        旧版云开发封装（回滚用，正常不再引用）

deploy/                     自建后端部署包（当前生产）
  docker-compose.yml        db(Postgres 16) + server(Node 20)
  docker-compose.override.yml  把 server 映射到宿主机 80，交给前置 nginx 反代
  Caddyfile                 备用：没有现成反代时由 Caddy 自动签发证书
  server/index.js           HTTP 入口：登录换 openid、action 路由、上传、媒体读取、定时任务
  server/lib/*.js           业务模块（按云函数一一对应）
    system.js               初始化与示例数据
    member.js               资料、我的卡、积分、首页
    booking.js              约课、娱乐预约、取消
    entry.js                入场码生成与核验
    admin.js                员工与管理员操作
    fitness.js              身体/力量/运动数据、排行榜、隐私
    moment.js               健身友圈、分享海报小程序码
    cron.js                 定时任务：自动记缺席、课前提醒、到期提醒
    notify.js               订阅消息发送（access_token 缓存）
    templates.js            订阅消息模板 ID 与字段映射
  server/schema.sql         PostgreSQL 表结构（幂等，启动时自动执行）
  server/test/run.js        后端集成测试（直连测试库，55 项断言）
  scripts/                  部署辅助脚本

cloudfunctions/api/         旧云开发后端（保留用于回滚，不再部署）
test/                       旧云开发本地测试（内存数据库模拟）
```

## 部署步骤

### 1. 服务器准备（一次性，已完成）

```bash
ssh gym                       # 见 deploy/scripts/prepare.ps1 配好的免密别名
```

已经装好 Docker 29 + Compose 2，服务器上目录结构：

| 路径 | 内容 |
| --- | --- |
| `/opt/gym` | 部署包 + `.env`（数据库密码、微信凭据） |
| Docker 卷 `gym_pgdata` | Postgres 数据 |

前置 nginx（内网 `192.168.1.3`）已为 `gym.novrein.com` 配置好证书和反代，转发到 `192.168.1.31:80`，
所以 `caddy` 服务不启动，由 `docker-compose.override.yml` 把 `server` 直接映射到 80。

### 2. 更新后端

```bash
cd deploy
tar -czf /tmp/deploy.tar.gz -C . .
scp /tmp/deploy.tar.gz gym:/tmp/
ssh gym 'tar -xzf /tmp/deploy.tar.gz -C /opt/gym && cd /opt/gym && docker compose build server && docker compose up -d server'
```

### 3. 跑集成测试

```bash
ssh gym 'bash /tmp/run-tests.sh'    # 会自动建 gym_test 库、重建镜像并跑 test/run.js
```

### 4. 小程序侧

1. 用微信开发者工具导入本目录（`project.config.json` 里已是正式 AppID）。
2. 小程序后台 → 开发管理 → 开发设置 → **服务器域名** → request 合法域名填 `https://gym.novrein.com`
   （必须是 HTTPS、不能带端口、不能用 IP；域名需已备案）。
3. 开发者工具里勾选「不校验合法域名」只用于本地调试，真机必须配好合法域名。
4. 初始化：店长打开「我的」页面点「初始化系统」，第一个点击的人成为管理员，
   系统自动写入示例卡种、娱乐项目和未来 3 天的团课。

### 5. 订阅消息（可选）

小程序后台「功能 → 订阅消息」选用三个模板后，把模板 ID 填到：

- 服务端 `/opt/gym/.env`：`WX_TPL_BOOKING_SUCCESS`、`WX_TPL_CLASS_REMINDER`、`WX_TPL_CARD_EXPIRE`（留空则不发送）
- 小程序 `miniprogram/config.local.js` 的 `templates`（用于向会员申请授权）

`WX_MP_STATE` 控制跳转的小程序版本：体验版 `trial`、正式版 `formal`、开发版 `developer`。

## 日常使用

- **办卡**：会员在前台付款 → 前台进入「会员与办卡」→ 用手机号搜索 → 点「办卡」→ 选择卡种，填写实收金额和收款方式。每笔收款都记在 `offline_payments` 表里，方便对账。
- **入场**：会员打开「出示入场码」→ 前台在工作台点「扫码核验入场」。
- **娱乐项目**：会员在线预约时段 → 到店付款 → 前台在「娱乐预约核销」里核销（只能核销当天的预约）。
- **上课**：教练或前台在「排课与签到」里打开课程 → 逐个签到或标记缺席。

## 本地测试

### 小程序静态自检（最快，不用开开发者工具）

```bash
node scripts/check.js
```

检查 22 个页面的：JSON 是否合法、**wxml 绑定的 157 个事件在 JS 里是否都存在**、
tabBar 图标文件是否缺失、wxml 引用的字段有没有拼错、小程序调的 49 个 action 后端是否都实现了。
改动小程序后建议先跑这个，能在打开开发者工具之前拦下大部分低级错误。

检查器本身有自测（确保它真的能抓到问题，而不是永远通过）：

```bash
node scripts/check.selftest.js
```

### 小程序自动化回归（模拟器里真跑）

用微信开发者工具的自动化接口驱动小程序，详见 [scripts/automator/README.md](scripts/automator/README.md)。
覆盖：真实 `wx.login` → 自建后端建档、订阅模板读取、8 个页面打开、点击预约、发友圈、
入场码生成 + 前台扫码核验扣次。

```bash
cd scripts/automator
$env:NODE_PATH = "$PWD\node_modules"
node regression.js      # 页面级
node interaction.js     # 交互级（真点按钮）
```

### 自建后端（当前）

两套测试，都在独立测试库上跑，不碰生产数据：

```bash
# 业务逻辑（55 项断言）
scp deploy/scripts/run-tests.sh gym:/tmp/ && ssh gym 'bash /tmp/run-tests.sh'

# HTTP 层端到端（20 项断言：登录、JSON 协议、上传、媒体、错误映射）
scp deploy/scripts/run-http-tests.sh gym:/tmp/ && ssh gym 'bash /tmp/run-http-tests.sh'
```

也可以本地直连测试库跑业务逻辑部分：

```bash
DATABASE_URL=postgres://postgres:pw@127.0.0.1:5432/gym_test node deploy/server/test/run.js
```

### 旧云开发后端

不需要微信环境，用内存数据库模拟云开发：

```bash
node test/run.js
```

## 服务器管理页

浏览器打开 **https://gym.novrein.com/admin**，用服务器 `.env` 里的 `ADMIN_PASSWORD` 登录。

能看到运行状态与业务数据，并且**切换上传文件的存储位置**：服务器数据库（默认）/
腾讯云 COS / 阿里云 OSS。点「测试连接」会真传一个探针文件再删掉，通过才算配好。

- 切换只影响新上传的文件，已存在的文件仍可通过原地址访问
- 云存储密钥加密后存库，页面不回显明文
- 没配 `ADMIN_PASSWORD` 时管理入口整体关闭

详见 [deploy/README.md](deploy/README.md#服务器管理页-admin)。

## 关键运维命令

```bash
ssh gym 'cd /opt/gym && docker compose ps'          # 容器状态
ssh gym 'cd /opt/gym && docker compose logs -f server'  # 实时日志
ssh gym 'cd /opt/gym && docker compose exec -T db psql -U postgres -d gym'  # 进数据库
curl -s https://gym.novrein.com/health              # 健康检查
```

数据库密码在 `/opt/gym/.env`（权限 600）。改密码要删卷重建：
`docker compose down -v` 会清空所有业务数据。

## 第一阶段没有做的

- 在线支付和退款（第二阶段接入微信支付）
- 闸机等硬件对接（目前由前台用手机扫码代替）
- 网页版管理后台、经营报表
- 挑战赛、成就徽章、积分商城
- 视频转码 / 对象存储（目前上传的文件存在 Postgres 的 `media` 表，单文件上限 12MB，视频建议后续接对象存储）
