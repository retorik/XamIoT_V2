package com.xamiot.soundsense.utils

/**
 * Classe représentant le résultat d'un appel API
 */
sealed class ApiResult<out T> {
    /**
     * État de chargement
     */
    object Loading : ApiResult<Nothing>()

    /**
     * Succès avec données
     */
    data class Success<T>(val data: T) : ApiResult<T>()

    /**
     * Erreur
     */
    data class Error(val error: ApiError) : ApiResult<Nothing>()
}
