package com.xamiot.soundsense.ui.adapter

import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.xamiot.soundsense.R
import com.xamiot.soundsense.data.remote.dto.DeviceDTO
import com.xamiot.soundsense.ui.view.SoundSparklineView

/**
 * Adapter pour afficher la liste des devices.
 *
 * ✅ Spécificité : les textes "Il y a Xs" (heartbeat) et "Alerte Il y a Xs" doivent se mettre à jour
 * en continu, même sans refresh réseau.
 *
 * Pour ça, MainActivity déclenche un "tick" (payload) toutes les 1s.
 */
class DeviceAdapter(
    private val onDeviceClick: (DeviceDTO) -> Unit
) : ListAdapter<DeviceDTO, DeviceAdapter.DeviceViewHolder>(DeviceDiffCallback()) {

    companion object {
        /** Payload utilisé pour rafraîchir uniquement les infos temporelles (sans rebind complet). */
        const val PAYLOAD_TIME_TICK = "payload_time_tick"
    }

    private val TAG = "DeviceAdapter"

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): DeviceViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_device, parent, false)
        return DeviceViewHolder(view)
    }

    override fun onBindViewHolder(holder: DeviceViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    override fun onBindViewHolder(holder: DeviceViewHolder, position: Int, payloads: MutableList<Any>) {
        if (payloads.isNotEmpty() && payloads.contains(PAYLOAD_TIME_TICK)) {
            // ✅ Mise à jour légère : uniquement textes "Il y a" + indicateur online
            holder.updateTimeOnly(getItem(position))
            return
        }
        super.onBindViewHolder(holder, position, payloads)
    }

    /**
     * ViewHolder pour un device
     */
    inner class DeviceViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val tvDeviceName: TextView = itemView.findViewById(R.id.tvDeviceName)
        private val tvDeviceUid: TextView = itemView.findViewById(R.id.tvDeviceUid)
        private val tvLastSeen: TextView = itemView.findViewById(R.id.tvLastSeen)
        private val tvLastDb: TextView = itemView.findViewById(R.id.tvLastDb)
        private val viewOnlineIndicator: View = itemView.findViewById(R.id.viewOnlineIndicator)
        private val tvLastAlert: TextView = itemView.findViewById(R.id.tvLastAlert)
        private val sparkline: SoundSparklineView = itemView.findViewById(R.id.sparkline)

        fun bind(device: DeviceDTO) {
            // ✅ Log au début du bind (bind complet seulement, pas sur les ticks)
            Log.d(TAG, "========== BIND DEVICE ==========")
            Log.d(TAG, "Device name: ${device.name}")
            Log.d(TAG, "Device id: ${device.id}")
            Log.d(TAG, "lastAlert null: ${device.lastAlert == null}")

            if (device.lastAlert != null) {
                Log.d(TAG, "✅ lastAlert présente:")
                Log.d(TAG, "  - ID: ${device.lastAlert?.id}")
                Log.d(TAG, "  - sentAt: ${device.lastAlert?.sentAt}")
                Log.d(TAG, "  - currentDisplay: ${device.lastAlert?.payload?.currentDisplay}")
            } else {
                Log.w(TAG, "⚠️ Aucune lastAlert pour ce device")
            }

            // Nom du device
            tvDeviceName.text = device.name ?: "Device sans nom"

            // UID masqué
            tvDeviceUid.text = device.getMaskedUid()

            // Niveau sonore
            tvLastDb.text = if (device.lastDb != null) {
                "${device.lastDb} dB"
            } else {
                "-- dB"
            }

            // Sparkline des 30 dernières mesures
            sparkline.setValues(device.soundHistory)

            // Click sur l'item
            itemView.setOnClickListener { onDeviceClick(device) }

            // ✅ Temps + online + dernière alerte
            updateTimeOnly(device)
        }

        /**
         * ✅ Mise à jour légère (appelée toutes les 1s) :
         * - Dernière connexion (Il y a Xs)
         * - Indicateur en ligne/hors ligne (dépend du temps)
         * - Dernière alerte (Alerte Il y a Xs)
         */
        fun updateTimeOnly(device: DeviceDTO) {
            // Dernière connexion (temps relatif)
            tvLastSeen.text = device.getFormattedLastSeen()

            // Indicateur en ligne/hors ligne (dépend du temps courant)
            viewOnlineIndicator.setBackgroundResource(
                if (device.isOnline()) {
                    R.drawable.bg_online_indicator
                } else {
                    R.drawable.bg_offline_indicator
                }
            )

            // Dernière alerte (temps relatif)
            val alertText = device.getFormattedLastAlert()
            if (alertText != null) {
                tvLastAlert.visibility = View.VISIBLE
                tvLastAlert.text = alertText
            } else {
                tvLastAlert.visibility = View.GONE
            }
        }
    }

    /**
     * DiffUtil pour optimiser les mises à jour de la liste
     */
    class DeviceDiffCallback : DiffUtil.ItemCallback<DeviceDTO>() {
        override fun areItemsTheSame(oldItem: DeviceDTO, newItem: DeviceDTO): Boolean {
            return oldItem.id == newItem.id
        }

        override fun areContentsTheSame(oldItem: DeviceDTO, newItem: DeviceDTO): Boolean {
            return oldItem == newItem
        }
    }
}