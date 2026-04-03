package com.xamiot.soundsense.ui.devicedetail

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.switchmaterial.SwitchMaterial
import com.xamiot.soundsense.R
import com.xamiot.soundsense.data.remote.dto.RuleDto

/**
 * Adapter pour afficher les règles d'un capteur
 * Supporte le toggle ON/OFF et le swipe-to-delete
 */
class RuleAdapter(
    private val onToggleRule: (RuleDto, Boolean) -> Unit,
    private val onRuleClick: (RuleDto) -> Unit
) : ListAdapter<RuleDto, RuleAdapter.RuleViewHolder>(RuleDiffCallback()) {

    inner class RuleViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        private val tvRuleTitle: TextView = view.findViewById(R.id.tvRuleTitle)
        private val tvRuleDetails: TextView = view.findViewById(R.id.tvRuleDetails)
        private val tvRuleDate: TextView = view.findViewById(R.id.tvRuleDate)
        private val switchEnabled: SwitchMaterial = view.findViewById(R.id.switchEnabled)

        fun bind(rule: RuleDto) {
            // TITRE : "Niveau sonore > 50 dB"
            tvRuleTitle.text = buildRuleTitle(rule)

            // DÉTAILS : "Cooldown : 60s"
            tvRuleDetails.text = "Cooldown : ${rule.cooldownSec ?: 0}s"

            // DATE : "créée: 15 janvier 2025"
            tvRuleDate.text = rule.getFormattedCreatedAt()

            // SWITCH : État actif/inactif
            switchEnabled.isChecked = rule.enabled
            switchEnabled.setOnCheckedChangeListener { _, isChecked ->
                onToggleRule(rule, isChecked)
            }

            // CLIC : Éditer la règle
            itemView.setOnClickListener {
                onRuleClick(rule)
            }
        }

        /**
         * Construit le titre formaté de la règle
         * Ex: "Niveau sonore > 50.0 dB"
         */
        private fun buildRuleTitle(rule: RuleDto): String {
            val fieldName = when (rule.field) {
                "sound_level" -> "Niveau sonore"
                else -> rule.field
            }

            val operator = when (rule.op) {
                "gt" -> ">"
                "lt" -> "<"
                "eq" -> "="
                "gte" -> "≥"
                "lte" -> "≤"
                else -> rule.op
            }

            val threshold = rule.thresholdNum?.toString() ?: rule.thresholdStr ?: "?"

            return "$fieldName $operator $threshold dB"
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RuleViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_rule, parent, false)
        return RuleViewHolder(view)
    }

    override fun onBindViewHolder(holder: RuleViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    class RuleDiffCallback : DiffUtil.ItemCallback<RuleDto>() {
        override fun areItemsTheSame(oldItem: RuleDto, newItem: RuleDto): Boolean {
            return oldItem.id == newItem.id
        }

        override fun areContentsTheSame(oldItem: RuleDto, newItem: RuleDto): Boolean {
            return oldItem == newItem
        }
    }
}
