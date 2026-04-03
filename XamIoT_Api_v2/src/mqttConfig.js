// src/mqttConfig.js
// Cache en mémoire de la configuration MQTT (types, trames, champs)
// Rafraîchi toutes les CACHE_TTL_MS millisecondes

import { q } from './db.js';

const CACHE_TTL_MS = 60_000; // 60s

let _cache = null;
let _loadedAt = 0;

/**
 * @typedef {{ name: string, label: string|null, data_type: string, unit: string|null, min_value: number|null, max_value: number|null, is_primary_metric: boolean, sort_order: number }} FrameField
 * @typedef {{ frame_id: string, frame_name: string, topic_suffix: string, fields: FrameField[] }} FrameConfig
 * @typedef {Map<string, FrameConfig[]>} TypeConfig  keyed by topic_suffix → array of FrameConfig
 * @typedef {Map<string, TypeConfig>} MqttConfigCache  keyed by device_type_id
 */

/**
 * Charge (ou retourne depuis le cache) la configuration MQTT complète.
 * @returns {Promise<MqttConfigCache>}
 */
export async function getMqttConfig() {
  const now = Date.now();
  if (_cache && (now - _loadedAt) < CACHE_TTL_MS) return _cache;
  return _reloadConfig();
}

/** Force le rechargement immédiat du cache (ex: après un POST admin). */
export async function reloadMqttConfig() {
  return _reloadConfig();
}

async function _reloadConfig() {
  const { rows } = await q(`
    SELECT
      dt.id  AS device_type_id,
      fd.id  AS frame_id,
      fd.name AS frame_name,
      fd.topic_suffix,
      ff.name             AS field_name,
      ff.label,
      ff.data_type,
      ff.unit,
      ff.min_value,
      ff.max_value,
      ff.is_primary_metric,
      ff.sort_order
    FROM device_types dt
    JOIN mqtt_frame_definitions fd ON fd.device_type_id = dt.id AND fd.direction = 'inbound'
    JOIN mqtt_frame_fields ff      ON ff.frame_id = fd.id
    ORDER BY dt.id, fd.id, ff.sort_order, ff.name
  `);

  /** @type {MqttConfigCache} */
  const cache = new Map();

  // Regroupement intermédiaire : device_type_id → topic_suffix → frame_id → FrameConfig
  const frameMap = new Map(); // Map<device_type_id, Map<frame_id, FrameConfig>>

  for (const row of rows) {
    if (!frameMap.has(row.device_type_id)) frameMap.set(row.device_type_id, new Map());
    const byFrame = frameMap.get(row.device_type_id);

    if (!byFrame.has(row.frame_id)) {
      byFrame.set(row.frame_id, {
        frame_id:     row.frame_id,
        frame_name:   row.frame_name,
        topic_suffix: row.topic_suffix,
        fields:       [],
      });
    }
    byFrame.get(row.frame_id).fields.push({
      name:              row.field_name,
      label:             row.label,
      data_type:         row.data_type,
      unit:              row.unit,
      min_value:         row.min_value,
      max_value:         row.max_value,
      is_primary_metric: row.is_primary_metric,
      sort_order:        row.sort_order,
    });
  }

  // Construction du cache final : par device_type_id → topic_suffix → FrameConfig[]
  for (const [deviceTypeId, byFrame] of frameMap) {
    const typeMap = new Map(); // Map<topic_suffix, FrameConfig[]>
    for (const frame of byFrame.values()) {
      if (!typeMap.has(frame.topic_suffix)) typeMap.set(frame.topic_suffix, []);
      typeMap.get(frame.topic_suffix).push(frame);
    }
    cache.set(deviceTypeId, typeMap);
  }

  _cache = cache;
  _loadedAt = Date.now();
  console.log('[mqttConfig] cache chargé:', cache.size, 'types de devices');
  return cache;
}

/**
 * Extrait le suffixe de topic depuis un topic MQTT complet.
 * Ex: "devices/abc123/status" → "status"
 * Ex: "devices/abc123/cmd/reboot" → "cmd/reboot"
 */
export function extractTopicSuffix(topic) {
  const parts = topic.split('/');
  // Format standard: <prefix>/<uid>/<suffix...>
  if (parts.length < 3) return parts[parts.length - 1] ?? topic;
  return parts.slice(2).join('/');
}

/**
 * Retourne toutes les FrameConfig pour un device type + suffixe de topic.
 * Plusieurs frames peuvent partager le même suffix (ex: "status" + "status-legacy").
 * @param {MqttConfigCache} config
 * @param {string} deviceTypeId
 * @param {string} topicSuffix
 * @returns {FrameConfig[]}
 */
export function getFrameConfigs(config, deviceTypeId, topicSuffix) {
  if (!deviceTypeId) return [];
  const typeMap = config.get(deviceTypeId);
  if (!typeMap) return [];
  return typeMap.get(topicSuffix) ?? [];
}

/**
 * Retourne la première FrameConfig (rétrocompatibilité avec le code existant).
 * @param {MqttConfigCache} config
 * @param {string} deviceTypeId
 * @param {string} topicSuffix
 * @returns {FrameConfig|null}
 */
export function getFrameConfig(config, deviceTypeId, topicSuffix) {
  return getFrameConfigs(config, deviceTypeId, topicSuffix)[0] ?? null;
}

/**
 * Retourne tous les champs de toutes les frames d'un device type.
 * Utilisé pour chercher metadata (label, unité) d'un champ quelle que soit sa frame d'origine.
 * En cas de doublon de nom, la première définition trouvée est conservée.
 * @param {MqttConfigCache} config
 * @param {string} deviceTypeId
 * @returns {FrameField[]}
 */
export function getAllFrameFields(config, deviceTypeId) {
  if (!deviceTypeId) return [];
  const typeMap = config.get(deviceTypeId);
  if (!typeMap) return [];
  const seen = new Set();
  const fields = [];
  for (const frames of typeMap.values()) {
    for (const frame of frames) {
      for (const f of frame.fields) {
        if (!seen.has(f.name)) { seen.add(f.name); fields.push(f); }
      }
    }
  }
  return fields;
}

/**
 * Retourne le champ marqué is_primary_metric dans une FrameConfig.
 * @param {FrameConfig} frameConfig
 * @returns {FrameField|null}
 */
export function getPrimaryField(frameConfig) {
  if (!frameConfig) return null;
  return frameConfig.fields.find(f => f.is_primary_metric) ?? null;
}
