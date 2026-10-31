-- ============================================================
-- spsport · 订场 + 会员系统 — Supabase 数据库 Schema
-- 运行方式：在 Supabase SQL Editor 里整段执行（或用 CLI push）
-- ============================================================

create extension if not exists btree_gist;   -- 防撞单的区间排除约束
create extension if not exists pgcrypto;     -- gen_random_uuid()

-- ------------------------------------------------------------
-- 1. 用户档案（extends auth.users）
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  role text not null default 'member'
    check (role in ('member', 'front_desk', 'admin')),
  balance numeric(12, 2) not null default 0,      -- 储值余额（AUD）
  shopify_customer_id text,
  locale text not null default 'en'               -- 'en' | 'zh'
    check (locale in ('en', 'zh')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. 资源类型（羽毛球 / 发球机 / 台球 / 斯诺克 / 美式八球）
-- ------------------------------------------------------------
create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name_en text not null,
  name_zh text not null,
  category text not null,                          -- badminton | billiards
  price_member numeric(10, 2) not null default 0,      -- 会员价 / 30 分钟
  price_non_member numeric(10, 2) not null default 0,  -- 非会员价 / 30 分钟
  is_addon boolean not null default false,         -- 发球机 = 加购项
  addon_for text,                                  -- 加购项须挂在哪种资源上，如 'badminton'
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. 可预订的物理单元（3 片场地、2 张台球桌…）
-- ------------------------------------------------------------
create table if not exists public.resource_units (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  label_en text not null,     -- Court 1 / Table 1
  label_zh text not null,     -- 场地 1 / 台 1
  active boolean not null default true,
  sort_order int not null default 0
);

-- ------------------------------------------------------------
-- 4. 订单（一次下单 = 一个订单，可含多个 booking 行）
-- ------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.profiles(id),          -- 会员；散客可空
  created_by uuid references public.profiles(id),           -- 谁操作（会员本人 / 前台）；散客线上订为空
  channel text not null
    check (channel in ('member_balance', 'shopify', 'cash', 'card', 'class')),
  status text not null default 'confirmed'
    check (status in ('pending_payment', 'confirmed', 'cancelled', 'completed', 'no_show')),
  total numeric(12, 2) not null default 0,
  paid_at timestamptz,
  shopify_order_id text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 5. 预订行（每个单元一条，含起止时间）
-- ------------------------------------------------------------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  unit_id uuid not null references public.resource_units(id),
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'booked'
    check (status in ('booked', 'cancelled', 'completed', 'no_show')),
  price numeric(12, 2) not null default 0,
  check (end_time > start_time)
);

create index bookings_unit_time_idx on public.bookings (unit_id, start_time, end_time);
create index bookings_order_idx on public.bookings (order_id);

-- ★ 防撞单：同一单元、非「已取消」的预订，时间区间不能重叠
alter table public.bookings
  add constraint no_double_booking
  exclude using gist (unit_id with =, tstzrange(start_time, end_time) with &&)
  where (status <> 'cancelled');

-- ------------------------------------------------------------
-- 6. 储值账本（每条流水，正=入账，负=出账）
-- ------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('topup', 'deduct', 'refund', 'adjust')),
  amount numeric(12, 2) not null,
  balance_after numeric(12, 2) not null,
  order_id uuid references public.orders(id),
  shopify_order_id text,
  note text,
  created_at timestamptz not null default now()
);

create index transactions_member_idx on public.transactions (member_id, created_at desc);

-- ------------------------------------------------------------
-- 7. 系统设置（KV / JSON）
-- ------------------------------------------------------------
create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 角色判断辅助
-- ============================================================
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('front_desk', 'admin')
  );
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ============================================================
-- 新用户注册时自动建档案
-- ============================================================
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 工具：时段是否可订
-- ============================================================
create or replace function public.units_available(
  p_unit_ids uuid[], p_start timestamptz, p_end timestamptz
) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.bookings b
    where b.unit_id = any (p_unit_ids)
      and b.status <> 'cancelled'
      and b.start_time < p_end
      and b.end_time > p_start
  );
$$;

-- ============================================================
-- 工具：校验并计算总价（服务端算价，不信任前端传价）
-- ============================================================
create or replace function public.compute_total(
  p_unit_ids uuid[], p_start timestamptz, p_end timestamptz, p_member boolean
) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  v_slots int;
  v_total numeric(12, 2);
begin
  if p_end <= p_start then
    raise exception 'end_time must be after start_time';
  end if;
  if mod(extract(epoch from (p_end - p_start))::int, 1800) <> 0 then
    raise exception 'booking must be in 30-minute increments';
  end if;
  v_slots := (extract(epoch from (p_end - p_start))::int) / 1800;

  select coalesce(sum(
           case when p_member then r.price_member else r.price_non_member end
         ), 0) * v_slots
    into v_total
  from public.resource_units u
  join public.resources r on r.id = u.resource_id
  where u.id = any (p_unit_ids)
    and u.active
    and r.active;

  if v_total is null or v_total < 0 then
    raise exception 'invalid units';
  end if;
  return v_total;
end;
$$;

