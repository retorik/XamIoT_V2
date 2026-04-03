package com.xamiot.soundsense.data.repository

import android.util.Log
import com.xamiot.soundsense.data.api.ApiService
import com.xamiot.soundsense.data.remote.dto.AlertDto
import com.xamiot.soundsense.utils.ApiError
import com.xamiot.soundsense.utils.ApiResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository pour gérer les alertes
 */
@Singleton
class AlertRepository @Inject constructor(
    private val apiService: ApiService
) {
    companion object {
        private const val TAG = "AlertRepository"
    }

    /**
     * Récupère la dernière alerte d'un ESP via l'endpoint /esp-alerts?esp_id=...&limit=1
     *
     * @param token Header Authorization complet, ex: "Bearer xxx"
     * @param espId Identifiant utilisé par l'API
     */
    suspend fun fetchLastAlert(token: String, espId: String): ApiResult<AlertDto?> {
        return withContext(Dispatchers.IO) {
            try {
                Log.d(TAG, "📥 fetchLastAlert espId=$espId")
                val response = apiService.getEspAlerts(token = token, espId = espId, limit = 1, offset = 0)

                if (response.isSuccessful) {
                    val alert = response.body()?.firstOrNull()
                    ApiResult.Success(alert)
                } else {
                    ApiResult.Error(
                        ApiError.HttpError(
                            code = response.code(),
                            message = response.message()
                        )
                    )
                }
            } catch (e: java.net.UnknownHostException) {
                ApiResult.Error(ApiError.NetworkError())
            } catch (e: java.net.SocketTimeoutException) {
                ApiResult.Error(ApiError.NetworkError("Délai de connexion dépassé"))
            } catch (e: Exception) {
                Log.e(TAG, "❌ Exception fetchLastAlert: ${e.message}", e)
                ApiResult.Error(ApiError.UnknownError(e.message ?: "Erreur inconnue"))
            }
        }
    }

    suspend fun fetchEspAlertHistory(
        token: String,
        espId: String,
        limit: Int = 100,
        offset: Int = 0
    ): List<AlertDto> {
        return withContext(Dispatchers.IO) {
            try {
                Log.d(TAG, "📥 fetchEspAlertHistory espId=$espId limit=$limit offset=$offset")
                val response = apiService.getEspAlerts(token = token, espId = espId, limit = limit, offset = offset)

                if (response.isSuccessful) {
                    response.body() ?: emptyList()
                } else {
                    val errBody = try { response.errorBody()?.string() } catch (_: Exception) { null }
                    Log.e(TAG, "❌ fetchEspAlertHistory HTTP ${response.code()} body=${errBody ?: "<empty>"}")
                    emptyList()
                }
            } catch (e: Exception) {
                Log.e(TAG, "❌ fetchEspAlertHistory Exception: ${e.message}", e)
                emptyList()
            }
        }
    }
}
