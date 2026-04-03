package com.xamiot.soundsense.data.remote.dto

import com.google.gson.annotations.SerializedName

/**
 * Requête POST /devices
 * L'API attend "apns_token" (même pour Android) -> on y met le token FCM.
 */
data class RegisterMobileDeviceRequest(
    @SerializedName("name") val name: String,
    @SerializedName("platform") val platform: String,
    @SerializedName("fcm_token") val fcmToken: String,
    @SerializedName("bundle_id") val bundleId: String,
    @SerializedName("sandbox") val sandbox: Boolean,
    @SerializedName("model") val model: String?,
    @SerializedName("os_version") val osVersion: String?,
    @SerializedName("timezone") val timezone: String?,
    @SerializedName("app_version") val appVersion: String?,
    @SerializedName("app_build_number") val appBuildNumber: Int?
)
