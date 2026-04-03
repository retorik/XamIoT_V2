// src/__tests__/ruleEngine.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ruleMatches, readField, renderTemplate } from '../mqttWorker.js';

describe('ruleMatches — opérateurs numériques', () => {
  test('should return true when value > threshold', () => {
    assert.equal(ruleMatches(80, '>', 70, null), true);
  });

  test('should return false when value == threshold with >', () => {
    assert.equal(ruleMatches(70, '>', 70, null), false);
  });

  test('should return true when value >= threshold', () => {
    assert.equal(ruleMatches(70, '>=', 70, null), true);
  });

  test('should return true when value < threshold', () => {
    assert.equal(ruleMatches(30, '<', 50, null), true);
  });

  test('should return false when value > threshold with <', () => {
    assert.equal(ruleMatches(80, '<', 50, null), false);
  });

  test('should return true when value <= threshold', () => {
    assert.equal(ruleMatches(50, '<=', 50, null), true);
  });

  test('should return true when value == threshold with ==', () => {
    assert.equal(ruleMatches(42, '==', 42, null), true);
  });

  test('should return true when value != threshold', () => {
    assert.equal(ruleMatches(42, '!=', 43, null), true);
  });

  test('should return false when value is non-numeric with numeric threshold', () => {
    assert.equal(ruleMatches('abc', '>', 10, null), false);
  });

  test('should return false when value is undefined with numeric threshold', () => {
    assert.equal(ruleMatches(undefined, '>', 10, null), false);
  });
});

describe('ruleMatches — opérateurs string', () => {
  test('should return true when value contains substring', () => {
    assert.equal(ruleMatches('alarm_triggered', 'contains', null, 'alarm'), true);
  });

  test('should return false when value does not contain substring', () => {
    assert.equal(ruleMatches('ok', 'contains', null, 'alarm'), false);
  });

  test('should return true when value does not contain substring with notcontains', () => {
    assert.equal(ruleMatches('ok', 'notcontains', null, 'alarm'), true);
  });

  test('should return true when value equals string with ==', () => {
    assert.equal(ruleMatches('active', '==', null, 'active'), true);
  });

  test('should be case-insensitive for string comparison', () => {
    assert.equal(ruleMatches('ACTIVE', '==', null, 'active'), true);
  });

  test('should return true when value != string', () => {
    assert.equal(ruleMatches('inactive', '!=', null, 'active'), true);
  });
});

describe('ruleMatches — opérateur inconnu', () => {
  test('should return false for unknown operator', () => {
    assert.equal(ruleMatches(80, 'startswith', 70, null), false);
  });
});

describe('renderTemplate — rendu des templates de notification', () => {
  const vars = {
    device_name:   'Salon',
    field_label:   'Niveau sonore',
    unit:          '%',
    op:            '>',
    threshold:     '70',
    current_value: '82',
  };

  test('should replace all known variables', () => {
    const result = renderTemplate('{device_name} — {field_label} {op} {threshold} {unit}', vars);
    assert.equal(result, 'Salon — Niveau sonore > 70 %');
  });

  test('should keep unknown variables as-is', () => {
    const result = renderTemplate('{device_name} {unknown}', vars);
    assert.equal(result, 'Salon {unknown}');
  });

  test('should handle template with no variables', () => {
    const result = renderTemplate('Alerte fixe !', vars);
    assert.equal(result, 'Alerte fixe !');
  });

  test('should replace multiple occurrences of same variable', () => {
    const result = renderTemplate('{current_value} {unit} (seuil {threshold} {unit})', vars);
    assert.equal(result, '82 % (seuil 70 %)');
  });

  test('should render SoundSense body template correctly', () => {
    const tpl = 'Seuil {op} {threshold} {unit} avec {current_value} {unit}. Périphérique : {device_name}.';
    const result = renderTemplate(tpl, vars);
    assert.equal(result, 'Seuil > 70 % avec 82 %. Périphérique : Salon.');
  });
});

describe('readField — lecture insensible à la casse', () => {
  test('should return value when key matches exactly', () => {
    assert.equal(readField({ soundPct: 75 }, 'soundPct'), 75);
  });

  test('should return value when key matches case-insensitively', () => {
    assert.equal(readField({ SoundPCT: 75 }, 'soundpct'), 75);
  });

  test('should return undefined when key is absent', () => {
    assert.equal(readField({ temperature: 22 }, 'soundPct'), undefined);
  });

  test('should return undefined when obj is null', () => {
    assert.equal(readField(null, 'soundPct'), undefined);
  });

  test('should return undefined when obj is not an object', () => {
    assert.equal(readField('string', 'soundPct'), undefined);
  });

  test('should not confuse soundPct with soundPctAvg', () => {
    const obj = { soundPct: 75, soundPctAvg: 60 };
    assert.equal(readField(obj, 'soundPct'), 75);
    assert.equal(readField(obj, 'soundPctAvg'), 60);
  });
});
