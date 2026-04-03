package com.xamiot.soundsense.ui.auth

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch

sealed class ForgotPasswordUiState {
    data object Idle : ForgotPasswordUiState()
    data object Loading : ForgotPasswordUiState()
    data class Success(val message: String) : ForgotPasswordUiState()
    data class Error(val message: String) : ForgotPasswordUiState()
}

class ForgotPasswordViewModel : ViewModel() {

    private val service = ForgotPasswordService()

    private val _uiState = MutableLiveData<ForgotPasswordUiState>(ForgotPasswordUiState.Idle)
    val uiState: LiveData<ForgotPasswordUiState> = _uiState

    // Regex “simple et robuste” (équivalent Swift)
    private val emailRegex = Regex(
        pattern = "^[A-Z0-9._%+\\-]+@[A-Z0-9.\\-]+\\.[A-Z]{2,}$",
        option = RegexOption.IGNORE_CASE
    )

    fun requestReset(emailInput: String) {
        val trimmed = emailInput.trim()

        if (trimmed.isEmpty()) {
            _uiState.value = ForgotPasswordUiState.Error("Veuillez saisir votre e-mail de compte.")
            return
        }
        if (!emailRegex.matches(trimmed)) {
            _uiState.value = ForgotPasswordUiState.Error("Adresse e-mail invalide.")
            return
        }

        _uiState.value = ForgotPasswordUiState.Loading

        viewModelScope.launch {
            try {
                service.requestReset(trimmed)

                // ✅ Réponse neutre comme iOS (pas d'énumération)
                _uiState.value = ForgotPasswordUiState.Success(
                    "Si un compte existe pour cet e-mail, un message vient d’être envoyé."
                )
            } catch (_: Exception) {
                _uiState.value = ForgotPasswordUiState.Error(
                    "Impossible d’envoyer la demande pour le moment. Réessayez."
                )
            }
        }
    }
}
