# 壁纸集 · 开源在线壁纸分享站

一个可自托管的在线壁纸分享网站，支持分类 / 标签 / 图片元信息自动提取 / 原图下载，后台可自由切换图片存储源：**本机磁盘**、**S3 兼容存储**、**Cloudflare R2（支持账号池轮询）**。

## 功能特性

**前台**
- 响应式瀑布流画廊（1 / 2 / 3 / 4 列自适应），骨架屏 + 无限滚动
- 图片详情页：分辨率、文件大小、格式、方向、分类、标签、浏览/下载次数、相关推荐（相似壁纸 + 同分类/同色系兜底）
- 大图查看器：滚轮以光标为锚点缩放（1x ~ 6x，放大后可拖拽移动、双击放大/还原）、左右切换、ESC 关闭、键盘方向键；点击图片外的空白区域不会关闭（只有 ✕ / ESC 会关闭）
- 按分类 / 标签 / 方向 / 排序筛选，支持关键词搜索、随机壁纸
- 全文搜索：SQLite FTS5（trigram）子串匹配，中英文关键词都能搜，搜索框带联想建议（`/api/search/suggest`）
- 原图下载（服务端以 `attachment` 附件流式返回，保留原始文件名，兼容中文名）
- 多尺寸预览图：上传时生成 1280 / 1920 / 2560 三档 WebP，`<img srcset>` 按屏幕自动选档；游客只拿 ≤1920 预览，原图仍仅授权用户可下载
- SEO：详情页分享卡片元信息（og:image 等，服务端注入 `/image/:id`）、`sitemap.xml`、`robots.txt`
- 以图搜图：上传一张图，按图像指纹（dHash）匹配返回视觉相似的已发布壁纸
- 壁纸详情页举报：登录后可举报（选择原因 + 补充说明），进入后台统一审核
- 深色模式（跟随系统 + 手动切换）
- 用户体系：注册 / 登录（注册支持邮箱验证码 / 图形验证码 / 邀请码，可开关）、忘记密码 / 找回密码、个人主页（作品 + 收藏）、我的收藏（支持合集分组）、上传壁纸、个人资料与头像、修改密码

**后台**
- 账号密码登录（JWT），按用户组权限动态显示菜单，越权访问会被拒绝
- 发布壁纸（前台 `/upload` 与后台 `/admin/upload` 共用同一套卡片流界面）：整窗拖拽 / 多选 / **Ctrl + V 粘贴上传**，缩略图即时成卡片、**单文件真实进度条**；**分类为必填**（未选择时无法发布），每张可单独填写标题与描述，支持**拖拽排序**与一键**设为首图**（首图即封面）；悬浮发布条汇总总数与待发布数量，上传后自动展示提取到的尺寸与体积
- 壁纸管理：搜索 / 筛选 / 分页 / 批量编辑（标题、描述、分类、标签、状态）、删除（先移入回收站）
- 回收站：删除的壁纸进入回收站，可恢复或彻底删除，定期自动清理过期项
- 重复壁纸：按图像指纹（dHash）分组列出存量重复项，支持批量清理
- 内容审核：待审队列，可单张或批量「通过 / 驳回」，驳回需填写原因（展示给创作者）；拥有「上传免审」权限的用户上传后直接发布；审核结果（通过 / 驳回）可邮件通知创作者（需已配置 SMTP）
- 用户管理：查看用户列表、调整用户组、封禁 / 解封账号、删除账号
- 用户组权限：可视化权限矩阵，为「游客 / 会员 / 编辑 / 版主 / 管理员」勾选可用的功能（管理员组锁定为全权限）
- 分类管理：支持一级 / 二级（最多两级），可勾选「置顶到顶部栏」（顶部导航平铺一级分类，二级悬停下拉）、「主页显示」（首页按分类生成分区）与「加入全部壁纸」（关闭后该分类及下级的图片不出现在 /wallpapers 聚合列表）；每个一级分类可选「显示样式」——PC 宽高自适应 / 手机竖图适配，样式同步到首页分区与分类页且其下二级分类自动跟随；标签管理（同名标签自动复用，不会产生重复项）
- 维护任务：后台手动触发 + 定时调度（数据库备份、孤儿文件清理、缩略图 / 主色 / 指纹回填等），可查看执行历史
- 操作日志：记录后台关键操作（含失败），可按时间 / 操作类型查看
- 搜索词统计：落库用户搜索词与命中数，后台据此维护热门搜索词
- 数据仪表盘：近 30 天下载 / 浏览 / 注册趋势折线图（按天累计，注册数按 `users.created_at` 统计）
- 举报管理：前台举报集中待处理，可「下架」（同步隐藏被举报壁纸）或「忽略」
- 存储设置：本机 / S3 单套上传设置 / Cloudflare R2 多账号池，含连接测试与分配策略（仅 R2）
- 站点设置：标题、描述、页脚补充说明、ICP 备案号；修改管理员密码；**用户注册**（开启开关 + 注册验证码「无需 / 邮箱 / 图形」三选 + 邀请码「无需 / 选填 / 强制」三选）；**下载设置**（登录后下载 + 游客下载图形验证码 + 游客每日下载次数限制）；**邮箱设置**（SMTP 服务器，用于发送注册验证码，含连接测试与发送测试邮件）
- 邀请码管理：单个自定义邀请码 + 批量生成（可设使用次数上限 / 有效期 / 备注），支持删除与点击复制，注册时按邀请码模式校验
- 外观管理：首页 Banner（满屏宽、自定义背景图 + 铺满 / 拉伸 / 自适应三种布局、高度、文字遮罩、搜索框与热门标签开关，带实时预览）与页脚（宣传语 + 栏目、栏目内链接及「所有人 / 仅登录 / 仅游客 / 仅管理员」可见性、说明文字）；以及网站 Logo（自定义上传图标，大小自适应，未设置时前台显示站点标题）

