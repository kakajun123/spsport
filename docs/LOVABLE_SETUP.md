# Lovable 后台与独立云端网站的关联

本项目面向使用者的交付方式是 [在自己的云端部署网站](CLOUD_DEPLOYMENT.zh-CN.md)。Lovable 可以用于开发和管理关联后台，不是客户使用网站的必经入口，也不需要通过 Lovable 的 Publish 发布网站。

## 前端网站与后台分别部署

- 网站前端：从 GitHub 取得代码，在使用者自己的云托管平台构建并发布。
- 业务管理后台：同一网站的 `/admin`，供授权员工和管理员使用。
- 云端数据后台：提供数据库、认证、服务端函数和 Secrets；可以保留已关联的 Lovable Cloud 后台，或管理独立 Supabase 后台。

Lovable 官方说明前端与后台可以独立迁移或保留；更换网站托管后需要重新核对环境变量、服务端配置和登录回跳地址。[官方部署边界](https://docs.lovable.dev/tips-tricks/deployment-hosting-ownership)

## 本仓库的实际技术边界

现有源码使用 Supabase 客户端、PostgreSQL SQL/RLS 和 Edge Functions。Lovable Cloud 提供数据库、认证和函数等后台能力，但这不代表已有项目会自动导入本仓库的数据结构或完成接口配置。[Lovable 后台说明](https://docs.lovable.dev/features/cloud)

接入前需要核对：

1. 后台项目确实属于部署者，并与测试/正式环境分别对应。
2. 已有表结构、迁移、权限与本项目兼容；有数据时不要重新执行空库初始化脚本。
3. 网站使用正确的公开客户端 URL/key；服务端凭据只放后台 Secrets。
4. Auth 站点地址和允许回跳指向外部云端网站。
5. 服务端函数、回调地址、定时任务、日志权限与重试机制已独立配置。
6. 前端迁移没有遗漏认证、存储或函数；复制数据库不等于迁移整个后台。

如果 Cloud 项目不提供当前代码需要的接口或配置入口，应先适配或迁移兼容后台，不能直接假定 Supabase 控制台步骤可在 Cloud 原样执行。Supabase 测试路径见 [后台配置指南](BACKEND_SETUP.zh-CN.md)。

## Shopify 客户关联

以 Shopify 客户为主档案，关联后台客户记录，并支持必要资料双向同步；付款仅说明 Shopify 和 Stripe API 两种接入。具体字段、冲突和身份绑定规则见 [付款与客户同步说明](PAYMENTS_AND_CUSTOMER_SYNC.zh-CN.md)。

当前客户同步尚未实现，付款入口保持关闭。本文没有代替部署者创建后台、连接商店、导入客户或配置支付账号。
