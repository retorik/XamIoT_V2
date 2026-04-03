package com.xamiot.soundsense.utils

import android.content.Context

object ServerConfig {
    const val PRODUCTION = "https://api.xamiot.com/"
    const val LOCAL      = "https://apixam.holiceo.com/"

    private const val PREFS_NAME = "xamiot_server_config"
    private const val KEY_BASE_URL = "base_url"

    fun getBaseUrl(context: Context): String {
        return context
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_BASE_URL, PRODUCTION) ?: PRODUCTION
    }

    fun setBaseUrl(context: Context, url: String) {
        context
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_BASE_URL, url)
            .commit() // synchrone — indispensable avant Runtime.exit(0)
    }

    fun isLocal(context: Context): Boolean = getBaseUrl(context) == LOCAL
    fun label(context: Context): String = if (isLocal(context)) "Debug VPS (apixam.holiceo.com)" else "Production (api.xamiot.com)"
}