**图片元信息自动提取**（上传时自动完成，无需手动填写）
- 宽 × 高（用于瀑布流占位，避免布局跳动）
- 文件体积（字节数 + 人类可读文本）
- 真实图片格式（以文件内容判定，不信任扩展名）
- 自动生成 WebP 缩略图（最长边 720px），列表页用缩略图、下载用原图
- 自动生成多尺寸预览图（1280 / 1920 / 2560 三档 WebP，存于 `images.variants`），供前台 `srcset` 按屏幕分辨率选档

## 用户组与权限

采用「用户组 → 权限」两层模型：每个账号属于一个用户组，后台的每个接口按所需权限点单独校验；登录态返回的 `permissions` 供前端控制菜单与按钮显隐。

**用户组**

| 用户组 | 说明 | 默认权限 |
| --- | --- | --- |
| 游客 `guest` | 未登录访客（不是账号） | 下载壁纸 |
| 会员 `member` | 注册用户 | 下载、收藏、上传 |
| 编辑 `editor` | 内容运营 | 上述 + 上传免审、审核壁纸、管理壁纸、管理分类标签 |
| 版主 `moderator` | 社区管理 | 上述（不含分类标签）+ 管理用户 |
| 管理员 `admin` | 拥有全部权限，**不可修改** | 全部 |

**权限点**

`下载壁纸` / `收藏壁纸` / `上传壁纸` / `上传免审` / `审核壁纸` / `管理壁纸` / `管理分类标签` / `管理用户` / `编辑用户组权限` / `站点与存储设置`

- 权限矩阵持久化在 `settings` 表的 `role_permissions` 键下，进程内带缓存，保存后立即对所有账号生效；
- 角色与状态**每次请求都以数据库为准**，因此调整用户组或封禁账号无需重新登录即可生效；
- 进入后台只需要拥有任意一项管理类权限（审核 / 管理壁纸 / 管理分类标签 / 管理用户 / 编辑用户组权限 / 站点与存储设置）。

**发布审核**

- 用户上传时不具备「上传免审」权限 → 壁纸以 `待审核` 入库，前台完全不可见（列表、详情、下载均不可访问）；
- 具备「上传免审」权限 → 直接以 `已发布` 入库；
- 审核员在「内容审核」页通过 → `已发布`，驳回 → `已驳回`。

