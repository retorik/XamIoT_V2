package com.xamiot.soundsense.data.api

import com.xamiot.soundsense.data.remote.dto.AlertDto
import com.xamiot.soundsense.data.remote.dto.CreateEspDeviceRequest
import com.xamiot.soundsense.data.remote.dto.DeviceDTO
import com.xamiot.soundsense.data.remote.dto.DeviceMetaDto
import com.xamiot.soundsense.data.remote.dto.LoginRequest
import com.xamiot.soundsense.data.remote.dto.LoginResponse
import com.xamiot.soundsense.data.remote.dto.RegisterMobileDeviceResponse
import com.xamiot.soundsense.data.remote.dto.RegisterMobileDeviceRequest
import com.xamiot.soundsense.data.remote.dto.RuleDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Interface définissant tous les endpoints de l'API
 */
interface ApiService {

    // POST /auth/login
    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): Response<LoginResponse>

    // ==========================================================
    // ACCOUNT - Gestion du compte connecté
    // ==========================================================
    // DELETE /me avec body de confirmation (comme sur iOS)
    @HTTP(method = "DELETE", path = "me", hasBody = true)
    suspend fun deleteMyAccount(
        @Header("Authorization") authorization: String,
        @Body body: Map<String, String>
    ): Response<Unit>

    // POST /me/badge/reset — vide le compteur de notifications non lues
    @POST("me/badge/reset")
    suspend fun resetBadge(
        @Header("Authorization") authorization: String
    ): Response<Unit>

    // ==========================================================
    // MOBILE DEVICES - Smartphone registration (Push token)
    // ==========================================================
    // POST /devices
    @POST("devices")
    suspend fun registerMobileDevice(
        @Header("Authorization") authorization: String,
        @Body request: RegisterMobileDeviceRequest
    ): Response<RegisterMobileDeviceResponse>

    // ==========================================================
    // DEVICES - Gestion des capteurs
    // ==========================================================
    @GET("esp-devices")
    suspend fun getDevices(
        @Header("Authorization") authorization: String
    ): Response<List<DeviceDTO>>

    @POST("esp-devices")
    suspend fun createEspDevice(
        @Header("Authorization") authorization: String,
        @Body request: CreateEspDeviceRequest
    ): Response<DeviceDTO>

    @DELETE("esp-devices/{id}")
    suspend fun deleteEspDevice(
        @Header("Authorization") authorization: String,
        @Path("id") deviceId: String
    ): Response<Unit>

    @GET("esp-devices/{id}/meta")
    suspend fun getDeviceMeta(
        @Header("Authorization") token: String,
        @Path("id") deviceId: String
    ): DeviceMetaDto

    // ==========================================================
    // RULES - Gestion des règles d'alerte
    // ==========================================================
    @GET("esp-rules")
    suspend fun getEspRules(
        @Header("Authorization") token: String,
        @Query("esp_id") espId: String
    ): List<RuleDto>

    @POST("esp-rules")
    suspend fun createRule(
        @Header("Authorization") token: String,
        @Body body: MutableMap<String, Any?>
    ): RuleDto

    @PATCH("esp-rules/{id}")
    suspend fun updateRuleEnabled(
        @Header("Authorization") token: String,
        @Path("id") ruleId: String,
        @Body body: MutableMap<String, Any?>
    ): RuleDto

    @DELETE("esp-rules/{id}")
    suspend fun deleteRule(
        @Header("Authorization") token: String,
        @Path("id") ruleId: String
    ): Response<Unit>

    // ==========================================================
    // ALERTES
    // ==========================================================
    @GET("esp-alerts")
    suspend fun getEspAlerts(
        @Header("Authorization") token: String,
        @Query("esp_id") espId: String,
        @Query("limit") limit: Int = 1,
        @Query("offset") offset: Int = 0
    ): Response<List<AlertDto>>
}