-- ============================================================
-- 8. 会员自助订场（储值余额扣款，原子操作）
-- ============================================================
create or replace function public.create_booking_balance(
  p_unit_ids uuid[], p_start timestamptz, p_end timestamptz
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_total numeric(12, 2);
  v_order uuid;
  v_unit uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.units_available(p_unit_ids, p_start, p_end) then
    raise exception 'slot unavailable';
  end if;

  v_total := public.compute_total(p_unit_ids, p_start, p_end, true);

  -- 扣余额（余额不足则抛错，整段回滚）
  update public.profiles
     set balance = balance - v_total, updated_at = now()
   where id = v_uid and balance >= v_total;
  if not found then
    raise exception 'insufficient balance';
  end if;

  insert into public.orders (customer_id, created_by, channel, status, total, paid_at)
  values (v_uid, v_uid, 'member_balance', 'confirmed', v_total, now())
  returning id into v_order;

  foreach v_unit in array p_unit_ids loop
    insert into public.bookings (order_id, unit_id, start_time, end_time, price)
    values (v_order, v_unit, p_start, p_end,
            (select r.price_member from public.resource_units u
               join public.resources r on r.id = u.resource_id
              where u.id = v_unit));
  end loop;

  insert into public.transactions (member_id, type, amount, balance_after, order_id, note)
  select v_uid, 'deduct', -v_total, balance, v_order, 'booking'
    from public.profiles where id = v_uid;

  return v_order;
end;
$$;

-- ============================================================
-- 9. 前台代订（现金 / 刷卡 / 会员余额 / Shopify 待付款）
-- ============================================================
create or replace function public.create_booking_staff(
  p_customer_id uuid, p_unit_ids uuid[], p_start timestamptz, p_end timestamptz,
  p_channel text, p_paid boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_member boolean := (p_customer_id is not null);
  v_total numeric(12, 2);
  v_order uuid;
  v_unit uuid;
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'staff only';
  end if;
  if p_channel not in ('cash', 'card', 'member_balance', 'shopify') then
    raise exception 'invalid channel';
  end if;
  if p_channel = 'member_balance' and p_customer_id is null then
    raise exception 'member_balance requires a customer';
  end if;

  if not public.units_available(p_unit_ids, p_start, p_end) then
    raise exception 'slot unavailable';
  end if;

  v_total := public.compute_total(p_unit_ids, p_start, p_end, v_member);

  if p_channel = 'member_balance' then
    update public.profiles
       set balance = balance - v_total, updated_at = now()
     where id = p_customer_id and balance >= v_total;
    if not found then
      raise exception 'insufficient balance';
    end if;
  end if;

  insert into public.orders (customer_id, created_by, channel, status, total, paid_at)
  values (
    p_customer_id, v_uid, p_channel,
    case when p_channel = 'shopify' and not p_paid then 'pending_payment' else 'confirmed' end,
    v_total,
    case when p_channel = 'shopify' and not p_paid then null else now() end
  )
  returning id into v_order;

  foreach v_unit in array p_unit_ids loop
    insert into public.bookings (order_id, unit_id, start_time, end_time, price)
    values (v_order, v_unit, p_start, p_end,
            (select case when v_member then r.price_member else r.price_non_member end
               from public.resource_units u
               join public.resources r on r.id = u.resource_id
              where u.id = v_unit));
  end loop;

  if p_channel = 'member_balance' then
    insert into public.transactions (member_id, type, amount, balance_after, order_id, note)
    select p_customer_id, 'deduct', -v_total, balance, v_order, 'booking (staff)'
      from public.profiles where id = p_customer_id;
  end if;

  return v_order;
end;
$$;

-- ============================================================
-- 10. 入账（Shopify 充值 webhook 或管理员手动入账）
-- ============================================================
create or replace function public.credit_balance(
  p_member_id uuid, p_amount numeric, p_note text default null,
  p_shopify_order_id text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_balance numeric(12, 2);
begin
  -- 仅服务端（service_role，auth.uid() 为空）或管理员可调用
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'admin or service only';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  update public.profiles
     set balance = balance + p_amount, updated_at = now()
   where id = p_member_id
   returning balance into v_balance;

  if v_balance is null then
    raise exception 'member not found';
  end if;

  insert into public.transactions (member_id, type, amount, balance_after, shopify_order_id, note)
  values (p_member_id, 'topup', p_amount, v_balance, p_shopify_order_id, coalesce(p_note, 'topup'));
end;
$$;

-- ============================================================
-- 11. 管理员手动调账（正负均可）
-- ============================================================
create or replace function public.admin_adjust_balance(
  p_member_id uuid, p_amount numeric, p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_balance numeric(12, 2);
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  if p_amount = 0 then
    raise exception 'amount cannot be zero';
  end if;

  update public.profiles
     set balance = balance + p_amount, updated_at = now()
   where id = p_member_id
   returning balance into v_balance;

  if v_balance is null then
    raise exception 'member not found';
  end if;

  insert into public.transactions (member_id, type, amount, balance_after, note)
  values (p_member_id, 'adjust', p_amount, v_balance, coalesce(p_note, 'manual adjust'));
end;
$$;

-- ============================================================
-- 12. 取消订单（前台操作；会员余额通道可选择退余额）
-- ============================================================
create or replace function public.cancel_order(
  p_order_id uuid, p_refund boolean default true
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_balance numeric(12, 2);
begin
  if not public.is_staff() then
    raise exception 'staff only';
  end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.status in ('cancelled', 'completed', 'no_show') then
    raise exception 'order cannot be cancelled';
  end if;

  update public.bookings set status = 'cancelled' where order_id = p_order_id;
  update public.orders set status = 'cancelled', updated_at = now() where id = p_order_id;

  if v_order.channel = 'member_balance' and p_refund then
    update public.profiles
       set balance = balance + v_order.total, updated_at = now()
     where id = v_order.customer_id
     returning balance into v_balance;
    insert into public.transactions (member_id, type, amount, balance_after, order_id, note)
    values (v_order.customer_id, 'refund', v_order.total, v_balance, p_order_id, 'cancel refund');
  end if;
end;
$$;

-- ============================================================
-- 13. 标记爽约（没来；余额通道不退 = 罚全款）
-- ============================================================
create or replace function public.mark_no_show(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then
    raise exception 'staff only';
  end if;
  update public.bookings set status = 'no_show' where order_id = p_order_id;
  update public.orders set status = 'no_show', updated_at = now() where id = p_order_id;
end;
$$;

-- ============================================================
-- 14. 完成订单
-- ============================================================
create or replace function public.complete_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then
    raise exception 'staff only';
  end if;
  update public.bookings set status = 'completed' where order_id = p_order_id;
  update public.orders set status = 'completed', updated_at = now() where id = p_order_id;
end;
$$;

-- ============================================================
-- 15. 管理端：改资源价格 / 名称 / 上下架
-- ============================================================
create or replace function public.update_resource(
  p_resource_id uuid,
  p_name_en text, p_name_zh text,
  p_price_member numeric, p_price_non_member numeric,
  p_active boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  update public.resources
     set name_en = p_name_en, name_zh = p_name_zh,
         price_member = p_price_member, price_non_member = p_price_non_member,
         active = p_active
   where id = p_resource_id;
end;
$$;

-- ============================================================
-- 16. 管理端：写设置
-- ============================================================
create or replace function public.upsert_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  insert into public.settings (key, value, updated_at)
  values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;

-- ============================================================
-- 17. 管理端：设置用户角色
-- ============================================================
create or replace function public.set_role(p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  if p_role not in ('member', 'front_desk', 'admin') then
    raise exception 'invalid role';
  end if;
  update public.profiles set role = p_role, updated_at = now() where id = p_user_id;
end;
$$;

-- ============================================================
-- 保护字段：普通用户不能直接改 role / balance
-- ============================================================
create or replace function public.protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.role := old.role;
    new.balance := old.balance;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields
  before update on public.profiles
  for each row execute procedure public.protect_profile_fields();

-- ============================================================
-- RLS：开启行级安全
-- ============================================================
alter table public.profiles enable row level security;
alter table public.resources enable row level security;
alter table public.resource_units enable row level security;
alter table public.orders enable row level security;
alter table public.bookings enable row level security;
alter table public.transactions enable row level security;
alter table public.settings enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_staff());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists resources_select on public.resources;
create policy resources_select on public.resources for select
  using (true);   -- 资源/价格公开，游客订场也要能看到

drop policy if exists resources_admin_write on public.resources;
create policy resources_admin_write on public.resources for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists units_select on public.resource_units;
create policy units_select on public.resource_units for select
  using (true);   -- 单元列表公开

drop policy if exists units_admin_write on public.resource_units;
create policy units_admin_write on public.resource_units for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select
  using (customer_id = auth.uid() or created_by = auth.uid() or public.is_staff());

drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings for select
  using (true);   -- 时段占用信息公开（订场页要显示可订/已订），不含身份信息

drop policy if exists transactions_select on public.transactions;
create policy transactions_select on public.transactions for select
  using (member_id = auth.uid() or public.is_staff());

drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select
  using (true);   -- 营业时间/充值档位等公开

drop policy if exists settings_admin_write on public.settings;
create policy settings_admin_write on public.settings for all
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 18. 购物车批量订场（会员余额，一次订多个单元/时段）
-- p_lines = [{"unit_id":"...","start_time":"...","end_time":"..."}, ...]
-- ============================================================
create or replace function public.create_booking_balance_cart(p_lines jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_total numeric(12, 2) := 0;
  v_line jsonb;
  v_unit uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_slots int;
  v_price numeric(12, 2);
  v_order uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'empty cart'; end if;

  for v_line in (select jsonb_array_elements(p_lines)) loop
    v_unit := (v_line ->> 'unit_id')::uuid;
    v_start := (v_line ->> 'start_time')::timestamptz;
    v_end := (v_line ->> 'end_time')::timestamptz;
    if not public.units_available(array[v_unit], v_start, v_end) then
      raise exception 'slot unavailable';
    end if;
    v_slots := (extract(epoch from (v_end - v_start))::int) / 1800;
    select r.price_member * v_slots into v_price
      from public.resource_units u join public.resources r on r.id = u.resource_id
     where u.id = v_unit;
    if v_price is null then raise exception 'invalid unit'; end if;
    v_total := v_total + v_price;
  end loop;

  update public.profiles set balance = balance - v_total, updated_at = now()
   where id = v_uid and balance >= v_total;
  if not found then raise exception 'insufficient balance'; end if;

  insert into public.orders (customer_id, created_by, channel, status, total, paid_at)
  values (v_uid, v_uid, 'member_balance', 'confirmed', v_total, now())
  returning id into v_order;

  for v_line in (select jsonb_array_elements(p_lines)) loop
    v_unit := (v_line ->> 'unit_id')::uuid;
    v_start := (v_line ->> 'start_time')::timestamptz;
    v_end := (v_line ->> 'end_time')::timestamptz;
    select r.price_member into v_price
      from public.resource_units u join public.resources r on r.id = u.resource_id
     where u.id = v_unit;
    insert into public.bookings (order_id, unit_id, start_time, end_time, price)
    values (v_order, v_unit, v_start, v_end, v_price);
  end loop;

  insert into public.transactions (member_id, type, amount, balance_after, order_id, note)
  select v_uid, 'deduct', -v_total, balance, v_order, 'booking'
    from public.profiles where id = v_uid;

  return v_order;
end;
$$;

-- ============================================================
-- 19. 前台购物车代订（现金/刷卡/会员余额/Shopify）
-- ============================================================
create or replace function public.create_booking_staff_cart(
  p_customer_id uuid, p_lines jsonb, p_channel text, p_paid boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_member boolean := (p_customer_id is not null);
  v_total numeric(12, 2) := 0;
  v_line jsonb;
  v_unit uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_slots int;
  v_price numeric(12, 2);
  v_order uuid;
begin
  if v_uid is null or not public.is_staff() then raise exception 'staff only'; end if;
  if p_channel not in ('cash', 'card', 'member_balance', 'shopify') then raise exception 'invalid channel'; end if;
  if p_channel = 'member_balance' and p_customer_id is null then raise exception 'member_balance requires a customer'; end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'empty cart'; end if;

  for v_line in (select jsonb_array_elements(p_lines)) loop
    v_unit := (v_line ->> 'unit_id')::uuid;
    v_start := (v_line ->> 'start_time')::timestamptz;
    v_end := (v_line ->> 'end_time')::timestamptz;
    if not public.units_available(array[v_unit], v_start, v_end) then raise exception 'slot unavailable'; end if;
    v_slots := (extract(epoch from (v_end - v_start))::int) / 1800;
    select case when v_member then r.price_member else r.price_non_member end * v_slots into v_price
      from public.resource_units u join public.resources r on r.id = u.resource_id
     where u.id = v_unit;
    if v_price is null then raise exception 'invalid unit'; end if;
    v_total := v_total + v_price;
  end loop;

  if p_channel = 'member_balance' then
    update public.profiles set balance = balance - v_total, updated_at = now()
     where id = p_customer_id and balance >= v_total;
    if not found then raise exception 'insufficient balance'; end if;
  end if;

  insert into public.orders (customer_id, created_by, channel, status, total, paid_at)
  values (p_customer_id, v_uid, p_channel,
    case when p_channel = 'shopify' and not p_paid then 'pending_payment' else 'confirmed' end,
    v_total, case when p_channel = 'shopify' and not p_paid then null else now() end)
  returning id into v_order;

  for v_line in (select jsonb_array_elements(p_lines)) loop
    v_unit := (v_line ->> 'unit_id')::uuid;
    v_start := (v_line ->> 'start_time')::timestamptz;
    v_end := (v_line ->> 'end_time')::timestamptz;
    select case when v_member then r.price_member else r.price_non_member end into v_price
      from public.resource_units u join public.resources r on r.id = u.resource_id
     where u.id = v_unit;
    insert into public.bookings (order_id, unit_id, start_time, end_time, price)
    values (v_order, v_unit, v_start, v_end, v_price);
  end loop;

  if p_channel = 'member_balance' then
    insert into public.transactions (member_id, type, amount, balance_after, order_id, note)
    select p_customer_id, 'deduct', -v_total, balance, v_order, 'booking (staff)'
      from public.profiles where id = p_customer_id;
  end if;

  return v_order;
end;
$$;

-- ============================================================
-- 20. 团课模块：课程 / 排期 / 报名
-- ============================================================

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_zh text not null,
  coach_name text,
  description text,
  price numeric(10, 2) not null default 0,
  capacity int not null default 6,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  unit_id uuid not null references public.resource_units(id),
  start_time timestamptz not null,
  end_time timestamptz not null,
  coach_name text,
  capacity int not null default 6,
  price numeric(10, 2) not null default 0,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'cancelled', 'completed')),
  booking_id uuid references public.bookings(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists class_sessions_time_idx on public.class_sessions (start_time, end_time);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  member_id uuid references public.profiles(id),
  guest_name text,
  guest_email text,
  guest_phone text,
  status text not null default 'enrolled'
    check (status in ('enrolled', 'attended', 'no_show', 'cancelled')),
  price numeric(10, 2) not null default 0,
  channel text not null default 'member_balance'
    check (channel in ('member_balance', 'shopify', 'cash', 'card')),
  paid boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists enrollments_session_idx on public.enrollments (session_id);
create unique index if not exists enrollments_member_uniq
  on public.enrollments (session_id, member_id)
  where member_id is not null and status <> 'cancelled';
create unique index if not exists enrollments_guest_uniq
  on public.enrollments (session_id, lower(guest_email))
  where guest_email is not null and status <> 'cancelled';

create or replace function public.upsert_course(
  p_id uuid, p_name_en text, p_name_zh text, p_coach text, p_desc text,
  p_price numeric, p_capacity int, p_active boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_id is null then
    insert into public.courses (name_en, name_zh, coach_name, description, price, capacity, active)
    values (p_name_en, p_name_zh, p_coach, p_desc, p_price, p_capacity, p_active)
    returning id into v_id;
  else
    update public.courses
       set name_en = p_name_en, name_zh = p_name_zh, coach_name = p_coach,
           description = p_desc, price = p_price, capacity = p_capacity, active = p_active
     where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.create_class_session(
  p_course_id uuid, p_unit_id uuid, p_start timestamptz, p_end timestamptz,
  p_coach text, p_capacity int, p_price numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_order uuid;
  v_booking uuid;
  v_session uuid;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_end <= p_start then raise exception 'invalid time'; end if;
  if not public.units_available(array[p_unit_id], p_start, p_end) then raise exception 'slot unavailable'; end if;

  insert into public.orders (customer_id, created_by, channel, status, total, paid_at)
  values (null, auth.uid(), 'class', 'confirmed', 0, now())
  returning id into v_order;

  insert into public.bookings (order_id, unit_id, start_time, end_time, status, price)
  values (v_order, p_unit_id, p_start, p_end, 'booked', 0)
  returning id into v_booking;

  insert into public.class_sessions (course_id, unit_id, start_time, end_time, coach_name, capacity, price, booking_id, created_by)
  values (p_course_id, p_unit_id, p_start, p_end, p_coach, p_capacity, p_price, v_booking, auth.uid())
  returning id into v_session;

  return v_session;
end;
$$;

create or replace function public.cancel_class_session(p_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_session public.class_sessions%rowtype;
  v_enr public.enrollments%rowtype;
  v_balance numeric;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select * into v_session from public.class_sessions where id = p_session_id for update;
  if not found or v_session.status = 'cancelled' then raise exception 'session not cancellable'; end if;

  update public.class_sessions set status = 'cancelled' where id = p_session_id;
  if v_session.booking_id is not null then
    update public.bookings set status = 'cancelled' where id = v_session.booking_id;
  end if;

  for v_enr in select * from public.enrollments
    where session_id = p_session_id and status <> 'cancelled' and paid
  loop
    if v_enr.channel = 'member_balance' and v_enr.member_id is not null then
      update public.profiles set balance = balance + v_enr.price, updated_at = now()
       where id = v_enr.member_id returning balance into v_balance;
      insert into public.transactions (member_id, type, amount, balance_after, note)
      values (v_enr.member_id, 'refund', v_enr.price, v_balance, 'class cancelled refund');
    end if;
    update public.enrollments set status = 'cancelled' where id = v_enr.id;
  end loop;
end;
$$;

create or replace function public.enroll_member(p_session_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_session public.class_sessions%rowtype;
  v_count int;
  v_enr uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_session from public.class_sessions where id = p_session_id for update;
  if not found or v_session.status <> 'scheduled' then raise exception 'session unavailable'; end if;
  if v_session.start_time < now() then raise exception 'session already started'; end if;

  select count(*) into v_count from public.enrollments
   where session_id = p_session_id and status in ('enrolled', 'attended');
  if v_count >= v_session.capacity then raise exception 'class full'; end if;
  if exists (select 1 from public.enrollments
             where session_id = p_session_id and member_id = v_uid and status <> 'cancelled') then
    raise exception 'already enrolled';
  end if;

  update public.profiles set balance = balance - v_session.price, updated_at = now()
   where id = v_uid and balance >= v_session.price;
  if not found then raise exception 'insufficient balance'; end if;

  insert into public.enrollments (session_id, member_id, status, price, channel, paid)
  values (p_session_id, v_uid, 'enrolled', v_session.price, 'member_balance', true)
  returning id into v_enr;

  insert into public.transactions (member_id, type, amount, balance_after, note)
  select v_uid, 'deduct', -v_session.price, balance, 'class enrollment'
    from public.profiles where id = v_uid;

  return v_enr;
end;
$$;

create or replace function public.enroll_staff(
  p_session_id uuid, p_member_id uuid, p_guest_name text, p_guest_email text, p_guest_phone text,
  p_channel text, p_paid boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_session public.class_sessions%rowtype;
  v_count int;
  v_enr uuid;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if p_channel not in ('member_balance', 'cash', 'card') then raise exception 'invalid channel'; end if;
  if p_member_id is null and coalesce(p_guest_name, '') = '' then raise exception 'guest name required'; end if;
  if p_channel = 'member_balance' and p_member_id is null then raise exception 'member required for balance'; end if;

  select * into v_session from public.class_sessions where id = p_session_id for update;
  if not found or v_session.status <> 'scheduled' then raise exception 'session unavailable'; end if;

  select count(*) into v_count from public.enrollments
   where session_id = p_session_id and status in ('enrolled', 'attended');
  if v_count >= v_session.capacity then raise exception 'class full'; end if;

  if p_channel = 'member_balance' then
    update public.profiles set balance = balance - v_session.price, updated_at = now()
     where id = p_member_id and balance >= v_session.price;
    if not found then raise exception 'insufficient balance'; end if;
  end if;

  insert into public.enrollments (session_id, member_id, guest_name, guest_email, guest_phone, status, price, channel, paid)
  values (p_session_id, p_member_id, p_guest_name, p_guest_email, p_guest_phone, 'enrolled', v_session.price, p_channel, p_paid)
  returning id into v_enr;

  if p_channel = 'member_balance' then
    insert into public.transactions (member_id, type, amount, balance_after, note)
    select p_member_id, 'deduct', -v_session.price, balance, 'class enrollment (staff)'
      from public.profiles where id = p_member_id;
  end if;

  return v_enr;
end;
$$;

create or replace function public.mark_attendance(p_enrollment_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if p_status not in ('attended', 'no_show', 'cancelled', 'enrolled') then raise exception 'invalid status'; end if;
  update public.enrollments set status = p_status where id = p_enrollment_id;
end;
$$;

create or replace function public.cancel_enrollment(p_enrollment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_enr public.enrollments%rowtype;
  v_balance numeric;
begin
  select * into v_enr from public.enrollments where id = p_enrollment_id for update;
  if not found or v_enr.status = 'cancelled' then return; end if;
  if not (v_enr.member_id = auth.uid() or public.is_staff()) then raise exception 'not allowed'; end if;

  update public.enrollments set status = 'cancelled' where id = p_enrollment_id;
  if v_enr.channel = 'member_balance' and v_enr.member_id is not null and v_enr.paid then
    update public.profiles set balance = balance + v_enr.price, updated_at = now()
     where id = v_enr.member_id returning balance into v_balance;
    insert into public.transactions (member_id, type, amount, balance_after, note)
    values (v_enr.member_id, 'refund', v_enr.price, v_balance, 'class enrollment cancelled');
  end if;
end;
$$;

create or replace function public.get_upcoming_sessions()
returns table (
  id uuid, course_id uuid, course_name_en text, course_name_zh text,
  coach_name text, unit_id uuid, unit_label_en text, unit_label_zh text,
  start_time timestamptz, end_time timestamptz, capacity int, price numeric,
  enrolled_count int, status text
)
language sql stable security definer set search_path = public as $$
  select s.id, s.course_id, c.name_en, c.name_zh, coalesce(s.coach_name, c.coach_name),
         s.unit_id, u.label_en, u.label_zh, s.start_time, s.end_time, s.capacity, s.price,
         (select count(*) from public.enrollments e
           where e.session_id = s.id and e.status in ('enrolled', 'attended'))::int,
         s.status
    from public.class_sessions s
    join public.courses c on c.id = s.course_id
    join public.resource_units u on u.id = s.unit_id
   where s.status = 'scheduled' and s.start_time >= now()
   order by s.start_time;
$$;

alter table public.courses enable row level security;
alter table public.class_sessions enable row level security;
alter table public.enrollments enable row level security;

drop policy if exists courses_select on public.courses;
create policy courses_select on public.courses for select using (true);
drop policy if exists courses_admin_write on public.courses;
create policy courses_admin_write on public.courses for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists class_sessions_select on public.class_sessions;
create policy class_sessions_select on public.class_sessions for select using (true);
drop policy if exists class_sessions_admin_write on public.class_sessions;
create policy class_sessions_admin_write on public.class_sessions for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists enrollments_select on public.enrollments;
create policy enrollments_select on public.enrollments for select
  using (member_id = auth.uid() or public.is_staff());

-- ============================================================
-- 22. 分时定价（高峰 / 非高峰）
-- settings.peak_pricing = {"peak_multiplier":1.3,"weekday_peak":{"start":"18:00","end":"22:00"},"weekend_peak":{"start":"09:00","end":"22:00"}}
-- ============================================================

-- 22.1 某时刻的高峰倍数
create or replace function public.peak_multiplier(p_ts timestamptz) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  v_cfg jsonb;
  v_local timestamp := p_ts at time zone 'Australia/Melbourne';
  v_dow int := extract(dow from v_local)::int;
  v_mins int := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  v_win jsonb;
  v_start text;
  v_end text;
  v_sh int; v_sm int; v_eh int; v_em int;
begin
  select value into v_cfg from public.settings where key = 'peak_pricing';
  if v_cfg is null then return 1; end if;

  v_win := case when v_dow in (0, 6) then v_cfg -> 'weekend_peak' else v_cfg -> 'weekday_peak' end;
  if v_win is null then return 1; end if;

  v_start := v_win ->> 'start';
  v_end := v_win ->> 'end';
  if v_start is null or v_end is null then return 1; end if;

  v_sh := split_part(v_start, ':', 1)::int;
  v_sm := split_part(v_start, ':', 2)::int;
  v_eh := split_part(v_end, ':', 1)::int;
  v_em := split_part(v_end, ':', 2)::int;

  if v_mins >= v_sh * 60 + v_sm and v_mins < v_eh * 60 + v_em then
    return coalesce((v_cfg ->> 'peak_multiplier')::numeric, 1);
  end if;
  return 1;
end;
$$;

-- 22.2 单行（单元 + 时段）的价格（按 30 分钟逐个累加高峰倍数）
create or replace function public.line_total(
  p_unit_id uuid, p_start timestamptz, p_end timestamptz, p_member boolean
) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  v_total numeric := 0;
  v_price numeric;
  t timestamptz := p_start;
begin
  select case when p_member then r.price_member else r.price_non_member end into v_price
    from public.resource_units u join public.resources r on r.id = u.resource_id
   where u.id = p_unit_id;
  if v_price is null then raise exception 'invalid unit'; end if;

  while t < p_end loop
    v_total := v_total + v_price * public.peak_multiplier(t);
    t := t + interval '30 minutes';
  end loop;
  return v_total;
end;
$$;

-- 22.3 购物车多行总价
create or replace function public.compute_booking_total(p_lines jsonb, p_member boolean) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  v_total numeric := 0;
  v_line jsonb;
begin
  for v_line in select jsonb_array_elements(p_lines) loop
    v_total := v_total + public.line_total(
      (v_line ->> 'unit_id')::uuid,
      (v_line ->> 'start_time')::timestamptz,
      (v_line ->> 'end_time')::timestamptz,
      p_member
    );
  end loop;
  return v_total;
end;
$$;

-- 22.4 覆盖 compute_total（单/多单元同一时段）
create or replace function public.compute_total(
  p_unit_ids uuid[], p_start timestamptz, p_end timestamptz, p_member boolean
) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  v_total numeric := 0;
  v_unit uuid;
begin
  if p_end <= p_start then raise exception 'end_time must be after start_time'; end if;
  if mod(extract(epoch from (p_end - p_start))::int, 1800) <> 0 then
    raise exception 'booking must be in 30-minute increments';
  end if;
  foreach v_unit in array p_unit_ids loop
    v_total := v_total + public.line_total(v_unit, p_start, p_end, p_member);
  end loop;
  return v_total;
end;
$$;

-- 22.5 覆盖会员购物车订场（按行分时计价）
create or replace function public.create_booking_balance_cart(p_lines jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_total numeric(12,2) := 0;
  v_line jsonb;
  v_unit uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_price numeric(12,2);
  v_order uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'empty cart'; end if;

  for v_line in select jsonb_array_elements(p_lines) loop
    v_unit := (v_line ->> 'unit_id')::uuid;
    v_start := (v_line ->> 'start_time')::timestamptz;
    v_end := (v_line ->> 'end_time')::timestamptz;
    if not public.units_available(array[v_unit], v_start, v_end) then raise exception 'slot unavailable'; end if;
    v_total := v_total + public.line_total(v_unit, v_start, v_end, true);
  end loop;

  update public.profiles set balance = balance - v_total, updated_at = now()
   where id = v_uid and balance >= v_total;
  if not found then raise exception 'insufficient balance'; end if;

  insert into public.orders (customer_id, created_by, channel, status, total, paid_at)
  values (v_uid, v_uid, 'member_balance', 'confirmed', v_total, now())
  returning id into v_order;

  for v_line in select jsonb_array_elements(p_lines) loop
    v_unit := (v_line ->> 'unit_id')::uuid;
    v_start := (v_line ->> 'start_time')::timestamptz;
    v_end := (v_line ->> 'end_time')::timestamptz;
    v_price := public.line_total(v_unit, v_start, v_end, true);
    insert into public.bookings (order_id, unit_id, start_time, end_time, price)
    values (v_order, v_unit, v_start, v_end, v_price);
  end loop;

  insert into public.transactions (member_id, type, amount, balance_after, order_id, note)
  select v_uid, 'deduct', -v_total, balance, v_order, 'booking'
    from public.profiles where id = v_uid;

  return v_order;
end;
$$;

-- 22.6 覆盖前台购物车代订（按行分时计价）
create or replace function public.create_booking_staff_cart(
  p_customer_id uuid, p_lines jsonb, p_channel text, p_paid boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_member boolean := (p_customer_id is not null);
  v_total numeric(12,2) := 0;
  v_line jsonb;
  v_unit uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_price numeric(12,2);
  v_order uuid;
begin
  if v_uid is null or not public.is_staff() then raise exception 'staff only'; end if;
  if p_channel not in ('cash', 'card', 'member_balance', 'shopify') then raise exception 'invalid channel'; end if;
  if p_channel = 'member_balance' and p_customer_id is null then raise exception 'member_balance requires a customer'; end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'empty cart'; end if;

  for v_line in select jsonb_array_elements(p_lines) loop
    v_unit := (v_line ->> 'unit_id')::uuid;
    v_start := (v_line ->> 'start_time')::timestamptz;
    v_end := (v_line ->> 'end_time')::timestamptz;
    if not public.units_available(array[v_unit], v_start, v_end) then raise exception 'slot unavailable'; end if;
    v_total := v_total + public.line_total(v_unit, v_start, v_end, v_member);
  end loop;

  if p_channel = 'member_balance' then
    update public.profiles set balance = balance - v_total, updated_at = now()
     where id = p_customer_id and balance >= v_total;
    if not found then raise exception 'insufficient balance'; end if;
  end if;

  insert into public.orders (customer_id, created_by, channel, status, total, paid_at)
  values (p_customer_id, v_uid, p_channel,
    case when p_channel = 'shopify' and not p_paid then 'pending_payment' else 'confirmed' end,
    v_total, case when p_channel = 'shopify' and not p_paid then null else now() end)
  returning id into v_order;

  for v_line in select jsonb_array_elements(p_lines) loop
    v_unit := (v_line ->> 'unit_id')::uuid;
    v_start := (v_line ->> 'start_time')::timestamptz;
    v_end := (v_line ->> 'end_time')::timestamptz;
    v_price := public.line_total(v_unit, v_start, v_end, v_member);
    insert into public.bookings (order_id, unit_id, start_time, end_time, price)
    values (v_order, v_unit, v_start, v_end, v_price);
  end loop;

  if p_channel = 'member_balance' then
    insert into public.transactions (member_id, type, amount, balance_after, order_id, note)
    select p_customer_id, 'deduct', -v_total, balance, v_order, 'booking (staff)'
      from public.profiles where id = p_customer_id;
  end if;

  return v_order;
end;
$$;

-- 23. Balance permission hardening (2026-11-01)
-- Existing installations: run this file once in Supabase SQL Editor.
-- Fresh installations: these definitions are also at the end of schema.sql.
begin;

-- SECURITY INVOKER is intentional: a direct REST update runs as authenticated,
-- while a checked SECURITY DEFINER RPC runs as the profiles table owner.
create or replace function public.protect_profile_fields() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if current_user <> pg_get_userbyid((select relowner from pg_class where oid = 'public.profiles'::regclass))
     and current_user <> 'service_role' then
    new.role := old.role;
    new.balance := old.balance;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.credit_balance(
  p_member_id uuid, p_amount numeric, p_note text default null,
  p_shopify_order_id text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_balance numeric(12,2);
begin
  -- An anonymous visitor ALSO has auth.uid() = null. Check the JWT role.
  if coalesce(auth.role(), '') <> 'service_role' and not coalesce(public.is_admin(), false) then
    raise exception 'admin or service only';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'amount must be positive and finite';
  end if;
  -- Serialize credits for a member. Check duplicates only after acquiring the lock.
  select balance into v_balance from public.profiles where id = p_member_id for update;
  if not found then raise exception 'member not found'; end if;
  if p_shopify_order_id is not null then
    -- A payment may only credit one member, even across concurrent requests.
    perform pg_advisory_xact_lock(hashtextextended(p_shopify_order_id, 0));
    if exists (select 1 from public.transactions where shopify_order_id = p_shopify_order_id) then
      return;
    end if;
  end if;
  update public.profiles set balance = balance + p_amount, updated_at = now()
    where id = p_member_id returning balance into v_balance;
  insert into public.transactions (member_id, type, amount, balance_after, shopify_order_id, note)
    values (p_member_id, 'topup', p_amount, v_balance, p_shopify_order_id, coalesce(p_note, 'topup'));
end;
$$;
revoke all on function public.credit_balance(uuid,numeric,text,text) from public, anon;
grant execute on function public.credit_balance(uuid,numeric,text,text) to authenticated, service_role;
commit;

-- 24. Public availability privacy
-- Reduce public access to booking data. No customer/order/payment identifiers
-- are returned by the public availability function.
begin;
drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings for select
  using (public.is_staff() or exists (
    select 1 from public.orders o where o.id = bookings.order_id
      and (o.customer_id = auth.uid() or o.created_by = auth.uid())
  ));

create or replace function public.get_booking_availability(p_start timestamptz, p_end timestamptz)
returns table (unit_id uuid, start_time timestamptz, end_time timestamptz, status text)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_start is null or p_end is null or p_end <= p_start
     or p_end - p_start > interval '31 days' then
    raise exception 'availability range must be between 0 and 31 days';
  end if;
  return query
    select b.unit_id, b.start_time, b.end_time, 'booked'::text
    from public.bookings b
    where b.status <> 'cancelled' and b.start_time < p_end and b.end_time > p_start;
end;
$$;
revoke all on function public.get_booking_availability(timestamptz,timestamptz) from public;
grant execute on function public.get_booking_availability(timestamptz,timestamptz) to anon, authenticated, service_role;

-- New, unlisted setting keys are not automatically public. Never store secrets
-- in this table; keep credentials in server-only secrets storage.
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select
  using (public.is_admin() or key in (
    'business_hours', 'cancellation_window_hours', 'no_show_penalty',
    'topup_tiers', 'default_locale', 'peak_pricing'
  ));
-- Raw class rows contain internal booking references; public pages use the
-- minimal occupancy API below or the existing curated course-list RPC.
drop policy if exists class_sessions_select on public.class_sessions;
create policy class_sessions_select on public.class_sessions for select using (public.is_staff());
create or replace function public.get_class_availability(p_start timestamptz, p_end timestamptz)
returns table (unit_id uuid, start_time timestamptz, end_time timestamptz, status text)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_start is null or p_end is null or p_end <= p_start
     or p_end - p_start > interval '31 days' then
    raise exception 'availability range must be between 0 and 31 days';
  end if;
  return query select s.unit_id, s.start_time, s.end_time, 'scheduled'::text
    from public.class_sessions s where s.status = 'scheduled'
    and s.start_time < p_end and s.end_time > p_start;
end;
$$;
revoke all on function public.get_class_availability(timestamptz,timestamptz) from public;
grant execute on function public.get_class_availability(timestamptz,timestamptz) to anon, authenticated, service_role;
commit;