壁纸状态：`0 已隐藏` / `1 已发布` / `2 待审核` / `3 已驳回`。

> 站点存在管理员时，新注册用户一律进入「会员」组；只有站点还没有任何管理员时，第一个注册用户才会自动成为管理员。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 后端 | Node.js + Fastify 5 |
| 数据库 | SQLite（Node 内置 `node:sqlite`，**零原生依赖**） |
| 图片处理 | `image-size` 读尺寸 + `sharp` 生成缩略图（可选依赖，缺失自动降级） |
| 对象存储 | `@aws-sdk/client-s3`（S3 / R2 通用） |
| 前端 | React 18 + Vite 5 + React Router 6 + Tailwind CSS 4 |
| 鉴权 | JWT（`@fastify/jwt`）+ scrypt 密码哈希 |
| 邮件 | `nodemailer`（注册邮箱验证码，可选，未配置时邮箱验证码模式不可用） |

> 要求 Node.js ≥ 22.5（`node:sqlite` 需要）。在 Node 24 上验证通过。

## 快速开始

```bash
# 1. 安装依赖（npm workspaces，一次装好前后端）
npm install

# 2. 准备环境变量
cp .env.example .env      # Windows: copy .env.example .env
# 至少修改 JWT_SECRET 与 ADMIN_PASSWORD

# 3. 开发模式（同时起后端 8080 与前端 5173，前端已配好 /api 代理）
npm run dev
```

开发模式访问 **http://localhost:5173**，登录后台用 `.env` 里的 `ADMIN_USERNAME` / `ADMIN_PASSWORD`。

### 生产部署

```bash
npm run build     # 构建前端到 web/dist
npm start         # 启动后端，自动托管 web/dist 与 /api，单端口 8080
```

后端会检测 `web/dist` 是否存在：存在则直接托管前端并对前端路由做 SPA 回退，不存在则只提供 API。

## 目录结构

```
.
├── server/                     # 后端
│   └── src/
│       ├── index.js            # 入口：初始化数据库 → 启动服务
│       ├── app.js              # Fastify 实例、插件、错误处理、SPA 托管
│       ├── config.js           # 环境变量与路径解析
│       ├── db.js               # SQLite 连接与查询辅助
│       ├── migrate.js          # 建表 + 默认设置 / 默认分类
│       ├── seed.js             # 首次启动创建管理员
│       ├── lib/                # 通用工具（错误、哈希、slug）
│       ├── services/
│       │   ├── settings.js     # 站点 / 存储 / 外观（首页 Banner + 页脚）配置读写
│       │   ├── roles.js        # 用户组与权限矩阵（含默认值、缓存、校验）
│       │   ├── users.js        # 用户查询、序列化、后台用户管理
│       │   ├── images.js       # 壁纸查询、序列化、增删改、审核状态
│       │   ├── media.js        # 尺寸/格式提取、缩略图、字节格式化
│       │   └── storage/        # 存储抽象层
│       │       ├── index.js    # 统一出口 + 账号池 + 公开地址解析
│       │       ├── local.js    # 本机磁盘
│       │       └── remote.js   # S3 / R2 单账号适配器
│       └── routes/             # public / auth / admin / storage / upload / files
└── web/                        # 前端（React + Vite + Tailwind）
    └── src/
        ├── components/         # 画廊、卡片、Lightbox、导航…
        └── pages/              # 前台页面 + pages/admin 后台页面
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | 服务端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `PUBLIC_BASE_URL` | `http://localhost:8080` | **对外访问地址**，用于拼接本机存储图片的绝对地址，生产环境务必改成你的域名 |
| `JWT_SECRET` | — | JWT 签名密钥，部署前必须改成随机串 |
| `ADMIN_USERNAME` | `admin` | 初始管理员用户名（仅首次启动、库中无管理员时创建） |
| `ADMIN_PASSWORD` | `admin123` | 初始管理员密码 |
| `DB_FILE` | `data/app.db` | SQLite 文件路径（相对 `server/`） |
| `LOCAL_STORAGE_DIR` | `data/uploads` | 本机图片目录（相对 `server/`） |
| `LOCAL_PUBLIC_URL` | `/uploads` | 本机图片的公开访问前缀 |
| `STORAGE_DRIVER` | `local` | 初始存储驱动：`local` / `s3` / `r2`（后台可改） |
| `STORAGE_STRATEGY` | `round_robin` | 初始账号分配策略（后台可改） |

