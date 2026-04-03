// src/__tests__/campaigns.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCampaignPayload,
  buildRecipientsFilter,
  aggregateSendResults,
} from '../campaignService.js';

// ─────────────────────────────────────────────
// validateCampaignPayload
// ─────────────────────────────────────────────
describe('validateCampaignPayload', () => {
  const base = {
    send_types: ['push'],
    body: 'Bonjour',
    title: 'Alerte',
    user_ids: ['user-uuid-1'],
  };

  test('should return ok for valid push payload', () => {
    assert.deepEqual(validateCampaignPayload(base), { ok: true });
  });

  test('should return ok for valid email-only payload (no title required)', () => {
    assert.deepEqual(
      validateCampaignPayload({ ...base, send_types: ['email'], title: '' }),
      { ok: true }
    );
  });

  test('should return ok for push+email payload', () => {
    assert.deepEqual(
      validateCampaignPayload({ ...base, send_types: ['push', 'email'] }),
      { ok: true }
    );
  });

  test('should fail when send_types is empty array', () => {
    const r = validateCampaignPayload({ ...base, send_types: [] });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'send_types_required');
  });

  test('should fail when send_types is not an array', () => {
    const r = validateCampaignPayload({ ...base, send_types: 'push' });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'send_types_required');
  });

  test('should fail when send_types is null', () => {
    const r = validateCampaignPayload({ ...base, send_types: null });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'send_types_required');
  });

  test('should fail when send_types contains invalid type', () => {
    const r = validateCampaignPayload({ ...base, send_types: ['sms'] });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'invalid_send_type');
  });

  test('should fail when send_types mixes valid and invalid', () => {
    const r = validateCampaignPayload({ ...base, send_types: ['push', 'sms'] });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'invalid_send_type');
  });

  test('should fail when body is empty string', () => {
    const r = validateCampaignPayload({ ...base, body: '' });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'body_required');
  });

  test('should fail when body is whitespace only', () => {
    const r = validateCampaignPayload({ ...base, body: '   ' });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'body_required');
  });

  test('should fail when push but title is empty', () => {
    const r = validateCampaignPayload({ ...base, title: '' });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'title_required_for_push');
  });

  test('should fail when push but title is whitespace only', () => {
    const r = validateCampaignPayload({ ...base, title: '   ' });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'title_required_for_push');
  });

  test('should not require title for email-only', () => {
    const r = validateCampaignPayload({ ...base, send_types: ['email'], title: '' });
    assert.equal(r.ok, true);
  });

  test('should fail when user_ids is empty', () => {
    const r = validateCampaignPayload({ ...base, user_ids: [] });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'user_ids_required');
  });

  test('should fail when user_ids is not an array', () => {
    const r = validateCampaignPayload({ ...base, user_ids: 'user-1' });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'user_ids_required');
  });

  test('should fail when user_ids exceeds 1000', () => {
    const r = validateCampaignPayload({ ...base, user_ids: Array(1001).fill('uuid') });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'too_many_recipients');
  });

  test('should accept exactly 1000 user_ids', () => {
    const r = validateCampaignPayload({ ...base, user_ids: Array(1000).fill('uuid') });
    assert.equal(r.ok, true);
  });
});

