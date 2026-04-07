package com.xamiot.soundsense.ui.devicedetail

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.google.android.material.button.MaterialButton
import com.google.android.material.switchmaterial.SwitchMaterial
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import com.google.gson.Gson
import com.xamiot.soundsense.R
import com.xamiot.soundsense.data.remote.dto.DeviceMetaDto

/**
 * BottomSheet de création / modification de règle.
 *
 * - Mode CREATE : template selector (si disponible) + user_label + spinner opérateurs
 *                 (depuis field_operators du template) + seuil (bornes field_min/field_max)
 *                 + cooldown (≥ cooldown_min_sec du template) + enabled
 * - Mode EDIT   : seuil + cooldown uniquement (le toggle d'activation reste dans la liste)
 *
 * Fallback si meta null : field="soundPct", op=">", cooldown min 60s, bornes 0-200.
 */
class RuleCreateBottomSheet : BottomSheetDialogFragment() {

    companion object {
        // FragmentResult
        const val REQUEST_KEY = "create_rule_request"

        const val RESULT_THRESHOLD = "result_threshold"
        const val RESULT_COOLDOWN = "result_cooldown"
        const val RESULT_ENABLED = "result_enabled"
        const val RESULT_RULE_ID = "result_rule_id"
        const val RESULT_FIELD = "result_field"
        const val RESULT_OP = "result_op"
        const val RESULT_USER_LABEL = "result_user_label"
        const val RESULT_TEMPLATE_ID = "result_template_id"
        const val RESULT_COOLDOWN_MIN_SEC = "result_cooldown_min_sec"

        // Arguments internes
        private const val ARG_MODE = "arg_mode"
        private const val ARG_RULE_ID = "arg_rule_id"
        private const val ARG_META_JSON = "arg_meta_json"
        private const val ARG_FIELD = "arg_field"
        private const val ARG_OP = "arg_op"
        private const val ARG_TEMPLATE_ID = "arg_template_id"

        private const val MODE_CREATE = "create"
        private const val MODE_EDIT = "edit"

        private const val DEFAULT_COOLDOWN_MIN_SEC = 60
        private const val DEFAULT_THRESHOLD_MIN = 0
        private const val DEFAULT_THRESHOLD_MAX = 200

        fun newInstance(
            thresholdDefault: Int = 50,
            cooldownDefault: Int = DEFAULT_COOLDOWN_MIN_SEC,
            enabledDefault: Boolean = true,
            meta: DeviceMetaDto? = null
        ): RuleCreateBottomSheet {
            return RuleCreateBottomSheet().apply {
                arguments = Bundle().apply {
                    putString(ARG_MODE, MODE_CREATE)
                    putInt(RESULT_THRESHOLD, thresholdDefault)
                    putInt(RESULT_COOLDOWN, cooldownDefault)
                    putBoolean(RESULT_ENABLED, enabledDefault)
                    if (meta != null) {
                        putString(ARG_META_JSON, Gson().toJson(meta))
                    }
                }
            }
        }

        fun newEditInstance(
            ruleId: String,
            thresholdDefault: Int,
            cooldownDefault: Int,
            enabledDefault: Boolean,
            cooldownMinSec: Int = DEFAULT_COOLDOWN_MIN_SEC,
            field: String = "soundPct",
            op: String = ">",
            templateId: String? = null,
            meta: DeviceMetaDto? = null
        ): RuleCreateBottomSheet {
            return RuleCreateBottomSheet().apply {
                arguments = Bundle().apply {
                    putString(ARG_MODE, MODE_EDIT)
                    putString(ARG_RULE_ID, ruleId)
                    putInt(RESULT_THRESHOLD, thresholdDefault)
                    putInt(RESULT_COOLDOWN, cooldownDefault)
                    putBoolean(RESULT_ENABLED, enabledDefault)
                    putInt(RESULT_COOLDOWN_MIN_SEC, cooldownMinSec)
                    putString(ARG_FIELD, field)
                    putString(ARG_OP, op)
                    if (templateId != null) putString(ARG_TEMPLATE_ID, templateId)
                    if (meta != null) putString(ARG_META_JSON, Gson().toJson(meta))
                }
            }
        }
    }

