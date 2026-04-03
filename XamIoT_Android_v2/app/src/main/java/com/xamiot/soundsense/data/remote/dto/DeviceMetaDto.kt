package com.xamiot.soundsense.data.remote.dto

import com.google.gson.annotations.SerializedName

data class DeviceMetaDto(
    @SerializedName("esp_id") val espId: String,
    @SerializedName("rule_templates") val ruleTemplates: List<RuleTemplateInfo>
) {
    data class RuleTemplateInfo(
        @SerializedName("id") val id: String,
        @SerializedName("name") val name: String,
        @SerializedName("description") val description: String?,
        @SerializedName("field") val field: String,
        @SerializedName("field_label") val fieldLabel: String,
        @SerializedName("field_data_type") val fieldDataType: String,
        @SerializedName("field_unit") val fieldUnit: String?,
        @SerializedName("field_min") val fieldMin: Double?,
        @SerializedName("field_max") val fieldMax: Double?,
        @SerializedName("field_operators") val fieldOperators: List<String>,
        @SerializedName("cooldown_min_sec") val cooldownMinSec: Int
    )
}
