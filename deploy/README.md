# 自建后端部署包

把业务从「微信云开发」迁到自己的服务器。**已完成全量迁移**：小程序调用的 49 个 action 全部由自建后端实现，
云函数版本保留在仓库 `cloudfunctions/` 目录用于回滚。

> **两个"备案"要分清**
>
> - **域名 ICP 备案**：自建后端必须。`novrein.com` 已完成。
> - **小程序备案**：小程序自己的备案（微信公众平台 → 设置 → 基本设置 → 小程序备案），
>   和域名备案是两件事，2023 年 9 月起新小程序发布前必须完成。**没做的话仍只能发体验版。**
>
> 另外：小程序 `request` 合法域名必须 HTTPS、不能带端口、不能用 IP。

## 当前生产环境

```
小程序
  → https://gym.novrein.com   (前置 nginx，内网 192.168.1.3，*.novrein.com 证书)
  → http://192.168.1.31:80    (docker: gym-server → 3000)
  → postgres:16               (docker: gym-db，卷 gym_pgdata)
```

| 项 | 值 |
| --- | --- |
| 主机 | `ssh gym`（`gym@192.168.1.31`，Ubuntu 24.04，4C/8G/292G） |
| 部署目录 | `/opt/gym` |
| 配置文件 | `/opt/gym/.env`（600，含 Postgres 密码与微信凭据） |
| 反向代理 | 由前置 nginx 负责，容器内 **caddy 不启动** |
| 健康检查 | `https://gym.novrein.com/health` → `{"ok":true}` |
| 定时任务 | 服务进程内每 15 分钟跑一次（等价云开发触发器），无需额外 cron |

因为前置 nginx 已经占用了 80/443 并签发证书，这里不用 Caddy：

```yaml
# docker-compose.override.yml
services:
  server:
    ports:
      - "0.0.0.0:80:3000"
```

## 软硬件要求

| 项 | 最低 | 说明 |
| --- | --- | --- |
| CPU / 内存 | 2 核 / 2 GB | 当前机器 4 核 8 GB，余量充足 |
| 磁盘 | 40 GB SSD | 数据库 + 上传的图片；视频建议后续接对象存储 |
| 系统 | Ubuntu 22.04 / 24.04 | 其他 Linux 也行，命令略有差异 |
| 软件 | Docker 24+ / Compose v2 | 服务器已装 Docker 29.1.3 + Compose 2.40.3 |

## 目录结构

```
deploy/
  docker-compose.yml            db + server（+ 可选的 caddy）
  docker-compose.override.yml   server 映射到宿主机 80，caddy 不启动
  Caddyfile                     备用：没有现成反代时由 Caddy 自动申请证书
  .env.example                  环境变量样例
  server/
    index.js                    HTTP 入口：登录、action 路由、上传、媒体、定时任务
    schema.sql                  PostgreSQL 表结构（幂等，启动时自动执行）
    lib/system.js               初始化与示例数据
    lib/member.js               资料、我的卡、积分、首页
    lib/booking.js              约课、娱乐预约、取消
    lib/entry.js                入场码生成与核验
    lib/admin.js                员工与管理员操作
    lib/fitness.js              身体/力量/运动数据、排行榜
    lib/moment.js               健身友圈、海报小程序码
    lib/cron.js                 定时任务
    lib/notify.js               订阅消息
    lib/templates.js            订阅消息模板映射
    lib/common.js / db.js       公共工具、行映射、连接池
    test/run.js                 集成测试（55 项断言）
  client-api-http.js            早期示例封装（已由 miniprogram/utils/api.js 取代）
  scripts/                      prepare.ps1 / setup-server.sh 等部署辅助脚本
```

## 环境变量（/opt/gym/.env）