    private var mode: String = MODE_CREATE
    private var ruleId: String? = null
    private var meta: DeviceMetaDto? = null

    private var threshold: Int = 50
    private var cooldown: Int = DEFAULT_COOLDOWN_MIN_SEC
    private var enabled: Boolean = true
    private var cooldownMinSec: Int = DEFAULT_COOLDOWN_MIN_SEC
    private var thresholdMin: Int = DEFAULT_THRESHOLD_MIN
    private var thresholdMax: Int = DEFAULT_THRESHOLD_MAX
    private var currentField: String = "soundPct"
    private var currentOp: String = ">"

    // Template sélectionné (CREATE et EDIT)
    private var selectedTemplateIndex: Int = -1
    private var initialTemplateId: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        mode = arguments?.getString(ARG_MODE, MODE_CREATE) ?: MODE_CREATE
        ruleId = arguments?.getString(ARG_RULE_ID)

        val metaJson = arguments?.getString(ARG_META_JSON)
        if (!metaJson.isNullOrBlank()) {
            meta = try { Gson().fromJson(metaJson, DeviceMetaDto::class.java) } catch (_: Exception) { null }
        }

        initialTemplateId = arguments?.getString(ARG_TEMPLATE_ID)
        threshold = arguments?.getInt(RESULT_THRESHOLD, 50) ?: 50

        // En mode EDIT, cooldownMinSec peut être transmis depuis la règle (cooldown_min_sec)
        if (mode == MODE_EDIT) {
            cooldownMinSec = arguments?.getInt(RESULT_COOLDOWN_MIN_SEC, DEFAULT_COOLDOWN_MIN_SEC) ?: DEFAULT_COOLDOWN_MIN_SEC
            currentField = arguments?.getString(ARG_FIELD, "soundPct") ?: "soundPct"
            currentOp = arguments?.getString(ARG_OP, ">") ?: ">"
        }

        val incomingCooldown = arguments?.getInt(RESULT_COOLDOWN, cooldownMinSec) ?: cooldownMinSec
        cooldown = incomingCooldown.coerceAtLeast(cooldownMinSec)

