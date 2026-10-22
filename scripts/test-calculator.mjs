// Test calculator helpers and date safety

import assert from 'assert';

function toValidDate(d) {
  if (!d) return new Date();
  if (d instanceof Date) return isNaN(d.getTime()) ? new Date() : d;
  if (typeof d === 'string' || typeof d === 'number') {
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  return new Date();
}

function calculateAgingDays(createdTime, referenceDate) {
  const c = toValidDate(createdTime);
  const r = toValidDate(referenceDate);
  const diffMs = r.getTime() - c.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function normalizeResponsibleTeam(resp, contextStr = '') {
  const raw = (resp || '').trim();
  if (!raw) return '';
  const lower = `${raw} ${contextStr}`.toLowerCase();
  const isISS =
    raw === 'ISS' ||
    raw === 'ECS ISS' ||
    raw === 'ISS MT' ||
    raw === 'ISS Binondo' ||
    raw === 'ISS Makati' ||
    lower.includes('iss');

  if (isISS) {
    if (lower.includes('binondo')) return 'ISS Binondo';
    return 'ISS MT';
  }
  return raw;
}

console.log('--- Testing Calculator & Normalization Rules ---');

// 1. Date string safety
const ref = new Date('2026-10-20T10:00:00Z');
const strDate = '2026-10-10T10:00:00Z';
const days = calculateAgingDays(strDate, ref);
assert.strictEqual(days, 10, 'Should correctly calculate 10 days difference from string date');
console.log('✓ calculateAgingDays handles string dates safely without .getTime() exception');

// 2. Binondo / MT ISS rule
const resp1 = normalizeResponsibleTeam('ISS', 'SM City Binondo pos issue');
assert.strictEqual(resp1, 'ISS Binondo', 'Should assign ISS Binondo when Binondo is in context');

const resp2 = normalizeResponsibleTeam('ISS', 'SM Megamall terminal');
assert.strictEqual(resp2, 'ISS MT', 'Should assign ISS MT when Binondo is not mentioned');

const resp3 = normalizeResponsibleTeam('ECS ISS', '');
assert.strictEqual(resp3, 'ISS MT', 'Should never allow plain ISS or ECS ISS, defaults to ISS MT');

console.log('✓ ISS team rules verified: Binondo context -> "ISS Binondo", other ISS -> "ISS MT"');
console.log('🎉 ALL CALCULATOR TESTS PASSED!');