| 变量 | 说明 |
| --- | --- |
| `DOMAIN` | 对外域名（仅 Caddy 方案使用） |
| `POSTGRES_PASSWORD` | 数据库密码，首次部署随机生成 |
| `WX_APPID` / `WX_SECRET` | 小程序 AppID / AppSecret（登录换 openid 用） |
| `WX_TPL_BOOKING_SUCCESS` | 预约成功通知模板 ID，留空则不发送 |
| `WX_TPL_CLASS_REMINDER` | 开课前提醒模板 ID |
| `WX_TPL_CARD_EXPIRE` | 会员卡到期提醒模板 ID |
| `WX_MP_STATE` | 跳转版本：`developer`（开发版）/ `trial`（体验版）/ `formal`（正式版） |
| `SHOP_ADDRESS` | 课前提醒里的「场地地址」 |
| `PUBLIC_BASE_URL` | 上传文件对外地址前缀，默认 `https://gym.novrein.com` |
| `DEV_LOGIN_TOKEN` | **仅测试用**：设置后可用 `code=dev:<openid>` + 请求头 `x-dev-token` 绕过微信登录。生产不要设置 |

> 这些变量必须在 `docker-compose.yml` 的 `server.environment` 里显式传递才会进入容器；
> 新增变量时记得同步改 compose 文件，否则容器里读不到（表现为「配置了但不起作用」）。

### 订阅消息字段名必须与模板一致

`server/lib/templates.js` 里的 keyword（`thing8`、`character_string5`、`time4` …）必须与
小程序后台模板里的字段名**逐字一致**，否则微信会返回 `47003 argument invalid`。

用这个接口核对自己模板的真实字段名：

```bash
# 需要 access_token，可用 scripts 里的方式取
curl "https://api.weixin.qq.com/wxaapi/newtmpl/gettemplate?access_token=<AT>"
```

当前三个模板的实际字段：

| 模板 | 字段 |
| --- | --- |
| 预约成功通知 | `thing8` 预约业务、`character_string5` 预约时段、`thing11` 预约人、`thing10` 预约地点 |
| 预约开始提醒 | `thing6` 预约人、`thing1` 温馨提醒、`thing2` 场地名称、`thing3` 场地地址、`time4` 开始时间 |
| 会员即将到期 | `thing1` 用户名、`thing2` 温馨提示、`thing6` 会员类型、`time3` 到期时间 |

类型规则：`thing` ≤20 字；`character_string` ≤32 位且不能含中文；`time` 必须是
`2026年11月13日 09:00` 这种格式（`common.js` 的 `wxTime` / `wxDate` 负责转换）。

改完 `.env` 需要 `docker compose up -d --force-recreate server` 让容器读到新值。

## 部署 / 更新

```bash
# 1. 打包上传（本地）
tar -czf /tmp/deploy.tar.gz -C deploy .
scp /tmp/deploy.tar.gz gym:/tmp/

# 2. 服务器上解压并重建
ssh gym 'tar -xzf /tmp/deploy.tar.gz -C /opt/gym && cd /opt/gym && docker compose build server && docker compose up -d server'
```

首次启动会自动建表（`schema.sql` 幂等执行）并写入管理员之外的示例数据（点「初始化系统」才写）。

### 跑测试

两套测试，都只在测试库上跑，**不会碰生产库**：

```bash
# 1. 业务逻辑集成测试（55 项断言，直连 gym_test 库）
scp deploy/scripts/run-tests.sh gym:/tmp/ && ssh gym 'bash /tmp/run-tests.sh'

# 2. HTTP 层端到端测试（20 项断言，真打 /api、/api/upload、/api/media）
scp deploy/scripts/run-http-tests.sh gym:/tmp/ && ssh gym 'bash /tmp/run-http-tests.sh'

# 3. 全 action 冒烟测试（50 个 action 用空参数各打一遍，确保没有 500）
scp deploy/scripts/run-smoke-tests.sh gym:/tmp/ && ssh gym 'bash /tmp/run-smoke-tests.sh'

# 4. 订阅消息链路验证（用真实凭据换 token，配假模板 ID 触发发送）
scp deploy/scripts/notify-drill.sh gym:/tmp/ && ssh gym 'bash /tmp/notify-drill.sh'

# 5. 真实图片上传/下载演练（字节级比对）
scp 某张照片.jpg gym:/tmp/real.jpg
scp deploy/scripts/upload-drill.sh gym:/tmp/ && ssh gym 'bash /tmp/upload-drill.sh /tmp/real.jpg'
```

