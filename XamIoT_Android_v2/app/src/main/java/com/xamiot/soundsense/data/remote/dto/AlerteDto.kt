package com.xamiot.soundsense.data.remote.dto

import android.os.Parcelable
import com.google.gson.annotations.SerializedName
import kotlinx.parcelize.Parcelize

/**
 * DTO représentant une alerte provenant de l'API
 * Correspond au format réel de l'API esp-alerts
 */
@Parcelize
data class AlertDto(
    @SerializedName("id")
    val id: String,

    @SerializedName("rule_id")
    val ruleId: String?,

    @SerializedName("device_id")
    val deviceId: String?,

    @SerializedName("sent_at")
    val sentAt: String?,  // "2025-12-31T15:08:12.547Z"

    @SerializedName("channel")
    val channel: String?,

    @SerializedName("status")
    val status: String?,

    @SerializedName("payload")
    val payload: AlertPayload?,

    @SerializedName("error")
    val error: String? = null
) : Parcelable

/**
 * Contenu du payload de l'alerte
 */
@Parcelize
data class AlertPayload(
    @SerializedName("current_value")
    val currentValue: Double?,

    @SerializedName("current_display")
    val currentDisplay: String?,

    @SerializedName("device_name")
    val deviceName: String?,

    @SerializedName("body")
    val body: String?,

    @SerializedName("title")
    val title: String?
) : Parcelable
