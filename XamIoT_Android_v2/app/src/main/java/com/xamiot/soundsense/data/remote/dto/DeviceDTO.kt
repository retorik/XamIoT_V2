package com.xamiot.soundsense.data.remote.dto

import com.google.gson.annotations.SerializedName
import java.text.SimpleDateFormat
import java.util.*
import android.os.Parcelable
import kotlinx.parcelize.Parcelize

/**
 * Représente un capteur audio ESP32
 * Correspond EXACTEMENT à la structure renvoyée par l'API
 */
@Parcelize
data class DeviceDTO(
    @SerializedName("id")
    val id: String,

    @SerializedName("esp_uid")
    val espUid: String?,

    @SerializedName("name")
    val name: String?,

    @SerializedName("topic_prefix")
    val topicPrefix: String?,

    @SerializedName("last_seen")
    val lastSeen: String?,

    @SerializedName("last_db")
    val lastDb: Int?,

    @SerializedName("last_alert")
    var lastAlert: AlertDto? = null,

    @SerializedName("sound_history")
    val soundHistory: List<Double> = emptyList()
) :Parcelable {
    /**
     * Affiche si le device est en ligne (sous moins de 5 mins)
     */
    fun isOnline(): Boolean {
        if (lastSeen == null) return false

        return try {
            val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
            format.timeZone = TimeZone.getTimeZone("UTC")

            val date = format.parse(lastSeen) ?: return false
            val now = Date()
            val diffMs = now.time - date.time
            val minutes = diffMs / (60 * 1000)

            minutes < 5
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Masque l'UID pour l'affichage
     * Ex: "0C784DA04E0C" → "0C784D******"
     */
    fun getMaskedUid(): String {
        if (espUid.isNullOrBlank()) return "UID non disponible"

        return try {
            if (espUid.length >= 6) {
                val visible = espUid.substring(0, espUid.length - 6)
                "$visible******"
            } else {
                "******"
            }
        } catch (e: Exception) {
            "UID invalide"
        }
    }
    // ==========================================================
    // FONCTION GÉNÉRIQUE DE FORMATAGE DU TEMPS ÉCOULÉ
    // ==========================================================

    /**
     * Formate le temps écoulé depuis une date ISO 8601
     *
     * @param isoDate Date au format ISO 8601 (ex: "2024-01-15T10:30:45.123Z")
     * @param defaultText Texte par défaut si la date est null ou invalide
     * @return Texte formaté "Il y a Xmin Ys" / "Il y a Xh Ymin" / "Il y a Xj"
     */
    private fun formatTimeElapsed(isoDate: String?, defaultText: String = "Date inconnue"): String {
        if (isoDate.isNullOrBlank()) return defaultText

        return try {
            // Parse de la date ISO 8601 UTC
            val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
            format.timeZone = TimeZone.getTimeZone("UTC")

            val date = format.parse(isoDate) ?: return defaultText
            val now = Date()
            val diffMs = now.time - date.time

            // Calcul des unités de temps
            val seconds = (diffMs / 1000).toInt()
            val minutes = (diffMs / (60 * 1000)).toInt()
            val hours = (diffMs / (60 * 60 * 1000)).toInt()
            val days = (diffMs / (24 * 60 * 60 * 1000)).toInt()

            // Formatage avec détails
            when {
                seconds < 60 -> {
                    "Il y a ${seconds}s"
                }
                minutes < 60 -> {
                    val remainingSeconds = seconds % 60
                    if (remainingSeconds > 0) {
                        "Il y a ${minutes}min ${remainingSeconds}s"
                    } else {
                        "Il y a ${minutes}min"
                    }
                }
                hours < 24 -> {
                    val remainingMinutes = minutes % 60
                    if (remainingMinutes > 0) {
                        "Il y a ${hours}h ${remainingMinutes}min"
                    } else {
                        "Il y a ${hours}h"
                    }
                }
                days < 7 -> {
                    val remainingHours = hours % 24
                    if (remainingHours > 0) {
                        "Il y a ${days}j ${remainingHours}h"
                    } else {
                        "Il y a ${days}j"
                    }
                }
                else -> {
                    "Il y a ${days}j"
                }
            }
        } catch (e: Exception) {
            defaultText
        }
    }

    // ==========================================================
    // FONCTIONS PUBLIQUES UTILISANT LA FONCTION GÉNÉRIQUE
    // ==========================================================

    /**
     * Formate le temps écoulé depuis last_seen
     * Utilise la fonction générique formatTimeElapsed()
     *
     * @return Texte formaté "Il y a Xmin Ys" ou "Jamais connecté"
     */
    fun getFormattedLastSeen(): String {
        return formatTimeElapsed(lastSeen, "Jamais connecté")
    }

    /**
     * Formate la dernière alerte pour l'affichage
     * Utilise la fonction générique formatTimeElapsed()
     *
     * @return Texte formaté "🔔 Alerte Il y a Xmin Ys : Y dB" ou null si pas d'alerte
     */
    fun getFormattedLastAlert(): String? {
        val alert = lastAlert ?: return null

        val timeText = formatTimeElapsed(alert.sentAt, "Date inconnue")
        return "🔔 Alerte $timeText : ${alert.payload?.currentDisplay ?: "---"}"
    }
}
