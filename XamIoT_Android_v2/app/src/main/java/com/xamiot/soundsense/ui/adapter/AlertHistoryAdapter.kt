package com.xamiot.soundsense.ui.devicedetail

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.xamiot.soundsense.R
import com.xamiot.soundsense.data.remote.dto.AlertDto
import java.text.SimpleDateFormat
import java.util.*

/**
 * Adapter pour afficher l'historique des alertes
 * Utilise les vraies propriétés de AlertDto
 */
class AlertHistoryAdapter : ListAdapter<AlertDto, AlertHistoryAdapter.AlertViewHolder>(AlertDiffCallback()) {

    inner class AlertViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        private val tvAlertTitle: TextView = view.findViewById(R.id.tvAlertTitle)
        private val tvAlertDate: TextView = view.findViewById(R.id.tvAlertDate)
        private val tvAlertDescription: TextView = view.findViewById(R.id.tvAlertDescription)
        private val ivStatus: ImageView = view.findViewById(R.id.ivStatus)

        fun bind(alert: AlertDto) {
            // TITRE : Affiche le niveau sonore capturé
            tvAlertTitle.text = "Seuil dépassé : ${alert.payload?.currentDisplay ?: alert.payload?.body ?: "—"}"

            // DATE : Format "15 janvier 2024  10:30  sent"
            tvAlertDate.text = formatAlertDate(alert.sentAt)

            // DESCRIPTION : Détails complets
            tvAlertDescription.text = buildAlertDescription(alert)

            // STATUT : Badge selon le status de l'API
            updateStatus(alert.status ?: "unknown")
        }

        /**
         * Formate la date selon le modèle iOS
         * Entrée : "2025-12-31T15:08:12.547Z"
         * Sortie : "31 décembre 2025  15:08  sent"
         */
        private fun formatAlertDate(isoDate: String?): String {
            if (isoDate.isNullOrBlank()) return "Date inconnue"

            return try {
                val inputFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
                inputFormat.timeZone = TimeZone.getTimeZone("UTC")

                val date = inputFormat.parse(isoDate) ?: return "Date invalide"

                val outputFormat = SimpleDateFormat("d MMMM yyyy  HH:mm", Locale.FRENCH)
                "${outputFormat.format(date)}  sent"
            } catch (e: Exception) {
                "Format invalide"
            }
        }

        /**
         * Construit la description complète de l'alerte
         * Ex: "Niveau sonore : 53 xB. Périphérique : Proto 0C. Canal : email"
         */
        private fun buildAlertDescription(alert: AlertDto): String {
            return buildString {
                // Niveau sonore capturé
                alert.payload?.currentDisplay?.let { append("Niveau sonore : $it.") }

                // Nom du périphérique
                alert.payload?.deviceName?.let { append(" Périphérique : $it.") }

                // Canal d'envoi
                alert.channel?.let { append(" Canal : $it") }

                // Erreur éventuelle
                alert.error?.let {
                    append("\nErreur : $it")
                }
            }
        }

        /**
         * Met à jour l'icône de statut selon le status API
         * - "sent" = ✅ vert
         * - "failed" = ❌ rouge
         */
        private fun updateStatus(status: String?) {
            when (status?.lowercase()) {
                "sent" -> {
                    ivStatus.setImageResource(R.drawable.ic_check_circle)
                    ivStatus.setColorFilter(itemView.context.getColor(android.R.color.holo_green_light))
                    ivStatus.contentDescription = "Envoyée"
                }
                "failed" -> {
                    ivStatus.setImageResource(R.drawable.ic_error)
                    ivStatus.setColorFilter(itemView.context.getColor(android.R.color.holo_red_light))
                    ivStatus.contentDescription = "Échec"
                }
                else -> {
                    ivStatus.setImageResource(R.drawable.ic_check_circle)
                    ivStatus.setColorFilter(itemView.context.getColor(android.R.color.darker_gray))
                    ivStatus.contentDescription = status
                }
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): AlertViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_alert_history, parent, false)
        return AlertViewHolder(view)
    }

    override fun onBindViewHolder(holder: AlertViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    private class AlertDiffCallback : DiffUtil.ItemCallback<AlertDto>() {
        override fun areItemsTheSame(oldItem: AlertDto, newItem: AlertDto): Boolean {
            return oldItem.id == newItem.id
        }

        override fun areContentsTheSame(oldItem: AlertDto, newItem: AlertDto): Boolean {
            return oldItem == newItem
        }
    }
}
