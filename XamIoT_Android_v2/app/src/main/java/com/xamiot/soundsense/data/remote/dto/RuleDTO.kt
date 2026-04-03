package com.xamiot.soundsense.data.remote.dto

import com.google.gson.annotations.SerializedName

/**
 * DTO représentant une règle d'alerte
 * Exemple JSON :
 * {
 *   "id": "123",
 *   "esp_id": "cdee7dc4...",
 *   "field": "sound_level",
 *   "op": "gt",
 *   "threshold_num": 50.0,
 *   "threshold_str": null,
 *   "cooldown_sec": 60,
 *   "enabled": true,
 *   "created_at": "2025-11-23T10:30:00.000Z"
 * }
 */
data class RuleDto(
    @SerializedName("id")
    val id: String,

    @SerializedName("esp_id")
    val espId: String,

    @SerializedName("field")
    val field: String, // Ex: "sound_level"

    @SerializedName("op")
    val op: String, // Ex: "gt" (greater than), "lt" (less than), "eq" (equals)

    @SerializedName("threshold_num")
    val thresholdNum: Double?, // Seuil numérique (ex: 50.0 dB)

    @SerializedName("threshold_str")
    val thresholdStr: String?, // Seuil texte (si besoin)

    @SerializedName("cooldown_sec")
    val cooldownSec: Int?, // Délai entre deux alertes (en secondes)

    @SerializedName("enabled")
    val enabled: Boolean, // Règle active ou non

    @SerializedName("created_at")
    val createdAt: String?, // Date de création ISO 8601

    @SerializedName("user_label")
    val userLabel: String?,

    @SerializedName("template_name")
    val templateName: String?,

    @SerializedName("cooldown_min_sec")
    val cooldownMinSec: Int?,

    @SerializedName("template_id")
    val templateId: String?
) {
    /**
     * Formate la règle en texte lisible
     * Ex: "xB > 50" avec cooldown "60s"
     */
    fun getFormattedRule(): String {
        if (!userLabel.isNullOrBlank()) return userLabel

        val opSymbol = when (op) {
            ">" -> ">"
            ">=" -> "≥"
            "<" -> "<"
            "<=" -> "≤"
            "==" -> "="
            "!=" -> "≠"
            // legacy server values
            "gt" -> ">"
            "gte" -> "≥"
            "lt" -> "<"
            "lte" -> "≤"
            "eq" -> "="
            else -> op
        }

        val threshold = thresholdNum?.toInt() ?: thresholdStr ?: "?"
        return "$field $opSymbol $threshold"
    }

    /**
     * Formate le cooldown
     * Ex: "60s" ou "2min"
     */
    fun getFormattedCooldown(): String {
        val sec = cooldownSec ?: return "Pas de cooldown"
        return if (sec < 60) {
            "${sec}s"
        } else {
            val min = sec / 60
            "${min}min"
        }
    }

    /**
     * Retourne la date de création formatée
     * Ex: "créée: 23 novembre 2025"
     */
    fun getFormattedCreatedAt(): String {
        if (createdAt.isNullOrBlank()) return ""

        return try {
            val format = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.getDefault())
            format.timeZone = java.util.TimeZone.getTimeZone("UTC")
            val date = format.parse(createdAt) ?: return ""

            val displayFormat = java.text.SimpleDateFormat("dd MMMM yyyy", java.util.Locale.FRENCH)
            "créée: ${displayFormat.format(date)}"
        } catch (e: Exception) {
            ""
        }
    }
}
