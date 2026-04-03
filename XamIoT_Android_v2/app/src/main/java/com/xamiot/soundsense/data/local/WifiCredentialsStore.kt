package com.xamiot.soundsense.data.local

import android.content.Context

object WifiCredentialsStore {
    private const val PREFS = "wifi_credentials"
    private const val KEY_SSID = "ssid"
    private const val KEY_PASS = "pass"

    fun save(context: Context, ssid: String, pass: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_SSID, ssid)
            .putString(KEY_PASS, pass)
            .apply()
    }

    fun load(context: Context): Pair<String, String>? {
        val sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val ssid = sp.getString(KEY_SSID, null) ?: return null
        val pass = sp.getString(KEY_PASS, null) ?: ""
        return ssid to pass
    }
}
