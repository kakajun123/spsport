-- ============================================================
-- spsport · 种子数据（默认资源 + 默认设置）
-- 价格均为占位默认值，上线后请在后台「设置/资源」里改成真实数字
-- ============================================================

-- 资源类型
insert into public.resources (key, name_en, name_zh, category, price_member, price_non_member, is_addon, addon_for, sort_order) values
  ('badminton',    'Badminton Court', '羽毛球场', 'badminton', 12.00, 15.00, false, null,        1),
  ('ball_machine', 'Ball Machine',    '发球机',    'badminton',  4.00,  5.00, true,  'badminton', 2),
  ('snooker',      'Snooker Table',   '斯诺克',    'billiards', 10.00, 12.00, false, null,        3),
  ('pool8',        '8-Ball Table',    '美式八球',  'billiards',  8.00, 10.00, false, null,        4)
on conflict (key) do nothing;

-- 物理单元（3 片羽毛球场、1 发球机、2 台球桌、1 斯诺克、1 美式八球）
insert into public.resource_units (resource_id, label_en, label_zh, sort_order)
select r.id, u.label_en, u.label_zh, u.sort_order
from (values
  ('badminton',    'Court 1', '场地 1', 1),
  ('badminton',    'Court 2', '场地 2', 2),
  ('badminton',    'Court 3', '场地 3', 3),
  ('ball_machine', 'Machine 1', '发球机 1', 1),
  ('snooker',      'Snooker 1', '斯诺克 1', 1),
  ('pool8',        '8-Ball 1', '美式八球 1', 1)
) as u(key, label_en, label_zh, sort_order)
join public.resources r on r.key = u.key
where not exists (
  select 1 from public.resource_units ru where ru.resource_id = r.id and ru.label_en = u.label_en
);

-- 默认设置
insert into public.settings (key, value) values
  ('business_hours', '{"default": {"open": "09:00", "close": "23:00"}}'::jsonb),
  ('cancellation_window_hours', '2'::jsonb),
  ('no_show_penalty', '{"mode": "full"}'::jsonb),
  ('topup_tiers', '[{"amount": 50, "bonus": 0, "variantId": ""}, {"amount": 100, "bonus": 10, "variantId": ""}, {"amount": 200, "bonus": 25, "variantId": ""}]'::jsonb),
  ('default_locale', '"en"'::jsonb)
on conflict (key) do nothing;

-- 分时定价默认值（高峰倍数 + 工作日/周末高峰时段）
insert into public.settings (key, value) values
  ('peak_pricing', '{"peak_multiplier":1.3,"weekday_peak":{"start":"18:00","end":"22:00"},"weekend_peak":{"start":"09:00","end":"22:00"}}'::jsonb)
on conflict (key) do nothing;
