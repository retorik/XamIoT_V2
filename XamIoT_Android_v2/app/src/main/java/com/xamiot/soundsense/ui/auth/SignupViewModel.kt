package com.xamiot.soundsense.ui.auth

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch

// Etats UI (sealed class)
sealed class SignupUiState {
    data object Idle : SignupUiState()
    data object Loading : SignupUiState()
    data class Success(val emailSent: Boolean) : SignupUiState()
    data class Error(val message: String, val httpCode: Int? = null) : SignupUiState()
}

// Données du formulaire
data class SignupForm(
    val email: String,
    val password: String,
    val confirmPassword: String,
    val firstName: String,
    val lastName: String,
    val countryCode: String, // ex: "+33"
    val localPhone: String   // ex: "0612345678" ou "612345678" (on normalise)
)

class SignupViewModel : ViewModel() {

    // Service REST (doit exister : XamiotAuthService)
    private val service = XamiotAuthService()

    private val _uiState = MutableLiveData<SignupUiState>(SignupUiState.Idle)
    val uiState: LiveData<SignupUiState> = _uiState

    private val _emailError = MutableLiveData<String?>(null)
    val emailError: LiveData<String?> = _emailError

    private val _passwordError = MutableLiveData<String?>(null)
    val passwordError: LiveData<String?> = _passwordError

    private val _confirmPasswordError = MutableLiveData<String?>(null)
    val confirmPasswordError: LiveData<String?> = _confirmPasswordError

    private val _firstNameError = MutableLiveData<String?>(null)
    val firstNameError: LiveData<String?> = _firstNameError

    private val _lastNameError = MutableLiveData<String?>(null)
    val lastNameError: LiveData<String?> = _lastNameError

    private val _countryCodeError = MutableLiveData<String?>(null)
    val countryCodeError: LiveData<String?> = _countryCodeError

    private val _phoneError = MutableLiveData<String?>(null)
    val phoneError: LiveData<String?> = _phoneError

    fun signup(form: SignupForm) {
        clearErrors()

        val normalized = normalize(form)
        if (!validate(normalized)) return

        _uiState.value = SignupUiState.Loading

        viewModelScope.launch {
            try {
                val phoneInternational = buildPhoneInternational(
                    countryCode = normalized.countryCode,
                    localPhone = normalized.localPhone
                )

                val response = service.signup(
                    email = normalized.email,
                    password = normalized.password,
                    firstName = normalized.firstName.trim().takeIf { it.isNotEmpty() },
                    lastName = normalized.lastName.trim().takeIf { it.isNotEmpty() },
                    phone = phoneInternational
                )

                if (response.ok) {
                    _uiState.value = SignupUiState.Success(emailSent = response.emailSent)
                } else {
                    _uiState.value = SignupUiState.Error("Échec de l’inscription.")
                }
            } catch (e: HttpError) {
                val msg = when (e.code) {
                    409 -> "Cet e-mail est déjà utilisé."
                    400 -> "Requête invalide."
                    else -> "Échec de l’inscription (HTTP ${e.code})."
                }
                _uiState.value = SignupUiState.Error(msg, e.code)
            } catch (_: Exception) {
                _uiState.value = SignupUiState.Error("Échec de l’inscription.")
            }
        }
    }

    private fun clearErrors() {
        _emailError.value = null
        _passwordError.value = null
        _confirmPasswordError.value = null
        _firstNameError.value = null
        _lastNameError.value = null
        _countryCodeError.value = null
        _phoneError.value = null
    }

    /**
     * Normalisation inspirée de ton SwiftUI :
     * - email: trim (la mise en lowercase est faite dans le service pour coller à iOS)
     * - phone: digits only + retire le 0 de tête
     * - countryCode: force "+<digits>"
     */
    private fun normalize(form: SignupForm): SignupForm {
        val digits = form.localPhone.replace(Regex("[^0-9]"), "")
        val withoutLeading0 = if (digits.startsWith("0")) digits.drop(1) else digits

        val ccRaw = form.countryCode.trim()
        val cc = when {
            ccRaw.isBlank() -> ""
            ccRaw.startsWith("+") -> "+" + ccRaw.drop(1).replace(Regex("[^0-9]"), "")
            else -> "+" + ccRaw.replace(Regex("[^0-9]"), "")
        }

        return form.copy(
            email = form.email.trim(),
            countryCode = cc,
            localPhone = withoutLeading0
        )
    }

    private fun validate(form: SignupForm): Boolean {
        var ok = true

        val emailTrim = form.email.trim()
        if (emailTrim.isEmpty() || !emailTrim.contains("@")) {
            _emailError.value = "E-mail invalide."
            ok = false
        }

        if (form.firstName.trim().isEmpty()) {
            _firstNameError.value = "Prénom requis."
            ok = false
        }

        if (form.lastName.trim().isEmpty()) {
            _lastNameError.value = "Nom requis."
            ok = false
        }

        if (form.password.length < 6) {
            _passwordError.value = "Mot de passe : au moins 6 caractères."
            ok = false
        }

        if (form.password != form.confirmPassword) {
            _confirmPasswordError.value = "Les mots de passe ne correspondent pas."
            ok = false
        }

        // Téléphone optionnel, mais si saisi => indicatif requis + numéro cohérent
        if (form.localPhone.isNotBlank()) {
            if (form.countryCode.isBlank() || form.countryCode == "+") {
                _countryCodeError.value = "Indicatif requis."
                ok = false
            }
            if (form.localPhone.length < 6) {
                _phoneError.value = "Numéro trop court."
                ok = false
            }
        }

        return ok
    }

    /**
     * Concatène +indicatif + numéro sans 0 de tête.
     * Retourne null si pas de téléphone (optionnel).
     */
    private fun buildPhoneInternational(countryCode: String, localPhone: String): String? {
        if (localPhone.isBlank()) return null
        return countryCode + localPhone
    }
}
