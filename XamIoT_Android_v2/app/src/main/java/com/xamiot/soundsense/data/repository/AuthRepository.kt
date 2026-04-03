package com.xamiot.soundsense.data.repository

import android.content.Context
import android.content.pm.ApplicationInfo
import android.os.Build
import com.xamiot.soundsense.data.api.ApiClient
import com.xamiot.soundsense.data.local.TokenManager
import com.xamiot.soundsense.data.remote.dto.LoginRequest
import com.xamiot.soundsense.data.remote.dto.LoginResponse
import com.xamiot.soundsense.data.remote.dto.RegisterMobileDeviceRequest
import com.xamiot.soundsense.data.remote.dto.RegisterMobileDeviceResponse
import com.xamiot.soundsense.utils.ApiError
import com.xamiot.soundsense.utils.ApiResult
import java.io.IOException

class AuthRepository(context: Context) {

    private val appContext = context.applicationContext
    private val apiService = ApiClient.apiService
    private val tokenManager = TokenManager(appContext)

    /**
     * ✅ Compat si SplashActivity utilise AuthRepository pour décider la navigation.
     */
    fun isLoggedIn(): Boolean = tokenManager.isLoggedIn()

    suspend fun login(email: String, password: String): ApiResult<LoginResponse> {
        return try {
            val http = apiService.login(
                LoginRequest(
                    email = email,
                    password = password
                )
            )

            if (http.isSuccessful) {
                val body = http.body()
                if (body != null) {
                    ApiResult.Success(body)
                } else {
                    ApiResult.Error(ApiError.NetworkError("Réponse login vide."))
                }
            } else {
                ApiResult.Error(ApiError.NetworkError("Erreur HTTP ${http.code()}"))
            }
        } catch (e: IOException) {
            ApiResult.Error(ApiError.NetworkError(e.message ?: "Erreur réseau"))
        } catch (e: Exception) {
            ApiResult.Error(ApiError.NetworkError(e.message ?: "Erreur inconnue"))
        }
    }

    /**
     * Suppression définitive du compte connecté.
     * Le backend iOS attend le body {"confirm":"DELETE"} sur DELETE /me.
     */
    suspend fun deleteMyAccount(): ApiResult<Unit> {
        val authHeader = tokenManager.getAuthHeader()
            ?: return ApiResult.Error(ApiError.HttpError(401, "Session expirée. Reconnectez-vous."))

        return try {
            val http = apiService.deleteMyAccount(
                authorization = authHeader,
                body = mapOf("confirm" to "DELETE")
            )

            if (http.isSuccessful) {
                ApiResult.Success(Unit)
            } else {
                val message = when (http.code()) {
                    401 -> "Session expirée. Reconnectez-vous."
                    403 -> "Action non autorisée."
                    404 -> "Service de suppression indisponible (404)."
                    else -> "Erreur serveur (${http.code()})."
                }
                ApiResult.Error(ApiError.HttpError(http.code(), message))
            }
        } catch (e: IOException) {
            ApiResult.Error(ApiError.NetworkError(e.message ?: "Erreur réseau"))
        } catch (e: Exception) {
            ApiResult.Error(ApiError.UnknownError(e.message ?: "Impossible de supprimer le compte."))
        }
    }

    /**
     * Enregistre le mobile côté API si nécessaire.
     * NB: ton API attend `apns_token` -> on y met le token FCM Android.
     */
    suspend fun registerSmartphoneIfNeeded(
        currentFcmToken: String,
        force: Boolean = false
    ): Boolean {
        val fcm = currentFcmToken.trim()
        if (fcm.isBlank()) return false

        val authHeader = tokenManager.getAuthHeader() ?: return false

        // ✅ Si force=true : on (re)push systématiquement /devices (utile si DB a été restaurée/vidée)
        if (!force && !tokenManager.shouldRegisterMobileDevice(fcm)) return true

        val packageInfo = try {
            appContext.packageManager.getPackageInfo(appContext.packageName, 0)
        } catch (_: Exception) { null }

        val request = RegisterMobileDeviceRequest(
            name           = "${Build.MANUFACTURER} ${Build.MODEL}".trim(),
            platform       = "Android",
            fcmToken       = fcm,
            bundleId       = appContext.packageName,
            sandbox        = (appContext.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0,
            model          = Build.MODEL,
            osVersion      = "Android ${Build.VERSION.RELEASE}",
            timezone       = java.util.TimeZone.getDefault().id,
            appVersion     = packageInfo?.versionName,
            appBuildNumber = packageInfo?.let {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P)
                    it.longVersionCode.toInt()
                else
                    @Suppress("DEPRECATION") it.versionCode
            }
        )

        return try {
            val http = apiService.registerMobileDevice(
                authorization = authHeader,
                request = request
            )

            if (!http.isSuccessful) return false

            val body: RegisterMobileDeviceResponse = http.body() ?: return false
            val deviceId = body.deviceId

            if (deviceId.isNotBlank()) {
                tokenManager.saveMobileRegistration(deviceId, fcm)
                true
            } else {
                false
            }
        } catch (_: Exception) {
            false
        }
    }
}
