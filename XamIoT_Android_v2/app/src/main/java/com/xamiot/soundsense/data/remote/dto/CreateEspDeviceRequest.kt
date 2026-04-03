package com.xamiot.soundsense.data.remote.dto

import com.google.gson.annotations.SerializedName

data class CreateEspDeviceRequest(
    @SerializedName("esp_uid") val espUid: String,
    @SerializedName("name") val name: String,
    @SerializedName("topic_prefix") val topicPrefix: String,
    @SerializedName("mqtt_password") val mqttPassword: String
)
