package com.xamiot.soundsense.data.remote.dto

import com.google.gson.annotations.SerializedName

data class RegisterMobileDeviceResponse(
    @SerializedName("device_id") val deviceId: String,
    val name: String? = null,
    val platform: String? = null,
    @SerializedName("apns_token") val apnsToken: String? = null,
    @SerializedName("bundle_id") val bundleId: String? = null
)
