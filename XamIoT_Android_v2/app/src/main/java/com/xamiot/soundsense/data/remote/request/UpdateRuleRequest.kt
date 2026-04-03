package com.xamiot.soundsense.data.remote.request

data class UpdateRuleRequest(
    val name: String? = null,
    val threshold: Int? = null,
    val enabled: Boolean? = null
)