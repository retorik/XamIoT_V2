package com.xamiot.soundsense.data.local

import android.content.Context
import android.content.SharedPreferences

/**
 * Gestionnaire pour le stockage :
 * - Auth (token + email + userId)
 * - Push (FCM)
 * - Enregistrement du smartphone côté backend (deviceId + dernier token enregistré)
 */
class TokenManager(context: Context) {

    private val sharedPreferences: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    companion object {
        private const val PREFS_NAME = "xamiot_prefs"

        // --- Auth ---
        private const val KEY_TOKEN = "auth_token"
        private const val KEY_EMAIL = "user_email"
        private const val KEY_USER_ID = "user_id"

        // --- Push / Mobile device registration ---
        private const val KEY_FCM_TOKEN = "fcm_token"
        private const val KEY_MOBILE_DEVICE_ID = "mobile_device_id" // device_id renvoyé par /devices

        // Ancien nom (déjà stocké potentiellement)
        private const val KEY_MOBILE_REGISTERED_FCM_TOKEN = "mobile_registered_fcm_token"
        // Nouveau nom (utilisé par AuthRepository)
        private const val KEY_LAST_REGISTERED_FCM_TOKEN = "last_registered_fcm_token"

        /**
         * ✅ Compat si ton SplashActivity faisait un appel "statique" :
         * TokenManager.isLoggedIn(context)
         */
        fun isLoggedIn(context: Context): Boolean = TokenManager(context).isLoggedIn()
    }

    // ==========================================================
    // AUTH
    // ==========================================================

    fun saveToken(token: String, email: String? = null, userId: String? = null) {
        sharedPreferences.edit().apply {
            putString(KEY_TOKEN, token)
            if (email != null) putString(KEY_EMAIL, email)
            if (userId != null) putString(KEY_USER_ID, userId)
        }.apply()
    }

    fun getToken(): String? = sharedPreferences.getString(KEY_TOKEN, null)
    fun getEmail(): String? = sharedPreferences.getString(KEY_EMAIL, null)
    fun getUserId(): String? = sharedPreferences.getString(KEY_USER_ID, null)

    fun isLoggedIn(): Boolean = !getToken().isNullOrBlank()

    fun getAuthHeader(): String? =
        getToken()?.takeIf { it.isNotBlank() }?.let { "Bearer $it" }

    /** Supprime uniquement le token d'auth (compat). */
    fun clearToken() {
        sharedPreferences.edit().remove(KEY_TOKEN).apply()
    }

    /** Logout complet. */
    fun logout() {
        sharedPreferences.edit().clear().apply()
    }

    // ==========================================================
    // FCM TOKEN
    // ==========================================================

    fun saveFcmToken(token: String) {
        sharedPreferences.edit().putString(KEY_FCM_TOKEN, token).apply()
    }

    fun getFcmToken(): String? = sharedPreferences.getString(KEY_FCM_TOKEN, null)

    // ==========================================================
    // MOBILE DEVICE REGISTRATION (POST /devices)
    // ==========================================================

    fun saveMobileRegistration(deviceId: String, fcmTokenUsed: String) {
        sharedPreferences.edit().apply {
            putString(KEY_MOBILE_DEVICE_ID, deviceId)
            putString(KEY_MOBILE_REGISTERED_FCM_TOKEN, fcmTokenUsed)
            putString(KEY_LAST_REGISTERED_FCM_TOKEN, fcmTokenUsed)
        }.apply()
    }

    fun saveMobileDeviceId(id: String) {
        sharedPreferences.edit().putString(KEY_MOBILE_DEVICE_ID, id).apply()
    }

    fun getMobileDeviceId(): String? =
        sharedPreferences.getString(KEY_MOBILE_DEVICE_ID, null)

    fun saveLastRegisteredFcmToken(token: String) {
        sharedPreferences.edit().apply {
            putString(KEY_LAST_REGISTERED_FCM_TOKEN, token)
            putString(KEY_MOBILE_REGISTERED_FCM_TOKEN, token)
        }.apply()
    }

    fun getLastRegisteredFcmToken(): String? {
        return sharedPreferences.getString(KEY_LAST_REGISTERED_FCM_TOKEN, null)
            ?: sharedPreferences.getString(KEY_MOBILE_REGISTERED_FCM_TOKEN, null)
    }

    fun getMobileRegisteredFcmToken(): String? =
        sharedPreferences.getString(KEY_MOBILE_REGISTERED_FCM_TOKEN, null)

    fun isMobileRegisteredForToken(fcmToken: String): Boolean {
        val deviceId = getMobileDeviceId()
        val lastToken = getLastRegisteredFcmToken() ?: getMobileRegisteredFcmToken()
        return !deviceId.isNullOrBlank() && lastToken == fcmToken
    }

    fun shouldRegisterMobileDevice(currentFcmToken: String): Boolean {
        if (currentFcmToken.isBlank()) return false

        val deviceId = getMobileDeviceId()
        val last = getLastRegisteredFcmToken()

        return deviceId.isNullOrBlank() || last.isNullOrBlank() || last != currentFcmToken
    }

    /**
     * ✅ Fix pour ton erreur :
     * Unresolved reference: clearMobileRegistration
     */
    fun clearMobileRegistration() {
        sharedPreferences.edit().apply {
            remove(KEY_MOBILE_DEVICE_ID)
            remove(KEY_LAST_REGISTERED_FCM_TOKEN)
            remove(KEY_MOBILE_REGISTERED_FCM_TOKEN)
        }.apply()
    }

    // ==========================================================
    // ALIAS COMPAT (pour ton ancien code)
    // ==========================================================

    /**
     * ✅ Fix pour MobileDeviceRepository :
     * Unresolved reference: getAccessToken
     */
    fun getAccessToken(): String? = getToken()

    /**
     * ✅ Fix pour MobileDeviceRepository :
     * Unresolved reference: shouldRegisterMobile
     */
    fun shouldRegisterMobile(currentFcmToken: String?): Boolean {
        val token = currentFcmToken?.trim().orEmpty()
        if (token.isBlank()) return false
        return shouldRegisterMobileDevice(token)
    }
}
