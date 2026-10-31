# spsport 场地配置

仓库只提供 spsport 品牌。两个文件是同一品牌的演示规模，不代表不同经营者：

| 文件 | 用途 |
|---|---|
| `venues/spsport.json` | 标准规模演示 |
| `venues/spsport-large.json` | 40 片场地的容量演示 |

## 修改现有示例

1. 用文本编辑器打开 `venues/spsport.json`。
2. 在 `resources` 中找到要修改的资源。
3. 改 `units`、`price_member` 和 `price_non_member`。
4. 保存，检查本地页面；再运行测试与构建。

例如把羽毛球场改为 6 片，会员 10 AUD / 30 分钟，游客 13 AUD / 30 分钟：

```json
{
  "key": "badminton",
  "category": "badminton",
  "name_en": "Badminton Court",
  "name_zh": "羽毛球场",
  "price_member": 10,
  "price_non_member": 13,
  "units": 6
}
```

这是资源数组中的一个元素，不是整个文件。不要把整个 JSON 文件替换成这一个元素。

## 字段含义

| 字段 | 说明 |
|---|---|
| `id` | 配置标识，对应代码注册项 |
| `name_en` / `name_zh` | 展示名称，公开模板只使用 spsport |
| `resources[].key` | 资源类型标识 |
| `category` | 羽毛球 `badminton` 或台球 `billiards` |
| `price_member` / `price_non_member` | 每 30 分钟的基础价，单位 AUD |
| `units` | 场地数量，正整数 |
| `is_addon` / `addon_for` | 附加设备及其关联资源 |

文件里不能填写员工姓名、客户信息、地址、电话号码或密钥。需要扩展经营配置时，先决定访问权限，不要直接塞进随网页公开下载的 JSON。

## 高峰价格

`pricing` 示例：

```json
{
  "peak_multiplier": 1.3,
  "weekday_peak": { "start": "18:00", "end": "22:00" },
  "weekend_peak": { "start": "09:00", "end": "22:00" }
}
```

高峰单价等于基础价乘以倍率。工作日和周末按墨尔本时间判断。演示读取当前 JSON 或内存设置；连接测试数据库后读取 `settings.peak_pricing`。

## 选择配置

- 在演示页面顶部直接切换。
- 用 `?venue=spsport-large` 打开容量演示。
- 本地 `VITE_VENUE=spsport` 可设默认值。
- 自己添加文件时还需在 `src/lib/venueConfig.ts` 导入并注册。

这些都是**演示配置**。真实数据库的 `resources` / `resource_units` 不会随 JSON 切换，也没有生产多租户隔离。不要把这个切换功能用作不同客户之间的数据隔离。
