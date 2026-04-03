package com.xamiot.soundsense.data.remote.dto

import com.google.gson.annotations.SerializedName

data class MobileDeviceDto(
    // Le backend renvoie device_id
    @SerializedName("device_id")
    val deviceId: String,

    val name: String? = null,
    val model: String? = null,
    val os: String? = null,

    // côté backend c'est "os_version"
    @SerializedName("os_version")
    val osVersion: String? = null,

    // côté backend c'est "apns_token" (même si c'est FCM côté Android)
    @SerializedName("apns_token")
    val pushToken: String? = null,
) {
    // Alias pour compat si quelque part tu utilisais .id
    val id: String get() = deviceId
}
