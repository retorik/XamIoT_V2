// src/campaignService.js
// Fonctions pures pour les campagnes manuelles — séparées pour être testables

/**
 * Valide les paramètres d'un envoi de campagne.
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateCampaignPayload({ send_types, body, title, user_ids }) {
  if (!Array.isArray(send_types) || !send_types.length) {
    return { ok: false, error: 'send_types_required' };
  }
  const validTypes = ['push', 'email'];
  if (!send_types.every(t => validTypes.includes(t))) {
    return { ok: false, error: 'invalid_send_type' };
  }
  if (!body?.trim()) {
    return { ok: false, error: 'body_required' };
  }
  if (send_types.includes('push') && !title?.trim()) {
    return { ok: false, error: 'title_required_for_push' };
  }
  if (!Array.isArray(user_ids) || !user_ids.length) {
    return { ok: false, error: 'user_ids_required' };
  }
  if (user_ids.length > 1000) {
    return { ok: false, error: 'too_many_recipients' };
  }
  return { ok: true };
}

/**
 * Construit la clause WHERE et les paramètres pour la recherche de destinataires.
 * Base : seuls les utilisateurs actifs sont inclus.
 *
 * @param {{ search?: string, esp_type_id?: string, mobile_platform?: string, has_push?: string }}
 * @returns {{ where: string[], params: any[], nextIndex: number }}
 */
export function buildRecipientsFilter({ search = '', esp_type_id = '', mobile_platform = '', has_push = '' } = {}) {
  const where = ['u.is_active = true'];
  const params = [];
  let i = 1;

  const s = search.trim();
  if (s) {
    where.push(`(u.email ILIKE $${i} OR u.first_name ILIKE $${i} OR u.last_name ILIKE $${i})`);
    params.push(`%${s}%`);
    i++;
  }

  if (esp_type_id) {
    where.push(
      `EXISTS (SELECT 1 FROM esp_devices e WHERE e.user_id = u.id AND e.device_type_id = $${i})`
    );
    params.push(esp_type_id);
    i++;
  }

  if (mobile_platform) {
    where.push(
      `EXISTS (SELECT 1 FROM mobile_devices m WHERE m.user_id = u.id AND m.platform = $${i} AND m.is_active = true)`
    );
    params.push(mobile_platform);
    i++;
  }

  if (has_push === 'true') {
    where.push(
      `EXISTS (SELECT 1 FROM mobile_devices m WHERE m.user_id = u.id AND m.is_active = true AND (m.apns_token IS NOT NULL OR m.fcm_token IS NOT NULL))`
    );
    // Pas de paramètre supplémentaire
  }

  return { where, params, nextIndex: i };
}

/**
 * Agrège un tableau de résultats d'envoi individuels en compteurs.
 * Chaque item : { channel: 'push'|'email', ok: boolean }
 *
 * @param {Array<{ channel: string, ok: boolean }>} results
 * @returns {{ success_push: number, fail_push: number, success_email: number, fail_email: number }}
 */
export function aggregateSendResults(results) {
  return results.reduce(
    (acc, r) => {
      if (r.channel === 'push') {
        if (r.ok) acc.success_push++; else acc.fail_push++;
      } else if (r.channel === 'email') {
        if (r.ok) acc.success_email++; else acc.fail_email++;
      }
      return acc;
    },
    { success_push: 0, fail_push: 0, success_email: 0, fail_email: 0 }
  );
}
