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
