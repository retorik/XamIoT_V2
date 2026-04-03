// src/__tests__/deviceMeta.test.js
// Tests unitaires pour la logique de déduplications des champs et templates
// et le comportement du picker de types d'alerte (iOS/backoffice)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// --- Simulation de la logique DISTINCT ON côté JS (mirror du SQL) ---

function dedupFieldsByName(rawFields) {
  // Simule DISTINCT ON (ff.name) ORDER BY ff.name, fd.topic_suffix
  const sorted = [...rawFields].sort((a, b) =>
    a.name.localeCompare(b.name) || (a.topic_suffix || '').localeCompare(b.topic_suffix || '')
  );
  const seen = new Set();
  return sorted.filter(f => {
    if (seen.has(f.name)) return false;
    seen.add(f.name);
    return true;
  });
}

function dedupTemplatesById(rawTemplates) {
  // Simule DISTINCT ON (t.id) ORDER BY t.id
  const seen = new Set();
  return rawTemplates.filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

function buildTemplateLabel(tpl, multiFrame) {
  // Miroir de la logique iOS DeviceDetailView.swift
  return (multiFrame && tpl.frame_name != null)
    ? `${tpl.frame_name} : ${tpl.name}`
    : tpl.name;
}

function isMultiFrame(templates) {
  // Miroir de la logique iOS : Set des frame_name non-null
  return new Set(templates.map(t => t.frame_name).filter(Boolean)).size > 1;
}

// ──────────────────────────────────────────────────────────────────────────────
// available_fields — déduplication
// ──────────────────────────────────────────────────────────────────────────────

describe('available_fields — déduplication des champs multi-trames', () => {
  test('should return unique field names when same field appears in multiple frames', () => {
    const rawFields = [
      { name: 'soundPct', label: 'Niveau sonore',       data_type: 'number', topic_suffix: 'status' },
      { name: 'soundPct', label: 'Niveau en temps réel', data_type: 'number', topic_suffix: 'status-legacy' },
      { name: 'soundAvg', label: 'Moyenne sonore',       data_type: 'number', topic_suffix: 'status' },
    ];

    const deduped = dedupFieldsByName(rawFields);
    assert.equal(deduped.length, 2, 'should keep only 2 unique fields');
  });

  test('should keep the first occurrence by topic_suffix when deduplicating', () => {
    const rawFields = [
      { name: 'soundPct', label: 'Niveau sonore',       topic_suffix: 'status' },
      { name: 'soundPct', label: 'Niveau en temps réel', topic_suffix: 'status-legacy' },
    ];
    const deduped = dedupFieldsByName(rawFields);
    assert.equal(deduped[0].label, 'Niveau sonore', 'should prefer status over status-legacy');
  });

  test('should not deduplicate fields with different names', () => {
    const rawFields = [
      { name: 'soundPct', label: 'Niveau sonore', topic_suffix: 'status' },
      { name: 'soundAvg', label: 'Moyenne',       topic_suffix: 'status' },
      { name: 'soundMin', label: 'Minimum',       topic_suffix: 'status' },
    ];
    const deduped = dedupFieldsByName(rawFields);
    assert.equal(deduped.length, 3, 'all unique fields should be kept');
  });

  test('should return empty array when input is empty', () => {
    assert.deepEqual(dedupFieldsByName([]), []);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// rule_templates — déduplication des templates
// ──────────────────────────────────────────────────────────────────────────────

describe('rule_templates — déduplication par id de template', () => {
  test('should not return duplicate templates when same field in multiple frames', () => {
    const rawTemplates = [
      { id: 'uuid-1', name: 'Bruit modéré',   field: 'soundPct', frame_name: 'status' },
      { id: 'uuid-1', name: 'Bruit modéré',   field: 'soundPct', frame_name: 'status-legacy' },
    ];
    const deduped = dedupTemplatesById(rawTemplates);
    assert.equal(deduped.length, 1, 'duplicate template should be removed');
  });

  test('should keep distinct templates with different ids', () => {
    const rawTemplates = [
      { id: 'uuid-1', name: 'Bruit modéré',   field: 'soundPct', frame_name: 'status' },
      { id: 'uuid-2', name: 'Alerte maximum', field: 'soundMax', frame_name: 'status' },
    ];
    const deduped = dedupTemplatesById(rawTemplates);
    assert.equal(deduped.length, 2);
  });

  test('should include frame_name field in template', () => {
    const rawTemplates = [
      { id: 'uuid-1', name: 'Bruit modéré', field: 'soundPct', frame_name: 'status' },
    ];
    const deduped = dedupTemplatesById(rawTemplates);
    assert.ok('frame_name' in deduped[0], 'frame_name should be present in template');
    assert.equal(deduped[0].frame_name, 'status');
  });

  test('should accept null frame_name when field not in any frame', () => {
    const rawTemplates = [
      { id: 'uuid-1', name: 'Bruit modéré', field: 'soundPct', frame_name: null },
    ];
    const deduped = dedupTemplatesById(rawTemplates);
    assert.equal(deduped[0].frame_name, null);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Logique iOS — suppression de "Aucun" + défaut sur premier template
// ──────────────────────────────────────────────────────────────────────────────

describe('iOS picker — suppression du choix Aucun', () => {
  const templates = [
    { id: 'uuid-1', name: 'Bruit modéré', frame_name: 'status' },
    { id: 'uuid-2', name: 'Bruit fort',   frame_name: 'status' },
  ];

  test('should default to first template when templateId is null', () => {
    const templateId = null;
    const selectedId = templateId ?? templates[0]?.id ?? '';
    assert.equal(selectedId, 'uuid-1', 'null templateId should fall back to first template');
  });

  test('should keep existing templateId when already set', () => {
    const templateId = 'uuid-2';
    const selectedId = templateId ?? templates[0]?.id ?? '';
    assert.equal(selectedId, 'uuid-2', 'set templateId should be preserved');
  });

  test('should never produce empty string selection when templates exist', () => {
    const templateId = null;
    const selectedId = templateId ?? templates[0]?.id ?? '';
    assert.notEqual(selectedId, '', 'selection should never be empty when templates exist');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Logique iOS — affichage multi-trame "NomTrame : NomTemplate"
// ──────────────────────────────────────────────────────────────────────────────

describe('iOS picker — affichage multi-trame', () => {
  test('should show plain name when only one frame is present', () => {
    const templates = [
      { id: '1', name: 'Bruit modéré',   frame_name: 'status' },
      { id: '2', name: 'Bruit fort',     frame_name: 'status' },
    ];
    assert.equal(isMultiFrame(templates), false);
    assert.equal(buildTemplateLabel(templates[0], false), 'Bruit modéré');
    assert.equal(buildTemplateLabel(templates[1], false), 'Bruit fort');
  });

  test('should show frame prefix when multiple frames are present', () => {
    const templates = [
      { id: '1', name: 'Bruit modéré',      frame_name: 'status' },
      { id: '2', name: 'Alerte temps réel', frame_name: 'status-legacy' },
    ];
    assert.equal(isMultiFrame(templates), true);
    assert.equal(buildTemplateLabel(templates[0], true), 'status : Bruit modéré');
    assert.equal(buildTemplateLabel(templates[1], true), 'status-legacy : Alerte temps réel');
  });

  test('should show plain name when frame_name is null even in multiFrame context', () => {
    const tpl = { id: '1', name: 'Bruit modéré', frame_name: null };
    assert.equal(buildTemplateLabel(tpl, true), 'Bruit modéré');
  });

  test('should detect multi-frame correctly ignoring null frame_names', () => {
    const templates = [
      { id: '1', name: 'A', frame_name: 'status' },
      { id: '2', name: 'B', frame_name: null },  // null ignoré
    ];
    assert.equal(isMultiFrame(templates), false, 'null frame_names should not count as distinct frames');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Backoffice — libellé "Type alerte" et affichage template_name
// ──────────────────────────────────────────────────────────────────────────────

describe('backoffice Rules — affichage template_name', () => {
  test('should display template_name when available', () => {
    const rule = { id: 'r1', field: 'soundPct', template_name: 'Bruit modéré' };
    const display = rule.template_name || rule.field;
    assert.equal(display, 'Bruit modéré');
  });

  test('should fallback to field name when template_name is null', () => {
    const rule = { id: 'r1', field: 'soundPct', template_name: null };
    const display = rule.template_name || rule.field;
    assert.equal(display, 'soundPct');
  });
});
