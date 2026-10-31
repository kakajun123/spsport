import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { findingsFor, identitySafe, sourceFiles } from '../scripts/privacy-check.mjs';
import { paymentReleaseBlock, paymentsReady } from '../supabase/functions/_shared/payment-gate.ts';

test('privacy scanner rejects secret, identity and export fixtures without revealing values', () => {
  assert.ok(findingsFor('sample.ts', 'gh' + 'p_' + 'x'.repeat(40)).includes('service-token'));
  assert.ok(findingsFor('sample.ts', ['person', 'mail.invalid'].join('@')).includes('non-example-email'));
  assert.ok(findingsFor('.env.production', '').includes('environment-file'));
  assert.ok(findingsFor('customer.csv', '').includes('restricted-file'));
  assert.deepEqual(findingsFor('sample.ts', 'member001@example.com'), []);
  assert.equal(identitySafe('spsport', 'opensource@example.com'), true);
  assert.equal(identitySafe('sp sport kakajun', 'opensource@example.com'), true);
  assert.equal(identitySafe('sp sport kakajun', ['person', 'mail.invalid'].join('@')), false);
  assert.equal(identitySafe('personal', 'opensource@example.com'), false);
});

test('ZIP download privacy checks work without Git and include hidden configuration', () => {
  const root = mkdtempSync(join(tmpdir(), 'spsport-zip-test-'));
  try {
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'node_modules'));
    writeFileSync(join(root, 'src', 'demo.ts'), 'example');
    writeFileSync(join(root, '.env.local'), '');
    writeFileSync(join(root, 'node_modules', 'dependency.js'), 'generated');
    assert.deepEqual(sourceFiles(root).sort(), ['.env.local', 'src/demo.ts']);
    assert.ok(findingsFor('.npmrc', '').includes('restricted-file'));
    const script = join(root, 'privacy-check.mjs');
    writeFileSync(script, readFileSync(new URL('../scripts/privacy-check.mjs', import.meta.url)));
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(result.stdout).findings, [{ path: '.env.local', rule: 'environment-file' }]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('unreviewed online payments fail closed before reading secrets or handling orders', async () => {
  assert.equal(paymentsReady(), false);
  const response = paymentReleaseBlock();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'PAYMENTS_NOT_RELEASED');
  const root = new URL('../supabase/functions/', import.meta.url);
  for (const dir of readdirSync(root).filter((name) => !name.startsWith('_'))) {
    const source = readFileSync(new URL(`${dir}/index.ts`, root), 'utf8');
    const guard = source.indexOf('if (!paymentsReady()) return paymentReleaseBlock();');
    assert.ok(guard > 0 && guard < source.indexOf('Deno.env.get('), dir);
  }
});

test('availability RLS hides other customers and internal identifiers, including raw class rows', async () => {
  const db = new PGlite();
  const uid1 = '00000000-0000-0000-0000-000000000001';
  const uid2 = '00000000-0000-0000-0000-000000000002';
  const staff = '00000000-0000-0000-0000-000000000003';
  const order1 = '00000000-0000-0000-0000-000000000011';
  const order2 = '00000000-0000-0000-0000-000000000012';
  const unit = '00000000-0000-0000-0000-000000000021';
  try {
    const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
    function definition(name: string) {
      const start = schema.lastIndexOf(`create or replace function public.${name}(`);
      return schema.slice(start, schema.indexOf('$$;', start) + 3);
    }
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      grant usage on schema auth to anon, authenticated, service_role;
      create table profiles(id uuid, role text);
      insert into profiles values ('${uid1}','member'),('${uid2}','member'),('${staff}','admin');
      ${definition('is_admin')}
      ${definition('is_staff')}
      create table orders(id uuid, customer_id uuid, created_by uuid);
      create table bookings(id uuid default gen_random_uuid(), order_id uuid, unit_id uuid, start_time timestamptz, end_time timestamptz, status text, price numeric);
      create table settings(key text, value jsonb);
      create table class_sessions(id uuid default gen_random_uuid(), booking_id uuid, unit_id uuid, start_time timestamptz, end_time timestamptz, status text, coach_name text);
      insert into orders values ('${order1}','${uid1}','${uid1}'),('${order2}','${uid2}','${uid2}');
      insert into bookings(order_id,unit_id,start_time,end_time,status,price) values
        ('${order1}','${unit}','2026-11-02T00:00Z','2026-11-02T01:00Z','booked',24),
        ('${order2}','${unit}','2026-11-02T02:00Z','2026-11-02T03:00Z','cancelled',24);
      insert into class_sessions(unit_id,start_time,end_time,status,coach_name) values ('${unit}','2026-11-02T05:00Z','2026-11-02T06:00Z','scheduled','Demo coach 001');
      insert into settings values ('business_hours','{}'),('private_note','"test only"');
      alter table bookings enable row level security;
      alter table settings enable row level security;
      alter table orders enable row level security;
      alter table class_sessions enable row level security;
      create policy orders_select on orders for select using (customer_id=auth.uid() or created_by=auth.uid() or is_staff());
      grant select on orders, bookings, class_sessions, settings to anon, authenticated;
      ${readFileSync(new URL('../supabase/migrations/202611010002_booking_privacy.sql', import.meta.url),'utf8')}
    `);
    await db.exec("set test.uid=''; set role anon;");
    assert.equal((await db.query('select * from bookings')).rows.length, 0);
    assert.equal((await db.query('select * from class_sessions')).rows.length, 0);
    assert.equal((await db.query('select * from settings')).rows.length, 1);
    const available = await db.query("select * from get_booking_availability('2026-11-02T00:00Z','2026-11-03T00:00Z')");
    assert.equal(available.rows.length, 1);
    assert.deepEqual(Object.keys(available.rows[0]).sort(), ['end_time','start_time','status','unit_id']);
    const classes = await db.query("select * from get_class_availability('2026-11-02T00:00Z','2026-11-03T00:00Z')");
    assert.deepEqual(Object.keys(classes.rows[0]).sort(), ['end_time','start_time','status','unit_id']);
    await assert.rejects(db.exec("select * from get_booking_availability(null,null)"), /availability range/);
    await assert.rejects(db.exec("select * from get_booking_availability('2026-01-01','2027-01-01')"), /availability range/);
    await db.exec(`reset role; set test.uid='${uid1}'; set role authenticated;`);
    assert.equal((await db.query('select * from bookings')).rows.length, 1);
    await db.exec(`reset role; set test.uid='${uid2}'; set role authenticated;`);
    assert.equal((await db.query('select * from bookings')).rows.length, 1);
    assert.equal((await db.query<{order_id:string}>('select * from bookings')).rows[0].order_id, order2);
    await db.exec(`reset role; set test.uid='${staff}'; set role authenticated;`);
    assert.equal((await db.query('select * from bookings')).rows.length, 2);
    assert.equal((await db.query('select * from class_sessions')).rows.length, 1);
    assert.equal((await db.query('select * from settings')).rows.length, 2);
  } finally { await db.close(); }
});
