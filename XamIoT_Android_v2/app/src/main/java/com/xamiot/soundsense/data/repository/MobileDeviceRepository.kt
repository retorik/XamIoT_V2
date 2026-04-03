package com.xamiot.soundsense.data.repository

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import com.xamiot.soundsense.data.api.ApiClient
import com.xamiot.soundsense.data.local.TokenManager
import com.xamiot.soundsense.data.remote.dto.RegisterMobileDeviceRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class MobileDeviceRepository(
    private val context: Context
) {
    private val tokenManager = TokenManager(context)

    /**
     * Enregistre le mobile côté API si :
     * - user loggé
     * - token FCM présent
     * - pas déjà enregistré (ou token FCM a changé)
     */
    suspend fun ensureMobileRegistered(currentFcmToken: String?) = withContext(Dispatchers.IO) {
        val fcm = currentFcmToken?.trim().orEmpty()
        if (fcm.isBlank()) return@withContext
        if (!tokenManager.isLoggedIn()) return@withContext
        if (!tokenManager.shouldRegisterMobileDevice(fcm)) return@withContext

        val authHeader = tokenManager.getAuthHeader() ?: return@withContext

        val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
        val appVersion = packageInfo.versionName
        val appBuildNumber = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            packageInfo.longVersionCode.toInt()
        } else {
            @Suppress("DEPRECATION")
            packageInfo.versionCode
        }

        val request = RegisterMobileDeviceRequest(
            name           = deviceName(),
            platform       = "Android",
            fcmToken       = fcm,
            bundleId       = context.packageName,
            sandbox        = (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0,
            model          = Build.MODEL,
            osVersion      = "Android ${Build.VERSION.RELEASE}",
            timezone       = java.util.TimeZone.getDefault().id,
            appVersion     = appVersion,
            appBuildNumber = appBuildNumber
        )

        val response = ApiClient.apiService.registerMobileDevice(
            authorization = authHeader,
            request = request
        )

        if (response.isSuccessful) {
            val deviceId = response.body()?.deviceId
            if (!deviceId.isNullOrBlank()) {
                tokenManager.saveMobileRegistration(deviceId, fcm)
            }
        }
        // sinon : on ne crash pas, on retentera plus tard
    }

    private fun deviceName(): String {
        val manufacturer = Build.MANUFACTURER ?: "Android"
        val model = Build.MODEL ?: "Device"
        return "$manufacturer $model"
    }
}