        enabled = arguments?.getBoolean(RESULT_ENABLED, true) ?: true
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        return inflater.inflate(R.layout.sheet_rule_create, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val btnCancel = view.findViewById<TextView>(R.id.btnCancel)
        val btnCreate = view.findViewById<MaterialButton>(R.id.btnCreateRule)

        val tvThresholdLabel = view.findViewById<TextView>(R.id.tvThresholdLabel)
        val tvThresholdValue = view.findViewById<TextView>(R.id.tvThresholdValue)
        val btnThresholdMinus = view.findViewById<MaterialButton>(R.id.btnThresholdMinus)
        val btnThresholdPlus = view.findViewById<MaterialButton>(R.id.btnThresholdPlus)

        val tvCooldownValue = view.findViewById<TextView>(R.id.tvCooldownValue)
        val btnCooldownMinus = view.findViewById<MaterialButton>(R.id.btnCooldownMinus)
        val btnCooldownPlus = view.findViewById<MaterialButton>(R.id.btnCooldownPlus)

        val switchEnabled = view.findViewById<SwitchMaterial>(R.id.switchEnabled)
        val etUserLabel = view.findViewById<TextInputEditText?>(R.id.etUserLabel)
        val tilUserLabel = view.findViewById<TextInputLayout?>(R.id.tilUserLabel)
        val rgTemplates = view.findViewById<RadioGroup?>(R.id.rgTemplates)
        val llOperatorRow = view.findViewById<LinearLayout?>(R.id.llOperatorRow)
        val spinnerOperator = view.findViewById<Spinner?>(R.id.spinnerOperator)

        btnCreate.text = if (mode == MODE_EDIT) "Modifier" else "Créer"

        if (mode == MODE_EDIT) {
            // En édition : on masque user_label et enabled — mais on affiche l'opérateur et les templates
            switchEnabled.visibility = View.GONE
            tilUserLabel?.visibility = View.GONE

            // Afficher le spinner d'opérateur et pré-sélectionner l'opérateur courant
            if (spinnerOperator != null && llOperatorRow != null) {
                val operators = listOf(">", ">=", "<", "<=", "==", "!=")
                val adapter = ArrayAdapter(
                    spinnerOperator.context,
                    R.layout.item_spinner_device,
                    operators
                )
                adapter.setDropDownViewResource(R.layout.item_spinner_device_dropdown)
                spinnerOperator.adapter = adapter
                val opIndex = operators.indexOf(currentOp).takeIf { it >= 0 } ?: 0
                spinnerOperator.setSelection(opIndex)
                llOperatorRow.visibility = View.VISIBLE
            }

            // Afficher les templates comme en mode CREATE
            val templates = meta?.ruleTemplates.orEmpty()
            if (templates.isNotEmpty() && rgTemplates != null) {
                rgTemplates.visibility = View.VISIBLE
                rgTemplates.removeAllViews()

                var radioToCheck: RadioButton? = null
                templates.forEachIndexed { index, template ->
                    val rb = RadioButton(requireContext()).apply {
                        id = View.generateViewId()
                        text = template.name
                        setTextColor(0xFFFFFFFF.toInt())
                        tag = index
                    }
                    rgTemplates.addView(rb)
                    if (template.id == initialTemplateId) {
                        radioToCheck = rb
                        selectedTemplateIndex = index
                    }
                }

                rgTemplates.setOnCheckedChangeListener { group, checkedId ->
                    val rb = group.findViewById<RadioButton>(checkedId)
                    val idx = rb?.tag as? Int ?: return@setOnCheckedChangeListener
                    selectedTemplateIndex = idx
                    val tpl = templates.getOrNull(idx) ?: return@setOnCheckedChangeListener
                    applyTemplate(tpl, tvThresholdLabel, spinnerOperator, llOperatorRow)
                    cooldown = cooldown.coerceAtLeast(cooldownMinSec)
                    tvCooldownValue.text = "${cooldown}s"
                }

                radioToCheck?.isChecked = true
            } else {
                rgTemplates?.visibility = View.GONE
            }
        } else {
            // Mode CREATE : afficher le champ user_label
            tilUserLabel?.visibility = View.VISIBLE

            val templates = meta?.ruleTemplates.orEmpty()
            if (templates.isNotEmpty() && rgTemplates != null) {
                rgTemplates.visibility = View.VISIBLE
                rgTemplates.removeAllViews()

                templates.forEachIndexed { index, template ->
                    val rb = RadioButton(requireContext()).apply {
                        id = View.generateViewId()
                        text = template.name
                        setTextColor(0xFFFFFFFF.toInt())
                        tag = index
                    }
                    rgTemplates.addView(rb)

                    if (index == 0) {
                        rb.isChecked = true
                        selectedTemplateIndex = 0
                        applyTemplate(template, tvThresholdLabel, spinnerOperator, llOperatorRow)
                    }
                }

                rgTemplates.setOnCheckedChangeListener { group, checkedId ->
                    val rb = group.findViewById<RadioButton>(checkedId)
                    val idx = rb?.tag as? Int ?: return@setOnCheckedChangeListener
                    selectedTemplateIndex = idx
                    val tpl = templates.getOrNull(idx) ?: return@setOnCheckedChangeListener
                    applyTemplate(tpl, tvThresholdLabel, spinnerOperator, llOperatorRow)
                    cooldown = cooldown.coerceAtLeast(cooldownMinSec)
                    tvCooldownValue.text = "${cooldown}s"
                }
            } else {
                // Pas de templates : fallback field=soundPct op=>
                rgTemplates?.visibility = View.GONE
                llOperatorRow?.visibility = View.GONE
                cooldownMinSec = DEFAULT_COOLDOWN_MIN_SEC
                thresholdMin = DEFAULT_THRESHOLD_MIN
                thresholdMax = DEFAULT_THRESHOLD_MAX
            }
        }

        fun refreshUi() {
            tvThresholdValue.text = threshold.toString()
            tvCooldownValue.text = "${cooldown}s"
            switchEnabled.isChecked = enabled
        }

        refreshUi()

        btnCancel.setOnClickListener { dismiss() }

        btnThresholdMinus.setOnClickListener {
            threshold = (threshold - 1).coerceAtLeast(thresholdMin)
            refreshUi()
        }
        btnThresholdPlus.setOnClickListener {
            threshold = (threshold + 1).coerceAtMost(thresholdMax)
            refreshUi()
        }

        btnCooldownMinus.setOnClickListener {
            cooldown = (cooldown - 10).coerceAtLeast(cooldownMinSec)
            refreshUi()
        }
        btnCooldownPlus.setOnClickListener {
            cooldown = (cooldown + 10).coerceAtMost(3600)
            refreshUi()
        }

        switchEnabled.setOnCheckedChangeListener { _, isChecked ->
            enabled = isChecked
        }

        fun submit() {
            if (cooldown < cooldownMinSec) {
                Toast.makeText(requireContext(), "Cooldown minimum : ${cooldownMinSec}s", Toast.LENGTH_SHORT).show()
                return
            }

            val templates = meta?.ruleTemplates.orEmpty()
            val selectedTemplate = templates.getOrNull(selectedTemplateIndex)

            // field : depuis le template sélectionné si disponible, sinon currentField en EDIT,
            // sinon premier template disponible dans les métadonnées (jamais de valeur en dur)
            val field = selectedTemplate?.field
                ?: if (mode == MODE_EDIT) currentField
                else meta?.ruleTemplates?.firstOrNull()?.field ?: currentField

            // op : depuis le spinner si affiché (CREATE ou EDIT), sinon premier opérateur du template, sinon fallback
            val op = if (spinnerOperator != null && spinnerOperator.visibility == View.VISIBLE) {
                spinnerOperator.selectedItem as? String ?: currentOp
            } else if (mode == MODE_EDIT) {
                currentOp
            } else {
                selectedTemplate?.fieldOperators?.firstOrNull() ?: ">"
            }

            val templateId = selectedTemplate?.id
            val userLabel = etUserLabel?.text?.toString()?.takeIf { it.isNotBlank() }

            parentFragmentManager.setFragmentResult(
                REQUEST_KEY,
                Bundle().apply {
                    putInt(RESULT_THRESHOLD, threshold)
                    putInt(RESULT_COOLDOWN, cooldown)
                    putBoolean(RESULT_ENABLED, enabled)
                    putString(RESULT_FIELD, field)
                    putString(RESULT_OP, op)
                    putInt(RESULT_COOLDOWN_MIN_SEC, cooldownMinSec)
                    userLabel?.let { putString(RESULT_USER_LABEL, it) }
                    templateId?.let { putString(RESULT_TEMPLATE_ID, it) }
                    ruleId?.let { putString(RESULT_RULE_ID, it) }
                }
            )
            dismiss()
        }

        btnCreate.setOnClickListener { submit() }
    }

