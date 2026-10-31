# API 文档

网站前端由使用者部署到自己的云端托管平台，数据库与服务端函数独立配置；Lovable 可以提供开发或关联后台，网站不要求部署到 Lovable。部署步骤见 [云端部署指南](CLOUD_DEPLOYMENT.zh-CN.md)。

外部付款仅有 Shopify 与 Stripe API 两种接入目标。Shopify 客户主档案与后台双向同步尚未实现，不能把 `shopify_customer_id` 字段当作同步接口。详见 [客户关联、同步规则及实现状态](PAYMENTS_AND_CUSTOMER_SYNC.zh-CN.md)。

本项目现有 API 代码分三层：

```
前端 src/lib/api.ts  ──►  Supabase RPC（SQL 函数）  ──►  Postgres
付款目标：src/lib/payment.ts ──► Edge Functions（Shopify / Stripe）
当前：前端拒绝付款请求，四个付款函数入口返回 503
```

## 一、前端 API（`src/lib/api.ts`）

### 设置
| 函数 | 说明 |
|---|---|
| `getSetting<T>(key, fallback)` | 读取系统设置 |

### 资源与场地
| 函数 | 说明 |
|---|---|
| `getResources()` | 资源列表（含会员/散客价） |
| `getUnits()` | **可预订**的场地（只返回 active） |
| `getAllUnits()` | 全部场地（后台用，含已下架） |
| `updateResource(id, v)` | 改资源名/价格/上架 |
| `setUnitActive(id, active)` | **单个场地上架/下架** |

### 订场
| 函数 | 说明 |
|---|---|
| `getDayBookings(startISO, endISO)` | 通过最小化 RPC 读取时段占用，不返回订单/会员 ID |
| `getClassAvailability(startISO, endISO)` | 课程占用，仅返回场地、时间和状态 |
| `createBookingCartBalance(lines)` | 会员用余额订多行（购物车） |
| `createBookingStaff(params)` | 前台代订单行 |
| `createBookingCartStaff(customerId, lines, channel, paid)` | 前台代订多行 |
| `cancelOrder(orderId, refund)` | 取消订单（可退余额） |
| `markNoShow(orderId)` | 标记爽约 |
| `completeOrder(orderId)` | 标记完成 |

### 会员与账本
| 函数 | 说明 |
|---|---|
| `getMembers()` | 会员列表 |
| `getMyOrders(uid)` / `getMyBookings(uid)` / `getMyTransactions(uid)` | 我的数据 |
| `creditBalance(memberId, amount)` | 手动入账 |
| `adminAdjustBalance(memberId, amount)` | 管理员调账 |

### 团课
| 函数 | 说明 |
|---|---|
| `getCourses()` / `upsertCourse(v)` | 课程 CRUD |
| `getUpcomingSessions()` | 会员端课程表（含人数） |
| `getClassSessions()` | 全部排期（后台） |
| `createClassSession(p)` / `cancelClassSession(id)` | 排期 |
| `getSessionEnrollments(sessionId)` | 某班学员 |
| `enrollMember(sessionId)` | 会员余额报名 |
| `enrollStaff(p)` | 前台代报（会员或散客） |
| `markAttendance(id, status)` / `cancelEnrollment(id)` | 考勤 / 取消报名 |
| `getMyEnrollments(uid)` | 我的课程 |

### 付款
```ts
// src/lib/payment.ts
createPayment({ kind: "topup" | "booking", amount?, variantId?, lines?, email? })
// 目标返回：{ checkoutUrl }；当前实际行为是拒绝请求
```
当前开源预览版的 `createPayment` 会拒绝请求。四个 Edge Function 在处理请求前返回 503，不读取支付凭据或调用平台。`VITE_PAYMENT_PROVIDER` 是保留配置，不能用于启用付款。

## 二、数据库 RPC（SQL 函数）

在 `supabase/schema.sql` 里定义，前端通过 `supabase.rpc(...)` 调用（`security definer`，服务端校验）。

| 函数 | 作用 |
|---|---|
| `create_booking_balance` / `create_booking_balance_cart` | 会员余额订场（单/多行） |
| `create_booking_staff` / `create_booking_staff_cart` | 前台代订（单/多行） |
| `cancel_order` / `mark_no_show` / `complete_order` | 订单状态 |
| `credit_balance` / `admin_adjust_balance` | 账本 |
| `update_resource` / `upsert_setting` / `set_role` | 管理 |
| `upsert_course` / `create_class_session` / `cancel_class_session` | 课程/排期 |
| `enroll_member` / `enroll_staff` / `mark_attendance` / `cancel_enrollment` | 报名/考勤 |
| `get_upcoming_sessions` | 会员端课程表（不含学员隐私） |
| `get_booking_availability` / `get_class_availability` | 公开最小化占用接口，每次最多 31 天 |

> 防撞单：`bookings` 表上有 `EXCLUDE USING gist` 约束，同一场地时间重叠会被数据库直接拒绝。

## 三、Edge Functions（当前安全关闭）

以下为保留实现的职责说明，不代表已经开放或验收。重新启用前必须解决审查报告的全部付款阻断项。

| 函数 | 触发 | 作用 |
|---|---|---|
| `shopify-checkout` | 前端 | 充值（Storefront 购物车）/ 订场（Draft Order） |
| `shopify-webhook` | Shopify `orders/paid` | 回写余额 / 确认订单 |
| `stripe-checkout` | 前端 | 建 Checkout Session（任意金额） |
| `stripe-webhook` | Stripe `checkout.session.completed` | 回写余额 / 确认订单 |

这些函数不包含 Shopify 客户导入、客户更新回调或反向写回。它们是安全关闭的旧支付实现，不是已验收的付款协议；Stripe 延迟付款状态处理、交易绑定等缺口见审查报告。

### 环境变量（Supabase Function secrets）

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SITE_URL                     # https://你的站点

# Shopify（用 shopify 时）
SHOPIFY_STORE_DOMAIN
SHOPIFY_STOREFRONT_TOKEN
SHOPIFY_ADMIN_TOKEN
SHOPIFY_WEBHOOK_SECRET

# Stripe（用 stripe 时）
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

## 四、数据表

`profiles`（会员/员工）、`resources`（资源）、`resource_units`（场地）、`orders`（订单）、`bookings`（预订行）、`transactions`（储值流水）、`settings`（设置）、`courses`（课程）、`class_sessions`（排期）、`enrollments`（报名）。

详见 `supabase/schema.sql`。
