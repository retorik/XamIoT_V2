package com.xamiot.soundsense.ui.devicedetail

import android.util.Log
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xamiot.soundsense.data.remote.dto.AlertDto
import com.xamiot.soundsense.data.remote.dto.DeviceDTO
import com.xamiot.soundsense.data.remote.dto.DeviceMetaDto
import com.xamiot.soundsense.data.remote.dto.RuleDto
import com.xamiot.soundsense.data.remote.request.CreateRuleRequest
import com.xamiot.soundsense.data.repository.AlertRepository
import com.xamiot.soundsense.data.repository.RuleRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class DeviceDetailViewModel @Inject constructor(
    private val ruleRepository: RuleRepository,
    private val alertRepository: AlertRepository
) : ViewModel() {

    companion object {
        private const val TAG = "DeviceDetailViewModel"
        private const val COOLDOWN_DEFAULT_MIN_SEC = 60
    }

    private val _rules = MutableLiveData<List<RuleDto>>(emptyList())
    val rules: LiveData<List<RuleDto>> = _rules

    private val _meta = MutableLiveData<DeviceMetaDto?>(null)
    val meta: LiveData<DeviceMetaDto?> = _meta

    private val _alertHistory = MutableLiveData<List<AlertDto>>(emptyList())
    val alertHistory: LiveData<List<AlertDto>> = _alertHistory

    private val _isLoading = MutableLiveData(false)
    val isLoading: LiveData<Boolean> = _isLoading

    private val _error = MutableLiveData<String?>(null)
    val error: LiveData<String?> = _error

    private var currentDevice: DeviceDTO? = null
    private var authHeader: String? = null

    fun setDevice(device: DeviceDTO, authHeader: String) {
        this.currentDevice = device
        this.authHeader = authHeader
        loadMeta()
        refresh()
    }

    fun loadMeta() {
        val device = currentDevice ?: return
        val token = authHeader ?: return
        val espId = device.id

        viewModelScope.launch {
            val result = ruleRepository.fetchDeviceMeta(token, espId)
            _meta.value = result
        }
    }

    fun refresh() {
        val device = currentDevice ?: return
        val token = authHeader ?: run {
            _error.value = "Non connecté"
            return
        }

        val espIdForApi = device.id
        val espUidForDisplay = device.espUid

        if (espIdForApi.isNullOrBlank()) {
            _error.value = "device.id (UUID) manquant pour ce capteur (impossible de charger règles/alertes)"
            _rules.value = emptyList()
            _alertHistory.value = emptyList()
            return
        }

        Log.d(TAG, "🔄 refresh deviceId(uuid)=$espIdForApi espUid=$espUidForDisplay")

        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null

            try {
                val rules = ruleRepository.fetchEspRules(token, espIdForApi)
                _rules.value = rules

                val alerts = alertRepository.fetchEspAlertHistory(token, espIdForApi, limit = 100, offset = 0)
                _alertHistory.value = alerts
            } catch (e: Exception) {
                Log.e(TAG, "❌ refresh error: ${e.message}", e)
                _error.value = e.message ?: "Erreur inconnue"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun createRule(
        threshold: Int,
        cooldownSec: Int,
        enabled: Boolean,
        field: String = "soundPct",
        op: String = ">",
        userLabel: String? = null,
        templateId: String? = null,
        cooldownMinSec: Int = COOLDOWN_DEFAULT_MIN_SEC
    ) {
        val device = currentDevice ?: run {
            _error.value = "Device non défini"
            return
        }
        val token = authHeader ?: run {
            _error.value = "Session expirée"
            return
        }

        // garde-fou : pas de cooldown < cooldown_min_sec du template sélectionné
        if (cooldownSec < cooldownMinSec) {
            _error.value = "Cooldown minimum : ${cooldownMinSec}s"
            return
        }

        viewModelScope.launch {
            _isLoading.value = true
            try {
                val request = CreateRuleRequest(
                    espId = device.id,
                    field = field,
                    op = op,
                    thresholdNum = threshold,
                    cooldownSec = cooldownSec,
                    enabled = enabled,
                    userLabel = userLabel,
                    templateId = templateId
                )

                val created = ruleRepository.createRule(token, request)
                if (created != null) {
                    refresh()
                } else {
                    _error.value = "Création de règle échouée"
                }
            } catch (e: Exception) {
                _error.value = "Erreur création règle: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun updateRuleThresholdCooldown(
        ruleId: String,
        threshold: Int,
        cooldownSec: Int,
        cooldownMinSec: Int = COOLDOWN_DEFAULT_MIN_SEC,
        field: String = "soundPct",
        op: String = ">",
        templateId: String? = null
    ) {
        val token = authHeader ?: run {
            _error.value = "Non connecté"
            return
        }

        // garde-fou : pas de cooldown < cooldown_min_sec de la règle
        if (cooldownSec < cooldownMinSec) {
            _error.value = "Cooldown minimum : ${cooldownMinSec}s"
            return
        }

        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            try {
                val updated = ruleRepository.updateEspRuleThresholdCooldown(
                    token = token,
                    ruleId = ruleId,
                    threshold = threshold,
                    cooldownSec = cooldownSec,
                    field = field,
                    op = op,
                    templateId = templateId
                )

                if (updated == null) {
                    _error.value = "Impossible de mettre à jour la règle"
                }

                refresh()
            } catch (e: Exception) {
                Log.e(TAG, "❌ updateRuleThresholdCooldown error: ${e.message}", e)
                _error.value = e.message ?: "Erreur inconnue"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun updateRuleStatus(rule: RuleDto, enabled: Boolean) {
        val token = authHeader ?: run {
            _error.value = "Non connecté"
            return
        }

        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            try {
                val updated = ruleRepository.updateEspRuleEnabled(token, rule, enabled)
                if (updated == null) {
                    _error.value = "Impossible de mettre à jour la règle"
                }
                refresh()
            } catch (e: Exception) {
                Log.e(TAG, "❌ updateRuleStatus error: ${e.message}", e)
                _error.value = e.message ?: "Erreur inconnue"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun deleteRule(rule: RuleDto) {
        val token = authHeader ?: run {
            _error.value = "Non connecté"
            return
        }

        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            try {
                val ok = ruleRepository.deleteEspRule(token, rule.id)
                if (!ok) _error.value = "Impossible de supprimer la règle"
                refresh()
            } catch (e: Exception) {
                Log.e(TAG, "❌ deleteRule error: ${e.message}", e)
                _error.value = e.message ?: "Erreur inconnue"
            } finally {
                _isLoading.value = false
            }
        }
    }
}