> `DB_FILE`、`LOCAL_STORAGE_DIR` 支持相对路径（相对 `server/` 目录）与绝对路径。
> 数据库、本机图片、`web/dist` 都已加入 `.gitignore`。

## 存储源说明

后台 **存储设置** 页可随时切换驱动，切换后立即生效（无需重启）。

### 本机存储（默认）

图片写入 `LOCAL_STORAGE_DIR`，通过内置静态路由对外提供访问：
- 固定提供 `/uploads/*`；
- 同时按设置里的「公开 URL」路径再注册一个别名。

「公开 URL」填相对路径（如 `/uploads`）时，输出地址 = `PUBLIC_BASE_URL` + 路径；填完整 URL（如 `https://cdn.example.com/wallpaper`）时直接使用。**修改公开访问路径需要重启服务**才会注册新的别名路由。

### S3 兼容存储（单套上传设置）

选择「S3 兼容存储」后，只需要填写**一套**上传设置（AWS S3 / MinIO / 七牛等通用）：

| 字段 | 说明 |
| --- | --- |
| Endpoint | 服务地址，如 `https://s3.us-east-1.amazonaws.com`、`https://minio.example.com` |
| Region | 区域，默认 `us-east-1` |
| Bucket | 桶名 |
| Access Key ID / Secret Access Key | 访问密钥（已保存后留空表示不修改） |
| 公开访问 URL | 可选。填自定义 CDN 域名，留空则按 Endpoint + Bucket 拼接 |
| Path Style | MinIO 等自建服务通常需要勾选 |

该模式**没有分配策略**：所有图片都写入这一套配置，`storage_account_id` 记录为这条 S3 配置的 id。

> 后端会阻止在「S3 上传设置」未填写完整（缺 Endpoint / Access Key ID / Bucket）时切换到 S3 存储。

### Cloudflare R2 账号池（多账号）

选择「Cloudflare R2」后，可添加任意数量的 R2 账号，构成一个**账号池**，这是唯一支持分配策略的驱动：

- 上传时按策略挑选账号，并把 `storage_account_id` 记录到壁纸上；
- 读取 / 删除时按记录找到对应账号操作，因此**中途增删账号不会导致老图片失效**；
- 首选账号上传失败会自动切换到池中其他账号重试，全部失败才报错；
- 每个账号的 `used_count` 会随上传累加，便于观察负载分布。

**分配策略**

| 策略 | 说明 |
| --- | --- |
| 轮询 `round_robin` | 按权重轮流使用各账号，权重越高被选中概率越大（默认，最均衡） |
| 随机 `random` | 按权重随机挑选 |
| 最少使用 `least_used` | 总是选择已用次数最少的账号，适合容量/额度不均衡的场景 |

> 启用中的 R2 账号少于 2 个时，策略按钮不可点击 —— 单个账号没有可分配的对象。

**Cloudflare R2 配置步骤**

1. Cloudflare Dashboard → R2 → 创建 Bucket（例如 `wallpapers`）。
2. R2 → Manage R2 API Tokens → 创建 Token（权限选 Object Read & Write），拿到 `Access Key ID` 与 `Secret Access Key`。
3. 在后台「存储设置 → 添加账号」填写：
   - **名称**：随意，例如「R2 主账号」
   - **Account ID**：R2 概览页右侧的 Account ID。**Endpoint 留空即可**，后端会自动推导为 `https://<AccountID>.r2.cloudflarestorage.com`
   - **Access Key ID / Secret Access Key**：第 2 步拿到的密钥
   - **Bucket**：第 1 步创建的桶名
   - **Region**：`auto`
   - **公开访问域名**：**强烈建议填写**。填 R2 的自定义域名（如 `https://img.example.com`）或 R2 分配的公网域名。不填则回退到 Endpoint 直链，而 Endpoint 直链是私有地址、浏览器无法直接访问图片。
   - **权重**：参与轮询/随机的权重，默认 1
