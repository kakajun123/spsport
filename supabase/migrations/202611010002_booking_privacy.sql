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