    /**
     * Applique les contraintes d'un template sélectionné :
     * - met à jour cooldownMinSec, thresholdMin, thresholdMax
     * - peuple le spinner d'opérateurs
     * - met à jour le label du champ
     */
    private fun applyTemplate(
        template: DeviceMetaDto.RuleTemplateInfo,
        tvThresholdLabel: TextView,
        spinnerOperator: Spinner?,
        llOperatorRow: LinearLayout?
    ) {
        cooldownMinSec = template.cooldownMinSec
        cooldown = cooldown.coerceAtLeast(cooldownMinSec)

        thresholdMin = template.fieldMin?.toInt() ?: DEFAULT_THRESHOLD_MIN
        thresholdMax = template.fieldMax?.toInt() ?: DEFAULT_THRESHOLD_MAX
        threshold = threshold.coerceIn(thresholdMin, thresholdMax)

        // Label du champ : "Niveau sonore (%)" par exemple
        val unit = template.fieldUnit
        tvThresholdLabel.text = if (!unit.isNullOrBlank()) {
            "${template.fieldLabel} ($unit)"
        } else {
            template.fieldLabel
        }

        // Spinner des opérateurs
        if (spinnerOperator != null && template.fieldOperators.isNotEmpty()) {
            val adapter = ArrayAdapter(
                spinnerOperator.context,
                R.layout.item_spinner_device,
                template.fieldOperators
            )
            adapter.setDropDownViewResource(R.layout.item_spinner_device_dropdown)
            spinnerOperator.adapter = adapter
            llOperatorRow?.visibility = View.VISIBLE
        } else {
            llOperatorRow?.visibility = View.GONE
        }
    }
}