第 4 项期望日志出现 `subscribeMessage.send failed ... 40003 invalid openid`：
说明 access_token 已拿到、请求体被微信接受、只是测试用的 openid 不是真实用户；
同时预约本身仍然成功，证明发送失败不影响业务。

HTTP 测试会临时起一个 `gym-http-test` 容器（不占生产端口、只连 `gym_http` 库），
通过 `DEV_LOGIN_TOKEN` 令牌绕过微信换取 openid。**生产环境不设置该变量时这条通道完全不生效**，
并且请求头令牌不匹配会被当成普通请求走微信校验。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查 |
| POST | `/api` | 业务入口：`{ action, data, code }` → `{ code, msg, data }` |
| POST | `/api/upload?ext=jpg&code=...` | 上传文件（请求体是二进制），返回 `{ fileID }` |
| GET | `/api/media/:id` | 读取上传的文件（长缓存） |

`code` 是小程序 `wx.login()` 拿到的登录凭证，服务端用它换 openid，5 分钟内复用。
上传支持 `jpg/jpeg/png/webp/gif/mp4/mov`，单文件上限 12 MB。

## 数据库

所有时间字段存 **epoch 毫秒**（bigint），业务日期存 `YYYY-MM-DD` 文本（北京时间），
与旧云开发返回给小程序的字段完全一致，所以小程序侧不需要改数据格式。

主要表：`members`、`card_types`、`member_cards`、`card_logs`、`offline_payments`、
`schedules`、`bookings`、`venues`、`venue_slots`、`entry_logs`、`points_logs`、
`body_records`、`strength_records`、`activity_records`、`moments`、`media`、`config`。

`schema.sql` 全部使用 `create table if not exists` / `alter table ... add column if not exists`，
可以重复执行，旧库升级时不会丢数据。

## 小程序侧切换

已完成，无需再改：

1. `miniprogram/utils/api.js` 改成 `wx.request` 调 `https://gym.novrein.com/api`，并带 `upload()`/`download()`。
2. 所有 `wx.cloud.uploadFile` / `getTempFileURL` / `downloadFile` 调用已替换。
3. `miniprogram/app.js` 不再 `wx.cloud.init`。
4. 旧实现保留在 `miniprogram/utils/api-cloud.js`，回滚时把页面的 `require('../../utils/api')` 指回它即可。

**还需要在微信后台做**：服务器域名里加 `https://gym.novrein.com`，否则真机请求会被拦截。

## 备份与恢复

```bash
# 手动备份（输出到 /opt/gym/backups，默认保留 14 份）
ssh gym 'bash /opt/gym/scripts/backup.sh'

# 恢复某个备份
ssh gym 'gunzip -c /opt/gym/backups/gym-XXXX.sql.gz | docker compose -f /opt/gym/docker-compose.yml exec -T db psql -U postgres -d gym'
```

### 每日自动备份

服务器**没有安装 cron**，用的是 systemd timer（不额外装包，且关机错过时间会在开机后补跑）：

```bash
# 查看是否在跑
ssh gym 'systemctl list-timers gym-backup.timer'

# 立即手动跑一次（便于验证）
ssh gym 'sudo systemctl start gym-backup.service && journalctl -u gym-backup.service -n 20'

# 查看历史
ssh gym 'journalctl -u gym-backup.service --since today'

# 关掉自动备份
ssh gym 'sudo systemctl disable --now gym-backup.timer'
```

当前配置：**北京时间每天 04:17**（`OnCalendar=*-*-* 04:17:00 Asia/Shanghai`，带最多 5 分钟随机延迟）。
服务器时钟是 UTC，所以实际触发时间在 UTC 20:17 左右 —— 定时器里写的是显式时区，不用手动换算。

