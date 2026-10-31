# spsport 场地预订与会员管理系统

一个可下载、可修改、由使用者部署到自己云端的开源场地预订项目。客户通过部署者的网站订场，员工登录同一网站的管理后台。包含中英双语界面、羽毛球场与台球时段选择、会员和团课管理示例，采用 [MIT 开源协议](LICENSE)。

**准备部署网站？从 [云端部署分步指南](docs/CLOUD_DEPLOYMENT.zh-CN.md) 开始。** 先发布不需要付款密钥的演示站，再配置隔离的后台测试环境。也可先按 [本地体验教程](docs/GETTING_STARTED.zh-CN.md) 在电脑上查看效果。

## 网站、后台与付款的关系

使用者在自己的云托管后台导入 GitHub 代码，构建网站并绑定自己的网址。Lovable 可以作为开发工具或关联数据库后台，网站不要求通过 Lovable 发布。

外部付款接入只说明两种：

| 接入方案 | 目标用途 |
|---|---|
| Shopify | 已有商店作为付款入口；以 Shopify 客户为主档案，与网站关联的后台数据库双向同步必要资料 |
| Stripe API | 通过 Stripe 创建付款会话并收款，由服务端回调确认预订 |

客户同步和付款是独立集成。当前仅有客户 ID 预留字段，**Shopify 客户双向同步尚未实现，真实付款保持关闭**；不会因部署网站或填写密钥而自动完成。[完整目标、关联规则与当前状态](docs/PAYMENTS_AND_CUSTOMER_SYNC.zh-CN.md)

## 先知道这三件事

1. **开源的是程序，不是客户资料。** 演示身份使用编号，邮箱仅使用 `example.com` 占位地址，没有真实会员名单或可使用的密钥。
2. **现在可以运行演示版。** 演示预订不扣款、不发通知、不保存真实订单。请用示例内容体验，不要输入真实个人资料。
3. **现在不能直接拿来正式收款。** 线上支付入口已关闭，无法用环境变量绕过。正式经营需要先完成 [待解决问题与验收](docs/REVIEW.zh-CN.md)。

## 你想做什么？

| 你的目的 | 从这里开始 | 完成后会得到什么 |
|---|---|---|
| 在自己的云端部署网站 | [云端部署分步指南](docs/CLOUD_DEPLOYMENT.zh-CN.md) | 自己管理的演示网站与管理界面 |
| 在自己电脑上看看效果 | [新手教程：第 1–5 步](docs/GETTING_STARTED.zh-CN.md) | 本地演示页面 |
| 分享一个网页链接给别人 | [新手教程：发布演示站](docs/GETTING_STARTED.zh-CN.md#6-发布只含示例数据的演示网站) | 只含示例数据的公开网站 |
| 修改场地数量和价格 | [场地配置说明](docs/VENUE_CONFIG.md) | 自定义 spsport 演示配置 |
| 用测试数据库保存数据 | [后台测试配置](docs/BACKEND_SETUP.zh-CN.md) | 独立测试环境，不是生产验收 |
| 关联 Lovable 后台 | [后台关联边界](docs/LOVABLE_SETUP.md) | 明确外部网站与数据后台的配置关系 |
| 理解付款和客户关联 | [Shopify / Stripe 与客户同步](docs/PAYMENTS_AND_CUSTOMER_SYNC.zh-CN.md) | 两种接入目标与待开发清单 |
| 修改代码或贡献功能 | [贡献指南](CONTRIBUTING.md) | 可复核的修改与测试结果 |

## 预订方式

在同一页依次选择日期、场地、时段，下面的订单摘要同步显示价格。可以选择多个场地，连续时段会合并。手机底部提供总价和「查看并预订」入口。

- 每格 30 分钟，金额为 AUD。
- 高峰时段直接标注价格。
- 发球机需要同时段的羽毛球场。
- 支持系统「减少动态效果」设置。
- 当前时区固定为 `Australia/Melbourne`，包含夏令时。

![spsport 单页预订演示，使用虚构数据](docs/images/booking-preview.png)

## 熟悉命令行的人可以快速开始

安装 Node.js 22.12 或以上版本。下载仓库 ZIP 并解压，在项目文件夹打开终端，然后逐行运行：

```bash
npm ci
npm run dev
```

打开终端显示的 `http://127.0.0.1:5173`。不用创建 `.env`，也不用填写密钥。停止时在终端按 `Ctrl+C`。

## 安全与隐私先于发布

- 只发布源代码、示例配置与经过检查的演示截图。
- `.env`、密钥、数据库备份、客户表格、聊天记录和后台截图都不能上传。
- 任何 `VITE_` 变量都会进入浏览器，只能包含公开配置。
- Git 提交者信息和旧版本也会公开；删除当前文件不等于删除历史。
- 原始预订只允许订单本人或员工读取；公开占用接口只返回场地、时间和占用状态。
- 发现疑似密钥泄露，先撤销/轮换，再处理 Git 历史，不能只删文件。

完整规则与发布步骤见 [安全说明](SECURITY.md) 和 [隐私检查记录](docs/PRIVACY_REVIEW.zh-CN.md)。检查通过只代表已检查范围，不是绝对安全保证。

## 验证命令

```bash
npm run privacy:check
npm test
npm run build
```

测试覆盖价格、夏令时、余额权限、重复入账、公开数据最小化、跨会员访问隔离及线上支付关闭。测试使用本地 PGlite；仍需真实 Supabase 集成与并发验收。

[可选 CI 模板](docs/ci.yml.example) 尚未作为 GitHub 工作流启用。复制到 `.github/workflows/ci.yml` 需要对应写入权限。

## 文件在哪里？

| 文件夹 / 文件 | 用途 |
|---|---|
| `src/` | 网页、交互、API 与演示数据 |
| `venues/` | spsport 标准与 40 片场地演示配置 |
| `supabase/schema.sql` | 全新测试数据库初始化 |
| `supabase/migrations/` | 已有数据库的增量修复 |
| `supabase/functions/` | 尚未开放的支付模块与安全关闭入口 |
| `tests/` | 自动回归测试 |
| `scripts/privacy-check.mjs` | 不输出敏感值的发布检查工具 |
| `docs/` | 新手教程、配置与审查报告 |

## 更多文档

- [云端网站部署指南](docs/CLOUD_DEPLOYMENT.zh-CN.md)
- [Shopify / Stripe 付款与客户双向同步](docs/PAYMENTS_AND_CUSTOMER_SYNC.zh-CN.md)
- [本地体验与手动发布](docs/GETTING_STARTED.zh-CN.md)
- [后台数据库测试配置](docs/BACKEND_SETUP.zh-CN.md)
- [Lovable 后台关联边界](docs/LOVABLE_SETUP.md)
- [API 文档](docs/API.md)
- [安全问题与未完成项](docs/REVIEW.zh-CN.md)
- [贡献指南](CONTRIBUTING.md)
- [更新记录](CHANGELOG.md)

项目品牌仅使用 **spsport**。第三方框架和托管服务名称只是技术说明，与场馆名称或个人署名无关。维护者的公开提交别名见 [安全说明](SECURITY.md)。