4. 点「测试连接」验证（会真实执行一次列桶 + 写入 + 删除探针对象）。
5. 重复 3–4 添加更多账号，再把顶部驱动切到「Cloudflare R2」。

> 后端会阻止切换到「账号池为空」的 R2，避免进入所有上传都失败的状态。
> 已被壁纸引用的账号不允许直接删除，需先迁移或删除这些壁纸。

## API 一览

公开接口（无需鉴权）：

```
GET  /api/site                      站点信息
GET  /api/categories                分类列表（含壁纸数量）
GET  /api/tags                      标签列表（含壁纸数量）
GET  /api/images                    壁纸分页列表（仅已发布）
       ?page&pageSize&category=<slug>&tag=<slug>&q&orientation=landscape|portrait|square&sort=latest|popular|downloads
GET  /api/images/random?count=1     随机壁纸
GET  /api/images/:id                壁纸详情（累加浏览量，仅已发布）
GET  /api/images/:id/related        相关推荐（相似壁纸 + 同分类/同色系兜底）
GET  /api/images/:id/download       下载原图（附件响应，累加下载量；按用户组「下载壁纸」权限校验；开启「登录后下载」时未登录 401，游客可叠加图形验证码与每日次数限制）
GET  /api/search/suggest            搜索联想建议（FTS5 子串匹配）
POST /api/search/by-image           以图搜图（multipart/form-data 上传图片，任选字段名，按 dHash 返回相似壁纸）
GET  /api/health                    健康检查（返回 DB / 存储探活状态）

GET  /robots.txt                    搜索引擎抓取规则（含 sitemap 指引）
GET  /sitemap.xml                   站点地图（首页 + 分类页 + 详情页）
GET  /image/:id                     分享落地页（服务端注入 og:image 等元信息）

POST /api/auth/register             注册（用户名 / 密码 / 昵称 / 可选 email / code / inviteCode / captchaId / captchaCode，按站点配置校验）
POST /api/auth/send-code            发送注册邮箱验证码 { email }（60s 冷却，需已配置 SMTP）
GET  /api/auth/captcha              获取注册 / 下载用图形验证码 { id, svg }
POST /api/auth/login                登录
GET  /api/auth/me                   当前登录用户（含 permissions / backoffice）
POST /api/auth/forgot-password      忘记密码 { email }（防枚举，无论是否存在都返回 ok，已配置 SMTP 才发信）
POST /api/auth/reset-password       重置密码 { token, password }（token 15 分钟有效、一次性）
```

登录用户接口（需请求头 `Authorization: Bearer <token>`，按用户组权限校验）：

```
PUT  /api/auth/profile              修改昵称与简介
PUT  /api/auth/password             修改密码
POST /api/auth/avatar               上传头像（multipart/form-data）

POST /api/upload                    上传壁纸（multipart/form-data，字段 files，必填 categoryId）
                                    可选 tagIds/title/description；未传 categoryId 返回 400「请选择分类后再发布」
                                    title / description 支持逐张填写：单张请求时传普通字符串；
                                    一次多图时传数组，按下标与 files 一一对应（某张不传则回退文件名）
                                    无「上传免审」权限时以「待审核」入库，响应中 pending 为 true

GET  /api/favorites                 我的收藏（分页，?collection=none|合集id 按合集筛选）
POST /api/favorites/:imageId        收藏（可传 collectionId 收藏进指定合集）
POST /api/favorites/:imageId/move   移动收藏 { collectionId }（0 / 空表示取消分组）
DEL  /api/favorites/:imageId        取消收藏
GET  /api/favorites/collections     合集列表（含壁纸数量）
POST /api/favorites/collections     新建合集 { name }
PUT  /api/favorites/collections/:id 重命名合集 { name }
DEL  /api/favorites/collections/:id 删除合集（其中收藏回到未分组）
POST /api/images/:id/report         举报壁纸 { reason, detail }（需登录）
```

