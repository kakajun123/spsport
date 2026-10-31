import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/202611010001_balance_permissions.sql', import.meta.url), 'utf8');
const member = '00000000-0000-0000-0000-000000000001';
const admin = '00000000-0000-0000-0000-000000000002';
const unit = '00000000-0000-0000-0000-000000000003';
function definition(name: string) {
  const start = schema.lastIndexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1);
  return schema.slice(start, schema.indexOf('$$;', start) + 3);
}
test('balance permissions, real booking RPC, and duplicate payment regression', async () => {
  const db = new PGlite();
  try {
    // Minimal relational fixture: function bodies below come from production SQL.
    // This is not a full Supabase/RLS or exclusion-constraint integration test.
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
      create function auth.role() returns text language sql as $$ select current_setting('test.role', true) $$;
      grant usage on schema auth to anon, authenticated, service_role;
      create table profiles(id uuid primary key, role text default 'member', balance numeric(12,2), updated_at timestamptz);
      create table transactions(id uuid default gen_random_uuid(), member_id uuid, type text, amount numeric, balance_after numeric, shopify_order_id text, note text, order_id uuid);
      create table orders(id uuid default gen_random_uuid() primary key, customer_id uuid, created_by uuid, channel text, status text, total numeric, paid_at timestamptz);
      create table bookings(id uuid default gen_random_uuid(), order_id uuid, unit_id uuid, start_time timestamptz, end_time timestamptz, price numeric, status text default 'booked');
      create table settings(key text primary key, value jsonb);
      create table resources(id uuid primary key, price_member numeric, price_non_member numeric);
      create table resource_units(id uuid primary key, resource_id uuid);
      insert into profiles values ('${member}', 'member', 100, now()), ('${admin}', 'admin', 0, now());
      insert into resources values ('${unit}', 12, 15);
      insert into resource_units values ('${unit}', '${unit}');
      grant select, update on profiles to authenticated;
      ${definition('is_admin')}
      ${definition('units_available')}
      ${definition('peak_multiplier')}
      ${definition('line_total')}
      ${definition('create_booking_balance_cart')}
      ${migration}
      create trigger protect_profile_fields before update on profiles for each row execute function protect_profile_fields();
    `);
    const balance = async () => Number((await db.query<{ balance: string }>(`select balance from profiles where id='${member}'`)).rows[0].balance);
    const identity = async (role: string, uid = '') => db.exec(`reset role; set test.uid='${uid}'; set test.role='${role}'; set role ${role};`);
    await identity('anon');
    await assert.rejects(db.exec(`select credit_balance('${member}', 500);`), /permission denied/);
    await identity('authenticated', member);
    await assert.rejects(db.exec(`select credit_balance('${member}', 500);`), /admin or service only/);
    await db.exec(`update profiles set role='admin', balance=9999 where id='${member}';`);
    await db.exec('reset role');
    assert.equal(await balance(), 100);
    assert.equal((await db.query<{role:string}>(`select role from profiles where id='${member}'`)).rows[0].role, 'member');
    await identity('authenticated', member);
    const lines = JSON.stringify([{ unit_id: unit, start_time: '2026-11-02T07:00:00Z', end_time: '2026-11-02T08:00:00Z' }]);
    await db.query('select create_booking_balance_cart($1::jsonb)', [lines]);
    await db.exec('reset role');
    assert.equal(await balance(), 76, 'booking RPC actually deducts the balance');
    await identity('service_role');
    await db.exec(`select credit_balance('${member}', 50, 'test', 'stripe:test-1'); select credit_balance('${member}', 50, 'test', 'stripe:test-1');`);
    await db.exec('reset role');
    assert.equal(await balance(), 126, 'webhook retry credits exactly once');
    assert.equal((await db.query<{n:number}>(`select count(*)::int as n from transactions where shopify_order_id='stripe:test-1'`)).rows[0].n, 1);
    await identity('authenticated', admin);
    await db.exec(`select credit_balance('${member}', 10);`);
    await assert.rejects(db.exec(`select credit_balance('${member}', null);`), /positive and finite/);
    await db.exec('reset role');
    assert.equal(await balance(), 136);
  } finally { await db.close(); }
});
