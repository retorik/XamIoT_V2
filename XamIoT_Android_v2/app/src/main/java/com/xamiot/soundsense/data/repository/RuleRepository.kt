package com.xamiot.soundsense.data.repository

import android.util.Log
import com.xamiot.soundsense.data.api.ApiService
import com.xamiot.soundsense.data.remote.dto.DeviceMetaDto
import com.xamiot.soundsense.data.remote.dto.RuleDto
import com.xamiot.soundsense.data.remote.request.CreateRuleRequest
import javax.inject.Inject
import javax.inject.Singleton
import retrofit2.HttpException

/**
 * Repository pour gérer les règles d'alertes
 */
@Singleton
class RuleRepository @Inject constructor(
    private val apiService: ApiService
) {
    companion object {
        private const val TAG = "RuleRepository"
    }

    suspend fun fetchDeviceMeta(token: String, espId: String): DeviceMetaDto? {
        return try {
            Log.d(TAG, "📋 fetchDeviceMeta espId=$espId")
            apiService.getDeviceMeta(token, espId)
        } catch (e: HttpException) {
            val errBody = try { e.response()?.errorBody()?.string() } catch (_: Exception) { null }
            Log.e(TAG, "❌ fetchDeviceMeta HTTP ${e.code()} body=${errBody ?: "<empty>"}")
            null
        } catch (e: Exception) {
            Log.e(TAG, "❌ fetchDeviceMeta Exception: ${e.message}", e)
            null
        }
    }

    suspend fun createRule(token: String, request: CreateRuleRequest): RuleDto? {
        return try {
            Log.d(TAG, "➕ createRule espId=${request.espId} threshold=${request.thresholdNum} enabled=${request.enabled}")

            val body = mutableMapOf<String, Any?>(
                "esp_id" to request.espId,
                "field" to request.field,
                "op" to request.op,
                "threshold_num" to request.thresholdNum,
                "threshold_str" to request.thresholdStr,
                "cooldown_sec" to request.cooldownSec,
                "enabled" to request.enabled,
                "user_label" to request.userLabel,
                "template_id" to request.templateId
            )

            apiService.createRule(token, body)
        } catch (e: HttpException) {
            val errBody = try { e.response()?.errorBody()?.string() } catch (_: Exception) { null }
            Log.e(TAG, "❌ createRule HTTP ${e.code()} body=${errBody ?: "<empty>"}")
            null
        } catch (e: Exception) {
            Log.e(TAG, "❌ createRule Exception: ${e.message}", e)
            null
        }
    }

    suspend fun fetchEspRules(token: String, espId: String): List<RuleDto> {
        return try {
            Log.d(TAG, "📥 ESP rules espId=$espId")
            apiService.getEspRules(token, espId)
        } catch (e: retrofit2.HttpException) {
            val errBody = try { e.response()?.errorBody()?.string() } catch (_: Exception) { null }
            Log.e(TAG, "❌ fetchEspRules HTTP ${e.code()} body=${errBody ?: "<empty>"}")
            emptyList()
        } catch (e: Exception) {
            Log.e(TAG, "❌ fetchEspRules Exception: ${e.message}", e)
            emptyList()
        }
    }

    suspend fun updateEspRuleEnabled(token: String, rule: RuleDto, enabled: Boolean): RuleDto? {
        return try {
            Log.d(TAG, "🔄 updateEspRuleEnabled ruleId=${rule.id} enabled=$enabled")

            val body = mutableMapOf<String, Any?>(
                "enabled" to enabled
            )

            rule.thresholdNum?.let { threshold ->
                body["threshold_num"] = threshold.toInt()
            }
            apiService.updateRuleEnabled(token, rule.id, body)
        } catch (e: Exception) {
            Log.e(TAG, "❌ updateEspRuleEnabled Exception: ${e.message}", e)
            null
        }
    }

    /**
     * ✅ Nouvelle fonctionnalité : modifier seuil + cooldown.
     * On réutilise le même endpoint PATCH /esp-rules/{id}.
     */
    suspend fun updateEspRuleThresholdCooldown(
        token: String,
        ruleId: String,
        threshold: Int,
        cooldownSec: Int,
        field: String? = null,
        op: String? = null,
        templateId: String? = null
    ): RuleDto? {
        return try {
            Log.d(TAG, "✏️ updateEspRuleThresholdCooldown ruleId=$ruleId threshold=$threshold cooldown=$cooldownSec field=$field op=$op templateId=$templateId")

            val body = mutableMapOf<String, Any?>(
                "threshold_num" to threshold,
                "cooldown_sec" to cooldownSec
            )
            if (field != null) body["field"] = field
            if (op != null) body["op"] = op
            if (templateId != null) body["template_id"] = templateId

            apiService.updateRuleEnabled(token, ruleId, body)
        } catch (e: Exception) {
            Log.e(TAG, "❌ updateEspRuleThresholdCooldown Exception: ${e.message}", e)
            null
        }
    }

    suspend fun deleteEspRule(token: String, ruleId: String): Boolean {
        return try {
            Log.d(TAG, "🗑️ deleteEspRule ruleId=$ruleId")
            val res = apiService.deleteRule(token, ruleId)
            Log.d(TAG, "<-- DELETE esp-rules/$ruleId code=${res.code()} msg=${res.message()}")
            if (!res.isSuccessful) {
                val err = try { res.errorBody()?.string() } catch (_: Exception) { null }
                Log.e(TAG, "❌ deleteEspRule HTTP ${res.code()} ${err ?: ""}")
            }
            res.isSuccessful
        } catch (e: Exception) {
            Log.e(TAG, "❌ deleteEspRule Exception: ${e.message}", e)
            false
        }
    }
}