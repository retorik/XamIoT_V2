package com.xamiot.soundsense.data.remote.request

import com.google.gson.annotations.SerializedName

/**
 * Requête REST pour créer une règle (POST /esp-rules)
 *
 * Important :
 * - Les noms JSON doivent matcher l'API (esp_id, threshold_num, cooldown_sec, etc.)
 * - "field" et "op" permettent d'exprimer la condition (ex: xB > 50)
 */
data class CreateRuleRequest(
    @SerializedName("esp_id")
    val espId: String,

    @SerializedName("field")
    val field: String,

    @SerializedName("op")
    val op: String,

    @SerializedName("threshold_num")
    val thresholdNum: Int,

    @SerializedName("threshold_str")
    val thresholdStr: String? = null,

    @SerializedName("cooldown_sec")
    val cooldownSec: Int = 60,

    @SerializedName("enabled")
    val enabled: Boolean = true,

    @SerializedName("user_label")
    val userLabel: String? = null,

    @SerializedName("template_id")
    val templateId: String? = null
)