// ─────────────────────────────────────────────
// buildRecipientsFilter
// ─────────────────────────────────────────────
describe('buildRecipientsFilter', () => {
  test('should return base active filter with no params when called with empty object', () => {
    const { where, params, nextIndex } = buildRecipientsFilter({});
    assert.deepEqual(where, ['u.is_active = true']);
    assert.deepEqual(params, []);
    assert.equal(nextIndex, 1);
  });

  test('should return base filter when called with no argument', () => {
    const { where, params } = buildRecipientsFilter();
    assert.deepEqual(where, ['u.is_active = true']);
    assert.deepEqual(params, []);
  });

  test('should add search filter with ILIKE param', () => {
    const { where, params, nextIndex } = buildRecipientsFilter({ search: 'alice' });
    assert.equal(where.length, 2);
    assert.equal(params[0], '%alice%');
    assert.equal(nextIndex, 2);
    assert.ok(where[1].includes('ILIKE'));
  });

  test('should trim search before applying', () => {
    const { params } = buildRecipientsFilter({ search: '  Alice  ' });
    assert.equal(params[0], '%Alice%');
  });

  test('should skip empty search', () => {
    const { where, params } = buildRecipientsFilter({ search: '   ' });
    assert.equal(where.length, 1);
    assert.equal(params.length, 0);
  });

  test('should add esp_type_id filter', () => {
    const { where, params, nextIndex } = buildRecipientsFilter({ esp_type_id: 'type-uuid' });
    assert.equal(params[0], 'type-uuid');
    assert.equal(nextIndex, 2);
    assert.ok(where.some(w => w.includes('device_type_id')));
  });

  test('should add mobile_platform filter', () => {
    const { where, params } = buildRecipientsFilter({ mobile_platform: 'iOS' });
    assert.equal(params[0], 'iOS');
    assert.ok(where.some(w => w.includes('m.platform')));
  });

  test('should add has_push filter without consuming a param index', () => {
    const { where, params, nextIndex } = buildRecipientsFilter({ has_push: 'true' });
    assert.equal(where.length, 2);
    assert.equal(params.length, 0);
    assert.equal(nextIndex, 1);
    assert.ok(where.some(w => w.includes('apns_token')));
  });

  test('should not add has_push filter when value is not "true"', () => {
    const { where } = buildRecipientsFilter({ has_push: 'false' });
    assert.equal(where.length, 1);
    const { where: w2 } = buildRecipientsFilter({ has_push: '' });
    assert.equal(w2.length, 1);
  });

  test('should combine search + esp_type_id + mobile_platform + has_push', () => {
    const { where, params, nextIndex } = buildRecipientsFilter({
      search: 'bob',
      esp_type_id: 'type-uuid',
      mobile_platform: 'Android',
      has_push: 'true',
    });
    assert.equal(where.length, 5); // base + search + esp + platform + has_push
    assert.equal(params.length, 3); // search, esp_type_id, mobile_platform
    assert.equal(nextIndex, 4);
  });

  test('should use sequential param indices', () => {
    const { where } = buildRecipientsFilter({ search: 'x', esp_type_id: 'y', mobile_platform: 'iOS' });
    assert.ok(where[1].includes('$1')); // search
    assert.ok(where[2].includes('$2')); // esp_type_id
    assert.ok(where[3].includes('$3')); // mobile_platform
  });
});

// ─────────────────────────────────────────────
// aggregateSendResults
// ─────────────────────────────────────────────
describe('aggregateSendResults', () => {
  test('should return zeros for empty results', () => {
    assert.deepEqual(aggregateSendResults([]), {
      success_push: 0, fail_push: 0,
      success_email: 0, fail_email: 0,
    });
  });

  test('should count push successes', () => {
    const r = aggregateSendResults([
      { channel: 'push', ok: true },
      { channel: 'push', ok: true },
    ]);
    assert.equal(r.success_push, 2);
    assert.equal(r.fail_push, 0);
  });

  test('should count push failures', () => {
    const r = aggregateSendResults([{ channel: 'push', ok: false }]);
    assert.equal(r.fail_push, 1);
    assert.equal(r.success_push, 0);
  });

  test('should count email successes', () => {
    const r = aggregateSendResults([{ channel: 'email', ok: true }]);
    assert.equal(r.success_email, 1);
    assert.equal(r.fail_email, 0);
  });

  test('should count email failures', () => {
    const r = aggregateSendResults([{ channel: 'email', ok: false }]);
    assert.equal(r.fail_email, 1);
    assert.equal(r.success_email, 0);
  });

  test('should handle mixed push and email results', () => {
    const r = aggregateSendResults([
      { channel: 'push', ok: true },
      { channel: 'push', ok: false },
      { channel: 'email', ok: true },
      { channel: 'email', ok: true },
      { channel: 'email', ok: false },
    ]);
    assert.equal(r.success_push, 1);
    assert.equal(r.fail_push, 1);
    assert.equal(r.success_email, 2);
    assert.equal(r.fail_email, 1);
  });

  test('should ignore unknown channels', () => {
    const r = aggregateSendResults([{ channel: 'sms', ok: true }]);
    assert.deepEqual(r, { success_push: 0, fail_push: 0, success_email: 0, fail_email: 0 });
  });

  test('should handle users without push token (no mobile_devices)', () => {
    // Simule un utilisateur avec 0 succès et 1 echec push (token absent)
    const r = aggregateSendResults([{ channel: 'push', ok: false }]);
    assert.equal(r.fail_push, 1);
  });

  test('should handle users without email', () => {
    const r = aggregateSendResults([{ channel: 'email', ok: false }]);
    assert.equal(r.fail_email, 1);
  });

  test('should handle large result sets', () => {
    const results = [
      ...Array(500).fill({ channel: 'push', ok: true }),
      ...Array(50).fill({ channel: 'push', ok: false }),
      ...Array(300).fill({ channel: 'email', ok: true }),
      ...Array(30).fill({ channel: 'email', ok: false }),
    ];
    const r = aggregateSendResults(results);
    assert.equal(r.success_push, 500);
    assert.equal(r.fail_push, 50);
    assert.equal(r.success_email, 300);
    assert.equal(r.fail_email, 30);
  });
});
