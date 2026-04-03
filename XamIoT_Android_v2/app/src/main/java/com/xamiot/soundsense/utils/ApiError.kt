package com.xamiot.soundsense.utils

/**
 * Classe scellée pour représenter les différents types d'erreurs API
 */
sealed class ApiError : Exception() {
    data class HttpError(val code: Int, override val message: String = "Erreur HTTP $code") : ApiError()
    data class NetworkError(override val message: String = "Erreur de connexion réseau") : ApiError()
    data class UnknownError(override val message: String = "Erreur inconnue") : ApiError()
    data class ParseError(override val message: String = "Erreur de traitement des données") : ApiError()

    /**
     * Convertit l'erreur en message utilisateur compréhensible
     */
    fun toUserMessage(): String {
        return when (this) {
            is HttpError -> when (code) {
                401 -> "Email ou mot de passe incorrect"
                403 -> "Accès refusé"
                404 -> "Service non trouvé"
                500 -> "Erreur serveur, veuillez réessayer plus tard"
                else -> "Erreur de connexion (code: $code)"
            }
            is NetworkError -> "Vérifiez votre connexion internet"
            is ParseError -> "Erreur de traitement des données"
            is UnknownError -> message
        }
    }
}