后台接口（需请求头 `Authorization: Bearer <token>`，各接口按所需权限点校验）：

```
POST   /api/admin/login                       后台登录（需具备后台权限）
GET    /api/admin/me                          当前用户（含权限）
GET    /api/admin/stats                       统计概览（任意后台权限）
GET    /api/admin/stats-trend                 近 N 天下载 / 浏览 / 注册趋势 ?days=30（任意后台权限）
GET    /api/admin/overview                    分类 / 标签数量（任意后台权限）

GET    /api/admin/images                      壁纸列表（可含未发布项，带上传者）
GET    /api/admin/images/:id                  单张壁纸
PATCH  /api/admin/images/:id                  编辑（标题/描述/分类/标签/状态/驳回原因）
DELETE /api/admin/images/:id                  删除（移入回收站，软删除）
POST   /api/admin/images/batch-delete         批量删除（移入回收站）
POST   /api/admin/images/batch-update         批量编辑（分类/状态等）
GET    /api/admin/images/trash                回收站列表
POST   /api/admin/images/restore              恢复回收站壁纸 { ids: [] }
POST   /api/admin/images/purge                彻底删除并清除存储文件 { ids: [] }
GET    /api/admin/images/duplicates           重复壁纸分组（按 dHash，threshold/limit）

GET    /api/admin/audit                       审核队列 ?status=2|3&q&page&pageSize
POST   /api/admin/audit/approve               审核通过 { ids: [] }
POST   /api/admin/audit/reject                审核驳回 { ids: [], reason }（reason 必填）

GET    /api/admin/reports                      举报列表 ?status=0|1|2&page&pageSize
POST   /api/admin/reports/:id/action           处理举报 { status: 1 下架 / 2 忽略 / 0 恢复待处理 }

GET    /api/admin/users                       用户列表 ?q&role&status&page&pageSize
PATCH  /api/admin/users/:id/role              调整用户组 { role }
PATCH  /api/admin/users/:id/status            封禁 / 解封 { status: 0|1 }
DELETE /api/admin/users/:id                   删除用户

GET    /api/admin/roles                       用户组与权限矩阵
PUT    /api/admin/roles                       保存权限矩阵 { member: { upload: true, ... }, ... }

GET    /api/admin/categories                  分类列表（含层级、顶部栏 / 主页 / 全部壁纸开关、聚合壁纸数）
POST   /api/admin/categories                  新建分类（可传 parentId / showInNav / showOnHome / showInAll）
PATCH  /api/admin/categories/:id              编辑分类（同上字段）
DELETE /api/admin/categories/:id              删除分类（有二级分类时禁止删除，无则解除壁纸关联）

GET    /api/admin/tags                        标签列表
POST   /api/admin/tags                        新建标签（同名复用）
PATCH  /api/admin/tags/:id                    编辑标签
DELETE /api/admin/tags/:id                    删除标签

GET    /api/admin/storage/config              读取存储配置（driver / strategy / 本机目录）
PUT    /api/admin/storage/config              保存存储配置（切驱动时校验前置条件）
GET    /api/admin/storage/s3                  读取 S3 单套上传设置
PUT    /api/admin/storage/s3                  保存 S3 单套上传设置（首次必须填 Secret）
POST   /api/admin/storage/s3/test             测试 S3 单套上传设置
GET    /api/admin/storage/accounts            R2 账号池列表（密钥打码）
POST   /api/admin/storage/accounts            新增 R2 账号
PATCH  /api/admin/storage/accounts/:id        编辑 R2 账号（密钥留空表示不改）
DELETE /api/admin/storage/accounts/:id        删除 R2 账号
POST   /api/admin/storage/accounts/:id/test   测试 R2 账号连接
POST   /api/admin/storage/test                入库前测试一个 R2 账号配置

GET    /api/admin/site                        站点设置
PUT    /api/admin/site                        保存站点设置

GET    /api/admin/email                       邮箱（SMTP）设置
PUT    /api/admin/email                       保存邮箱设置
POST   /api/admin/email/test                  发送测试邮件

GET    /api/admin/invite-codes                邀请码列表
POST   /api/admin/invite-codes                新建单个邀请码 { code/maxUses/expiresAt/note }
POST   /api/admin/invite-codes/batch          批量生成邀请码 { count≤200/maxUses/expiresAt/note }
DELETE /api/admin/invite-codes/:id            删除邀请码

GET    /api/admin/appearance                  读取外观设置（Banner + 页脚）
PUT    /api/admin/appearance                  保存外观设置
GET    /api/admin/appearance/footer-defaults  页脚默认栏目（供「恢复默认」使用）
POST   /api/admin/appearance/banner           上传 Banner 背景图（存本机 uploads/banners/）
POST   /api/admin/appearance/logo             上传站点 Logo（存本机 uploads/logo/）

GET    /api/admin/tasks                       维护任务列表及上次执行状态
GET    /api/admin/task-runs                   任务执行历史 ?task&page&pageSize
POST   /api/admin/tasks/:key/run              手动触发某个维护任务

GET    /api/admin/audit-logs                  操作日志 ?action&q&page&pageSize

GET    /api/admin/search-settings             热门搜索词配置
PUT    /api/admin/search-settings             保存热门搜索词
GET    /api/admin/search-terms                用户搜索词统计（按命中数排序）
```