单元文件在 `/etc/systemd/system/gym-backup.{service,timer}`，日志追加到 `/opt/gym/backups/cron.log`。

备份脚本会校验 gzip 完整性并自动清理旧文件，建议正式上线前确认定时器处于 `active` 状态。

## 服务器管理页 `/admin`

浏览器打开 `https://gym.novrein.com/admin`，用 `/opt/gym/.env` 里的 `ADMIN_PASSWORD` 登录。

页面能做的事：

| 区块 | 内容 |
| --- | --- |
| 系统状态 | 运行时长、内存、Node 版本、PID |
| 业务数据 | 会员数、有效卡、待上课预约、未开始课程、友圈动态、今日入场 |
| 运行配置 | AppID、AppSecret 是否就绪、跳转版本、订阅消息模板是否配置、最近一次定时任务结果 |
| 上传文件存储位置 | 查看/切换存储后端、填凭据、测试连接 |

### 切换上传文件的存储位置

支持三种后端，切换只影响**之后新上传**的文件：

| 驱动 | 需要填 | 说明 |
| --- | --- | --- |
| 服务器数据库（默认） | 对外访问地址 | 文件存 `media` 表，通过 `/api/media/<id>` 访问，单文件上限 12MB |
| 腾讯云 COS | SecretId、SecretKey、Bucket、Region，可选访问域名与路径前缀 | 建议用子账号密钥，只授予该桶的读写 |
| 阿里云 OSS | AccessKey ID、AccessKey Secret、Bucket、Region，可选访问域名与路径前缀 | 同上 |

点「测试连接」会真的上传一个几十字节的探针文件再删掉，通过才算配置可用；点「保存配置」才生效。

**注意几点**：

- 切换不会让已上传的文件失效。存进数据库的老文件仍由 `/api/media/<id>` 提供访问，
  新文件才写到新位置。
- 云存储的密钥用 AES-256-GCM 加密后存进 `config` 表，页面上只显示「已配置」，不回显明文。
  加密密钥来自 `.env` 的 `CONFIG_SECRET`，**换掉它会导致已保存的密钥无法解密**，需要重新填写。
- 小程序只认 https 地址。COS/OSS 需要配合自定义域名 + CDN，或直接用厂商默认域名
  （默认域名在微信里可能受限，正式用请绑自己的域名）。
- 存储桶权限建议设为「公有读私有写」，否则小程序里的图片打不开。

### 管理入口的安全

- 没配置 `ADMIN_PASSWORD` 时，`/admin` 与 `/api/admin/*` 全部关闭（返回 503）。
- 登录后拿到 12 小时有效的签名令牌，之后每个请求带 `x-admin-token`。
- 同一 IP 连续输错 8 次密码锁定 10 分钟。
- 管理接口的响应里永远不回显密钥明文。

### 功能开关

早期只有一部分功能会用上，所以每个模块都能单独隐藏。开关在管理页「功能开关」里，
**改完几秒内生效，不需要重新发布小程序**。

| 开关 | 隐藏后效果 |
| --- | --- |
| 会员卡 | 隐藏会员卡页与入场码入口；入场码接口返回「功能暂未开放」 |
| 团课与私教预约 | 隐藏「约课」tab；约课接口全部拦截 |
| 娱乐项目预约 | 隐藏「娱乐」tab；娱乐接口全部拦截 |
| 健身友圈 | 隐藏「友圈」tab；友圈接口全部拦截 |
| 健身数据 | 隐藏「我的身体数据」入口；相关接口拦截 |
| 力量排行榜 | 隐藏首页榜单与排行入口；排行榜接口拦截 |

工作方式：

- 服务端在 `/api` 路由里按 action 检查所属模块（见 `index.js` 的 `ACTION_FEATURE`），
  关闭后直接返回 `code=400`「『XX』功能暂未开放」，旧链接和缓存页面也绕不过去。
