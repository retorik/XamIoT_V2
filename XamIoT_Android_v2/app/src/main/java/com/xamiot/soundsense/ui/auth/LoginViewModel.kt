package com.xamiot.soundsense.ui.auth

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.google.firebase.messaging.FirebaseMessaging
import com.xamiot.soundsense.data.local.TokenManager
import com.xamiot.soundsense.data.remote.dto.LoginResponse
import com.xamiot.soundsense.data.repository.AuthRepository
import com.xamiot.soundsense.utils.ApiError
import com.xamiot.soundsense.utils.ApiResult
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class LoginViewModel(application: Application) : AndroidViewModel(application) {

    private val authRepository = AuthRepository(application)
    private val tokenManager = TokenManager(application)

    private val _loginState = MutableLiveData<ApiResult<LoginResponse>?>(null)
    val loginState: LiveData<ApiResult<LoginResponse>?> = _loginState

    private val _emailError = MutableLiveData<String?>(null)
    val emailError: LiveData<String?> = _emailError

    private val _passwordError = MutableLiveData<String?>(null)
    val passwordError: LiveData<String?> = _passwordError

    fun resetLoginState() {
        _loginState.value = null
    }

    fun login(email: String, password: String, onLoginSuccess: (() -> Unit)? = null) {
        val mail = email.trim()
        val pass = password

        var ok = true
        if (mail.isBlank()) {
            _emailError.value = "Veuillez saisir votre e-mail."
            ok = false
        } else {
            _emailError.value = null
        }

        if (pass.isBlank()) {
            _passwordError.value = "Veuillez saisir votre mot de passe."
            ok = false
        } else {
            _passwordError.value = null
        }

        if (!ok) return

        _loginState.value = ApiResult.Loading

        viewModelScope.launch {
            when (val result = authRepository.login(mail, pass)) {

                ApiResult.Loading -> {
                    _loginState.value = ApiResult.Loading
                }

                is ApiResult.Success<*> -> {
                    val loginResponse = result.data as? LoginResponse
                    if (loginResponse == null) {
                        _loginState.value =
                            ApiResult.Error(ApiError.NetworkError("Réponse de connexion invalide."))
                        return@launch
                    }

                    // Sauvegarde token + infos user
                    tokenManager.saveToken(
                        token = loginResponse.token,
                        email = mail,
                        userId = loginResponse.userId
                    )

                    // Enregistre le token FCM localement + tente register côté API
                    try {
                        // 1) On prend en priorité un token déjà connu (cas où FirebaseMessaging.token.await() échoue)
                        val cached = tokenManager.getFcmToken()

                        // 2) Sinon on demande à Firebase
                        val fcmToken = if (!cached.isNullOrBlank()) {
                            cached
                        } else {
                            FirebaseMessaging.getInstance().token.await()
                        }

                        if (!fcmToken.isNullOrBlank()) {
                            tokenManager.saveFcmToken(fcmToken)

                            // ✅ Force l’upsert /devices à chaque login (robuste si DB a été vidée/restaurée)
                            authRepository.registerSmartphoneIfNeeded(fcmToken, force = true)
                        }
                    } catch (_: Exception) {
                        // on ne bloque pas le login si FCM échoue
                    }

                    _loginState.value = ApiResult.Success(loginResponse)
                    onLoginSuccess?.invoke()
                }

                is ApiResult.Error -> {
                    _loginState.value = result
                }
            }
        }
    }
}
