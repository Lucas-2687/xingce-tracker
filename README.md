# 行测轨迹 · Xingce Tracker

面向个人备考的行测成绩分析工具，支持仿真模拟、模块练习、趋势分析、跨设备同步与 JSON / CSV 导入导出。

技术栈：Next.js、React、TypeScript、Turso libSQL。支持部署到自己的 Vercel 账户。

## 本地运行

需要 Node.js 22 或更新版本。

```sh
npm ci
```

将 `.env.example` 复制为 `.env.local`，填写自己的数据库连接信息。运行以下命令生成访问密码哈希：

```sh
npm run password:hash
```

把输出填入 `APP_PASSWORD_HASH`。使用 `.env.example` 中的命令生成随机会话密钥，填入 `APP_SESSION_SECRET`，然后启动：

```sh
npm run dev
```

默认是单人私有应用，不开放注册。不要使用演示密码或复用其他账户密码。

## 部署到 Vercel

1. 在自己的 Turso 账户创建一个 **libSQL** 数据库，取得 URL 和数据库专用读写 token。
2. 在 Vercel 导入自己的源码仓库，选择 Next.js 框架。
3. 在项目 Production 环境中配置下表变量，然后部署。

关联完成后，推送生产分支 `main` 会触发 Vercel 自动构建；其他分支可用于预览。每个部署者使用自己的数据库和登录配置。

| 变量 | 用途 |
| --- | --- |
| `TURSO_DATABASE_URL` | 自己的 libSQL 数据库 URL |
| `TURSO_AUTH_TOKEN` | 数据库专用 token，不使用平台管理 token |
| `APP_PASSWORD_HASH` | 密码工具生成的 scrypt 哈希 |
| `APP_SESSION_SECRET` | 至少 32 字符的随机签名密钥 |
| `APP_OWNER_ID` | 稳定的数据命名空间，默认 `owner` |
| `APP_DISPLAY_NAME` | 页面显示名称 |

数据库表在首次访问时自动初始化。后续不要随意更改 `APP_OWNER_ID`。密钥仅放在服务端环境变量中，不加 `NEXT_PUBLIC_` 前缀。

Preview 环境应使用单独测试数据库和密码。不要将生产凭据提供给不受信任的分支或拉取请求。运行密钥保存在自己的 Vercel 项目中，不需要放入 GitHub Actions secrets。

会话最长 7 天。更换密码时，重新运行密码工具，更新 `APP_PASSWORD_HASH` 后重新部署；旧会话会失效。数据库 token 应在到期前自行轮换。

## 数据与备份

仓库不包含真实成绩或运行账户。`src/data/demo.ts` 是合成示例，只有点击“加载演示数据”时才写入应用。

使用“数据管理 → 导出完整 JSON”可以同时备份仿真模拟和模块练习。跨站迁移请导入完整 JSON，等待“已同步”后再次导出核对：

```sh
npm run backup:check -- old-backup.json new-backup.json
```

工具忽略导出时间、记录排列和字段顺序，比较实际内容。备份文件应保存在被忽略的 `backups/` 中，不要提交到仓库。浏览器缓存不会跨域自动迁移。

成绩通过原子版本比较更新同步，冲突返回 409；断网时修改保存在本机。每次保存上限 2 MiB，每类最多 10,000 条记录。

## 开发与检查

```sh
npm test
npm run build
npm run typecheck
npm run test:http
npm run privacy:check -- --history
```

`test:http` 在临时数据库上验证登录、权限、读写及冲突，不使用生产记录。隐私扫描只报告问题类别与文件路径，不输出匹配到的秘密值。

启用本地推送前扫描：

```sh
git config core.hooksPath .githooks
```

本地检查用于减少误提交，不能替代人工核对。新增截图、日志或数据文件前，应先检查是否包含个人信息。

## 公开发布

公开前确认完整历史通过隐私检查、示例配置保持空值，并确定项目许可证。当前未选定开源许可证，由维护者在正式公开前决定。