权限不足时返回 `403 { "error": "当前账号没有该操作权限" }`，账号被封禁返回 `403 { "error": "账号已被封禁，请联系管理员" }`。

错误响应统一为 `{ "error": "可读的中文提示" }`。

## 注意事项

- **首次启动**会自动建库、写入 6 个默认分类（风景 / 动漫 / 游戏 / 动物 / 极简 / 抽象），并按 `.env` 创建管理员账号。登录后请立即在「站点设置」里修改密码。
- **权限**：后台接口按「用户组 → 权限」逐接口校验，默认只有管理员拥有全部权限。请在「用户组权限」页按需给编辑 / 版主开放能力；仍建议不要把后台暴露在公网而不做额外防护。
- **账号安全**：站点至少需保留一名启用状态的管理员，因此不能删除 / 封禁最后一个管理员，也不能修改自己的用户组。
- **分类两级**：分类最多两级（一级 `parent_id` 为空，二级挂在某个一级下）。壁纸只能挂到「叶子分类」；一级分类下有二级时仅作为入口页，聚合其下全部二级分类的壁纸（筛选一级 slug 也会返回其下二级的壁纸）。顶部导航只平铺勾选「置顶到顶部栏」的一级分类，其二级收进悬停下拉；勾选「主页显示」的分类会在首页生成分区。老库升级时会自动给一级分类打开「置顶到顶部栏」，避免导航栏变空。
- **显示样式**：一级分类的「显示样式」存在 `categories.display_style`（`pc` / `mobile`）。`pc` 为宽高自适应网格（首页分区 4:3、分类页同款），`mobile` 为竖图适配（卡片 9:16、列数更密），两者都会同步到首页分区与分类页；二级分类的样式始终跟随其一级分类（写入时忽略自身取值，一级改样式时级联更新其二级）。
- **加入全部壁纸**：分类的开关存在 `categories.show_in_all`。关闭后，该分类（含其下二级分类）的图片会从 `/wallpapers` 等聚合列表里隐藏，但该分类自己的页面（`/category/<slug>`）仍完整可见；图片挂在二级分类时，若其一级分类也关闭了该开关，同样会被隐藏。老库升级时默认全部开启（`show_in_all = 1`）。
- **回收站**：删除壁纸是软删除（写 `images.deleted_at`），先进入后台「回收站」，可恢复或彻底删除；定时任务会清理过期的回收站项。
- **缩略图**：`sharp` 放在 `optionalDependencies` 里，装不上也能正常运行，只是不生成缩略图（列表页会退回使用原图，注意流量）。
- **多账号存储与缩略图**：缩略图会固定写入原图所在的存储账号（不参与账号池轮询），因为图片地址是按原图账号解析的；若缩略图上传失败则不写入 `thumb_key`，列表页自动退回使用原图，不会出现 404。
- **上传限制**：单文件 100MB、单次请求 50 个文件（`server/src/config.js` 可调）。
- **反向代理**：服务端已开启 `trustProxy`，放在 Nginx 后面时记得透传 `X-Forwarded-*`。
- **数据备份**：备份 `server/data/`（SQLite 数据库 + 本机图片）即可；用对象存储时壁纸文件在云端，本地只需备份数据库。

