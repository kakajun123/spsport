import test from 'node:test';
import assert from 'node:assert/strict';
import { isPeak, slotPrice } from '../src/lib/pricing.ts';
import { melbourneToUtc, fmtMelbourne, addMelbourneDays, melbourneDayStartUtc } from '../src/lib/time.ts';
const pricing = { peak_multiplier: 1.3, weekday_peak: { start: '18:00', end: '22:00' }, weekend_peak: { start: '09:00', end: '22:00' } };
test('weekday pricing uses Melbourne time and excludes the end boundary', () => {
  assert.equal(isPeak(melbourneToUtc(2026, 10, 2, 17, 30), pricing), false);
  assert.equal(slotPrice(12, 15, false, melbourneToUtc(2026, 10, 2, 18, 0), pricing), 19.5);
  assert.equal(slotPrice(12, 15, true, melbourneToUtc(2026, 10, 2, 22, 0), pricing), 12);
});
test('weekend, no configuration, and updated server prices', () => {
  const time = melbourneToUtc(2026, 10, 1, 9, 0);
  assert.equal(slotPrice(12, 15, true, time, pricing), 15.600000000000001);
  assert.equal(slotPrice(12, 15, true, time, null), 12);
  assert.equal(slotPrice(12, 15, true, time, { ...pricing, peak_multiplier: 2 }), 24);
});
test('Melbourne dates span DST correctly independent of host timezone', () => {
  const start = { y: 2026, m: 9, d: 4 };
  assert.equal((+melbourneDayStartUtc(addMelbourneDays(start, 1)) - +melbourneDayStartUtc(start)) / 3600000, 23);
  assert.equal(fmtMelbourne(melbourneToUtc(2026, 10, 1, 9, 0)), '09:00');
});