- 小程序用自定义 tabBar（`miniprogram/custom-tab-bar/`）按开关过滤 tab，
  首页与「我的」里的入口同步隐藏；被隐藏的页面直接访问会显示「暂未开放」占位。
- 开关状态存在 `config` 表的 `features` 键，服务端有 5 秒缓存；小程序每次打开首页会用
  `home` 返回值刷新一次。
- 默认全部开启。第一次用可以先关掉会员卡/团课/娱乐，只留友圈和资料。

## 上传文件的可见性

上传的图片和视频都是**公有读**（文件名为 20 字节随机串，不可枚举）：

- 存数据库时由 `/api/media/<id>` 提供，本身不带鉴权
- 切到 COS/OSS 后，上传时会显式设置 `public-read`（COS 用 `ACL`，OSS 用
  `x-oss-object-acl` 请求头），这样**所有会员都能看到彼此友圈里的照片和视频**

如果以后要做「仅本人可见」，需要改成签名 URL 方案，小程序侧也要跟着改。

## 首页布局

会员、教练、前台、管理员**各有一套首页布局**，在管理页「首页布局」里编排。

每个模块可以：

- **上下移动**（↑ ↓）调整在首页的位置
- **隐藏 / 显示**
- **删除**（每个角色至少保留一个模块）

可用的模块：

| 模块 | 说明 |
| --- | --- |
| 欢迎与积分 | 顶部问候语、积分 |
| 入场码按钮 | 出示二维码给前台扫码（独立成块，可以推到最上面） |
| 今日概况 | 入场人次/课程预约/娱乐预约/会员总数（员工可见） |
| 快捷入口 | 约团课、娱乐预约、排行榜、友圈的宫格 |
| 排行榜预览 | 排行榜前 5 名 + 我的名次 |
| 我的会员卡 | 会员卡列表与剩余次数 |
| 今日预约 | 今天要上的课与娱乐预约 |
| 竞赛预览 | 进行中的竞赛与我的名次 |
| 友圈预览 | 最新 3 条动态（含缩略图） |
| 自定义快捷入口 | 指向任意页面的一张卡片（图标 + 标题 + 说明） |

### 把页面放到更快捷的位置

「自定义快捷入口」可以把任意一个页面做成首页上的卡片：

1. 选页面上要显示的地方（标题、说明、emoji 图标）
2. 从下拉里挑目标页面（共 16 个可选页面）
3. 点「新增快捷入口」，再用 ↑ 把它推到第一位
4. 点「保存布局」

比如把「快速约课」「我的竞赛」「员工工作台」放到首页第一屏。

工作方式：

- 布局存在 `config` 表的 `layout` 键，按角色存数组，服务端有 5 秒缓存
- `home` 接口直接返回当前登录角色生效的模块（已过滤隐藏项），首页按顺序渲染
- 布局改动**不用重新发布小程序**，下次进首页就生效
- 目标页面是 tabBar 页时自动用 `switchTab`，其它用 `navigateTo`

## 常见问题

| 现象 | 原因 |
| --- | --- |
| `/api` 返回 `登录失败：invalid appid` | `.env` 里 AppID/AppSecret 不对，或改完没重建容器 |
| `/api` 返回 `登录失败：invalid code` | 正常，说明服务端确实去微信换 openid 了（用假 code 测试时会看到） |
| 小程序报「不在合法域名列表」 | 后台服务器域名没配，或用了 http/端口/IP |
| 上传失败 | 文件超过 12MB，或扩展名不在白名单 |
| `/api` 返回 500 | `docker compose logs server`，多半是数据库连接问题 |
| 改了数据库密码连不上 | `pgdata` 卷已初始化，改密码要删卷重建：`docker compose down -v`（**会清空数据**） |
| 容器起不来，日志报 `column ... does not exist` | `schema.sql` 与旧库不兼容，需要补 `alter table` 或重建库 |