## 更新记录

**新增功能**

- 多尺寸预览图（1280 / 1920 / 2560 三档 WebP + 前台 `srcset`）
- 回收站（软删除 + 恢复 / 彻底删除 + 定时清理）
- 详情页相关推荐（相似壁纸 + 同分类 / 同色系兜底）
- 全文搜索（FTS5 trigram）+ 搜索联想建议 + 搜索词落库统计
- 后台重复壁纸管理（按 dHash 分组、批量清理）
- 审核驳回原因（`images.reject_reason`，驳回必填、创作者可见）
- SEO（`/image/:id` og 标签 + `sitemap.xml` + `robots.txt`）
- 运维（`/uploads` 长缓存、日志按天轮转、`/api/health` 健康检查）
- 下载限流（防盗链需在 CDN/Cloudflare 侧配置，纯代码无法拦截公开桶直链）
- 维护任务（手动 + 定时调度）与操作日志
- 分类管理「加入全部壁纸」开关
- 用户注册开关 + 注册验证码（无需 / 邮箱 / 图形）+ 邀请码模式（无需 / 选填 / 强制）
- 邀请码管理（自定义 + 批量生成，含使用次数与有效期）
- 邮箱 SMTP 设置（注册邮箱验证码发送，含连接测试）
- 下载设置扩展（游客下载图形验证码 + 游客每日下载次数限制）
- 邮件模板美化（注册验证码 / 测试邮件统一 HTML 模板，内联样式兼容主流邮箱）
- 忘记密码 / 找回密码（SMTP 发送重置链接，15 分钟一次性 token）
- 审核结果邮件通知创作者（通过 / 驳回）
- 以图搜图（上传一张图按 dHash 返回相似壁纸）
- 后台数据仪表盘（近 30 天下载 / 浏览 / 注册趋势折线图）
- 用户合集（收藏夹分组：新建 / 重命名 / 删除 + 移入合集）
- 壁纸详情页举报 + 后台举报审核（下架 / 忽略）
- 后台导航折叠分组（壁纸管理 / 分类与标签 / 系统设置收进二级菜单，默认收起）
- 详情页举报按钮醒目化（玫红色胶囊按钮）
- 后台外观管理「网站图标」：自定义上传 Logo（大小自适应，未设置时前台显示站点标题）
- 收藏时选择加入「默认收藏」或某个自建合集

**已修复问题**（仅记录问题所在）

- 后台表情包上传一直卡在 100%
- 壁纸详情页图片偏小（游客预览实际取到的是 720px 缩略图，非预览大图）
- PC 端整体布局过宽，挤压两侧与底部内容
- 图包详情页大图模式左右切换未切到同套图的其他图片
- 后台「外观管理」侧边栏二级菜单无法折叠，两个子项一直展开
- 页脚管理删除栏目后前台未同步（仍回显默认栏目）
- 后台邮件设置发送测试邮件时，未单独指定收件人导致发到了 SMTP 账号（而非发件邮箱）
- 后台「测试收件邮箱」输入框占位文字回显了已配置的邮箱（开源截图会暴露账号邮箱）
- 顶部一级分类过多时溢出、盖住右侧搜索框（中部分类栏绝对定位居中脱离文档流）
- 详情页返回按钮布局别扭（顶部栏三块内容挤一行且会换行错位，改为图片左上角悬浮返回图标）
- 详情页举报按钮未居中（inline 元素上的 mx-auto 不生效）
- 「我的收藏」接口 500（查询引用了分类别名 c2，但 SQL 漏掉了 LEFT JOIN categories）
- 收藏后重新进入详情页仍显示「收藏壁纸」（详情接口未携带登录态，favorited 恒为 false）
- 管理合集弹窗新建合集后未自动关闭

## License

MIT
