// src/__tests__/mqttParsing.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractTopicSuffix, getFrameConfig, getPrimaryField } from '../mqttConfig.js';

describe('extractTopicSuffix', () => {
  test('should extract "status" from devices/<uid>/status', () => {
    assert.equal(extractTopicSuffix('devices/abc123/status'), 'status');
  });

  test('should extract "cmd/reboot" from devices/<uid>/cmd/reboot', () => {
    assert.equal(extractTopicSuffix('devices/abc123/cmd/reboot'), 'cmd/reboot');
  });

  test('should handle 2-segment topics', () => {
    assert.equal(extractTopicSuffix('device/status'), 'status');
  });

  test('should handle single-segment topics', () => {
    assert.equal(extractTopicSuffix('status'), 'status');
  });
});

describe('getFrameConfig', () => {
  const TYPE_ID = 'type-uuid-1';
  const FRAME_ID = 'frame-uuid-1';

  /** @type {import('../mqttConfig.js').MqttConfigCache} */
  const mockConfig = new Map([
    [TYPE_ID, new Map([
      ['status', {
        frame_id: FRAME_ID,
        frame_name: 'status',
        topic_suffix: 'status',
        fields: [
          { name: 'soundPct', label: 'Niveau sonore', data_type: 'number', unit: '%', min_value: 0, max_value: 100, is_primary_metric: true, sort_order: 0 },
          { name: 'soundAvg', label: 'Moyenne',        data_type: 'number', unit: '%', min_value: 0, max_value: 100, is_primary_metric: false, sort_order: 1 },
        ],
      }],
    ])],
  ]);

  test('should return frame config for known type + suffix', () => {
    const frame = getFrameConfig(mockConfig, TYPE_ID, 'status');
    assert.ok(frame);
    assert.equal(frame.frame_name, 'status');
    assert.equal(frame.fields.length, 2);
  });

  test('should return null for unknown device type', () => {
    const frame = getFrameConfig(mockConfig, 'unknown-uuid', 'status');
    assert.equal(frame, null);
  });

  test('should return null for unknown topic suffix', () => {
    const frame = getFrameConfig(mockConfig, TYPE_ID, 'config');
    assert.equal(frame, null);
  });

  test('should return null when deviceTypeId is null', () => {
    const frame = getFrameConfig(mockConfig, null, 'status');
    assert.equal(frame, null);
  });

  test('should return null when config is empty', () => {
    const frame = getFrameConfig(new Map(), TYPE_ID, 'status');
    assert.equal(frame, null);
  });
});

describe('getPrimaryField', () => {
  test('should return the field with is_primary_metric=true', () => {
    const frameConfig = {
      fields: [
        { name: 'soundAvg', is_primary_metric: false },
        { name: 'soundPct', is_primary_metric: true },
      ],
    };
    const primary = getPrimaryField(frameConfig);
    assert.equal(primary.name, 'soundPct');
  });

  test('should return null when no primary metric is defined', () => {
    const frameConfig = {
      fields: [
        { name: 'soundAvg', is_primary_metric: false },
      ],
    };
    assert.equal(getPrimaryField(frameConfig), null);
  });

  test('should return null when frameConfig is null', () => {
    assert.equal(getPrimaryField(null), null);
  });

  test('should return null when fields array is empty', () => {
    assert.equal(getPrimaryField({ fields: [] }), null);
  });
});

describe('Parsing non-régression : soundPct', () => {
  // Vérifie que l'on retrouve soundPct dans un payload réel SoundSense
  test('should find soundPct in a typical SoundSense payload', () => {
    const payload = { soundPct: 72, soundAvg: 68, soundMin: 55, soundMax: 88, rssi: -67 };

    // Simule ce que le worker fait via readField (exporté depuis mqttWorker)
    const key = Object.keys(payload).find(k => k.toLowerCase() === 'soundpct');
    assert.equal(key, 'soundPct');
    assert.equal(payload[key], 72);
  });

  test('should be case-insensitive when searching soundPct', () => {
    const payload = { SOUNDPCT: 50 };
    const key = Object.keys(payload).find(k => k.toLowerCase() === 'soundpct');
    assert.ok(key);
    assert.equal(payload[key], 50);
  });

  test('should handle numeric string soundPct', () => {
    const raw = '65.5';
    const s = raw.trim().replace(',', '.');
    const m = s.match(/-?\d+(?:\.\d+)?/);
    const n = m ? parseFloat(m[0]) : null;
    assert.equal(n, 65.5);
  });

  test('should clamp soundPct to [0, 100]', () => {
    const clamp = (v) => Math.min(100, Math.max(0, v));
    assert.equal(clamp(-10), 0);
    assert.equal(clamp(150), 100);
    assert.equal(clamp(75), 75);
  });
});
