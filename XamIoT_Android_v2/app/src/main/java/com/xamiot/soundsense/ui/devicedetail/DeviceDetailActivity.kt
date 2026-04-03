package com.xamiot.soundsense.ui.devicedetail

import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.widget.Toast
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import androidx.recyclerview.widget.DividerItemDecoration
import androidx.recyclerview.widget.ItemTouchHelper
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.xamiot.soundsense.data.remote.dto.DeviceDTO
import com.xamiot.soundsense.data.remote.dto.RuleDto
import com.xamiot.soundsense.databinding.ActivityDeviceDetailBinding
import com.xamiot.soundsense.data.local.TokenManager
import dagger.hilt.android.AndroidEntryPoint

/**
 * Activité affichant les détails d'un device :
 * - Liste des règles (avec toggle ON/OFF + swipe actions)
 * - Historique des alertes
 * - Ajout de nouvelle règle via FAB
 */
@AndroidEntryPoint
class DeviceDetailActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "DeviceDetailActivity"
        const val EXTRA_DEVICE = "device"
    }

    // ViewBinding
    private lateinit var binding: ActivityDeviceDetailBinding

    // ViewModel
    private val viewModel: DeviceDetailViewModel by viewModels()

    // Device affiché
    private var currentDevice: DeviceDTO? = null

    // Adapters
    private lateinit var ruleAdapter: RuleAdapter
    private lateinit var alertHistoryAdapter: AlertHistoryAdapter
    // ✅ Ticker UI : met à jour en continu l'affichage du dernier heartbeat ("Il y a Xs")
    private val timeTickerHandler = Handler(Looper.getMainLooper())
    private val timeTickerRunnable = object : Runnable {
        override fun run() {
            updateLastSeenRelative()
            timeTickerHandler.postDelayed(this, 1000L)
        }
    }


    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityDeviceDetailBinding.inflate(layoutInflater)
        setContentView(binding.root)

        Log.d(TAG, "🚀 Démarrage DeviceDetailActivity")

        // Récupération du device depuis l'Intent
        currentDevice = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(EXTRA_DEVICE, DeviceDTO::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(EXTRA_DEVICE)
        }

        if (currentDevice == null) {
            Log.e(TAG, "❌ Aucun device fourni")
            Toast.makeText(this, "Erreur : capteur introuvable", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        Log.d(TAG, "📱 Device chargé : ${currentDevice?.name} (${currentDevice?.espUid})")

        // Initialisation de l'UI
        setupToolbar()
        setupUI()
        setupRecyclerViews()
        setupClickListeners()
        observeViewModel()

        // Passer le device au ViewModel
        val authHeader = TokenManager(this).getAuthHeader()
        if (authHeader == null) {
            Toast.makeText(this, "Session expirée, merci de vous reconnecter", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        currentDevice?.let { device ->
            viewModel.setDevice(device, authHeader)
        }
    }
    override fun onStart() {
        super.onStart()
        // ✅ Démarre le ticker (mise à jour temps relatif)
        timeTickerHandler.removeCallbacks(timeTickerRunnable)
        timeTickerHandler.post(timeTickerRunnable)
    }

    override fun onResume() {
        super.onResume()
        // Rafraîchit les règles à chaque retour sur cet écran (backoffice, autre app, etc.)
        viewModel.refresh()
    }

    override fun onStop() {
        super.onStop()
        // ✅ Stoppe le ticker pour éviter des updates en arrière-plan
        timeTickerHandler.removeCallbacks(timeTickerRunnable)
    }


    /**
     * Configuration de la toolbar
     */
    private fun setupToolbar() {
        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.setDisplayShowHomeEnabled(true)

        binding.toolbar.setNavigationOnClickListener {
            finish()
        }
    }

    /**
     * Configuration des RecyclerViews
     */
    private fun setupRecyclerViews() {
        // Adapter des règles
        ruleAdapter = RuleAdapter(
            onToggleRule = { rule, enabled ->
                Log.d(TAG, "🔄 Toggle règle ${rule.id} : $enabled")
                viewModel.updateRuleStatus(rule, enabled)
            },
            onRuleClick = { rule ->
                // On garde le comportement simple : tap => modifier
                Log.d(TAG, "✏️ Tap règle => édition : ${rule.id}")
                showEditRuleSheet(rule)
            }
        )

        binding.rvRules.apply {
            adapter = ruleAdapter
            layoutManager = LinearLayoutManager(this@DeviceDetailActivity)
            addItemDecoration(DividerItemDecoration(context, DividerItemDecoration.VERTICAL))
        }

        // Adapter de l'historique
        alertHistoryAdapter = AlertHistoryAdapter()

        binding.rvAlertHistory.apply {
            adapter = alertHistoryAdapter
            layoutManager = LinearLayoutManager(this@DeviceDetailActivity)
            addItemDecoration(DividerItemDecoration(context, DividerItemDecoration.VERTICAL))
        }

        // Swipe actions pour les règles : Modifier / Supprimer
        val swipeHandler = object : ItemTouchHelper.SimpleCallback(
            0,
            ItemTouchHelper.LEFT or ItemTouchHelper.RIGHT
        ) {
            override fun onMove(
                recyclerView: RecyclerView,
                viewHolder: RecyclerView.ViewHolder,
                target: RecyclerView.ViewHolder
            ): Boolean = false

            override fun onSwiped(viewHolder: RecyclerView.ViewHolder, direction: Int) {
                // Compat RecyclerView: "bindingAdapterPosition" n'existe pas sur certaines versions.
                // Ici on utilise adapterPosition (suffisant car on n'utilise pas ConcatAdapter sur cette liste).
                val position = viewHolder.adapterPosition
                if (position == RecyclerView.NO_POSITION) return

                val rule = ruleAdapter.currentList.getOrNull(position) ?: run {
                    ruleAdapter.notifyItemChanged(position)
                    return
                }

                // On restaure immédiatement la ligne (sinon elle reste "partie" à cause du swipe)
                ruleAdapter.notifyItemChanged(position)

                // Puis on propose Modifier / Supprimer
                showRuleSwipeMenu(rule)
            }
        }

        ItemTouchHelper(swipeHandler).attachToRecyclerView(binding.rvRules)
    }

    /**
     * Configuration des clics
     */
    private fun setupClickListeners() {
        // Bouton ajout de règle
        binding.btnAddRule.setOnClickListener {
            Log.d(TAG, "➕ Ajout d'une règle (BottomSheet)")
            val meta = viewModel.meta.value
            val cooldownDefault = meta?.ruleTemplates?.firstOrNull()?.cooldownMinSec ?: 60
            RuleCreateBottomSheet
                .newInstance(thresholdDefault = 50, cooldownDefault = cooldownDefault, enabledDefault = true, meta = meta)
                .show(supportFragmentManager, "RuleCreateBottomSheet")
        }

        // Bouton refresh
        binding.btnRefresh.setOnClickListener {
            Log.d(TAG, "🔄 Rafraîchissement")
            val authHeader = TokenManager(this).getAuthHeader()
            if (authHeader == null) {
                Toast.makeText(this, "Session expirée, merci de vous reconnecter", Toast.LENGTH_SHORT).show()
                finish()
                return@setOnClickListener
            }

            currentDevice?.let { device ->
                viewModel.setDevice(device, authHeader)
            }
        }
    }

    /**
     * Menu d'actions après un swipe : Modifier / Supprimer
     * (simple et robuste, sans custom drawing compliqué)
     */
    private fun showRuleSwipeMenu(rule: RuleDto) {
        MaterialAlertDialogBuilder(this, com.xamiot.soundsense.R.style.Theme_SoundSense_Dialog)
            .setTitle("Règle")
            .setItems(arrayOf("Modifier", "Supprimer")) { _, which ->
                when (which) {
                    0 -> showEditRuleSheet(rule)
                    1 -> showDeleteConfirmation(rule)
                }
            }
            .setOnCancelListener {
                // rien : la ligne a déjà été restaurée
            }
            .show()
    }

    /**
     * Ouvre la bottom sheet en mode édition : seuil + cooldown.
     */
    private fun showEditRuleSheet(rule: RuleDto) {
        val threshold = rule.thresholdNum?.toInt() ?: 50
        val cooldown = rule.cooldownSec ?: 60
        val cooldownMin = rule.cooldownMinSec ?: 60
        val meta = viewModel.meta.value

        RuleCreateBottomSheet
            .newEditInstance(
                ruleId = rule.id,
                thresholdDefault = threshold,
                cooldownDefault = cooldown,
                enabledDefault = rule.enabled,
                cooldownMinSec = cooldownMin,
                field = rule.field,
                op = rule.op,
                templateId = rule.templateId,
                meta = meta
            )
            .show(supportFragmentManager, "RuleEditBottomSheet")
    }

    /**
     * Affiche une confirmation avant de supprimer une règle
     */
    private fun showDeleteConfirmation(rule: RuleDto) {
        MaterialAlertDialogBuilder(this, com.xamiot.soundsense.R.style.Theme_SoundSense_Dialog)
            .setIcon(com.xamiot.soundsense.R.drawable.ic_delete)
            .setTitle("Supprimer la règle")
            .setMessage("Voulez-vous vraiment supprimer cette règle ?")
            .setPositiveButton("Supprimer") { _, _ ->
                viewModel.deleteRule(rule)
            }
            .setNegativeButton("Annuler") { dialog, _ ->
                dialog.dismiss()
            }
            .show()
    }

    /**
     * Observation du ViewModel
     */
    private fun observeViewModel() {
        // Règles
        viewModel.rules.observe(this) { rules ->
            Log.d(TAG, "📋 ${rules.size} règles reçues")
            ruleAdapter.submitList(rules)
            binding.tvNoRules.visibility = if (rules.isEmpty()) View.VISIBLE else View.GONE
        }

        // Historique des alertes
        viewModel.alertHistory.observe(this) { alerts ->
            Log.d(TAG, "📜 ${alerts.size} alertes reçues")
            alertHistoryAdapter.submitList(alerts)
            binding.tvNoAlerts.visibility = if (alerts.isEmpty()) View.VISIBLE else View.GONE
        }

        // Chargement
        viewModel.isLoading.observe(this) {
            // TODO (inchangé)
        }

        // Résultat bottom sheet (création OU édition)
        supportFragmentManager.setFragmentResultListener(
            RuleCreateBottomSheet.REQUEST_KEY,
            this
        ) { _, bundle ->
            val threshold = bundle.getInt(RuleCreateBottomSheet.RESULT_THRESHOLD, 50)
            val cooldown = bundle.getInt(RuleCreateBottomSheet.RESULT_COOLDOWN, 60)
            val enabled = bundle.getBoolean(RuleCreateBottomSheet.RESULT_ENABLED, true)
            val ruleId = bundle.getString(RuleCreateBottomSheet.RESULT_RULE_ID)
            val field = bundle.getString(RuleCreateBottomSheet.RESULT_FIELD) ?: "soundPct"
            val op = bundle.getString(RuleCreateBottomSheet.RESULT_OP) ?: ">"
            val userLabel = bundle.getString(RuleCreateBottomSheet.RESULT_USER_LABEL)
            val templateId = bundle.getString(RuleCreateBottomSheet.RESULT_TEMPLATE_ID)
            val cooldownMinSec = bundle.getInt(RuleCreateBottomSheet.RESULT_COOLDOWN_MIN_SEC, 60)

            Log.d(TAG, "✅ RuleBottomSheet result threshold=$threshold cooldown=$cooldown enabled=$enabled ruleId=$ruleId field=$field op=$op cooldownMin=$cooldownMinSec")

            // Token (sécurité)
            val authHeader = TokenManager(this).getAuthHeader()
            if (authHeader == null) {
                Toast.makeText(this, "Session expirée, merci de vous reconnecter", Toast.LENGTH_SHORT).show()
                finish()
                return@setFragmentResultListener
            }

            // Si ruleId est présent => édition, sinon création
            if (ruleId.isNullOrBlank()) {
                viewModel.createRule(
                    threshold = threshold,
                    cooldownSec = cooldown,
                    enabled = enabled,
                    field = field,
                    op = op,
                    userLabel = userLabel,
                    templateId = templateId,
                    cooldownMinSec = cooldownMinSec
                )
            } else {
                viewModel.updateRuleThresholdCooldown(
                    ruleId = ruleId,
                    threshold = threshold,
                    cooldownSec = cooldown,
                    cooldownMinSec = cooldownMinSec,
                    field = field,
                    op = op,
                    templateId = templateId
                )
            }
        }

        // Erreurs
        viewModel.error.observe(this) { errorMessage ->
            errorMessage?.let {
                Log.e(TAG, "❌ Erreur : $it")
                Toast.makeText(this, it, Toast.LENGTH_LONG).show()
            }
        }
    }

    /**
     * ✅ Met à jour le texte "Il y a Xs" du dernier heartbeat (basé sur currentDevice.lastSeen).
     * Appelé:
     * - au chargement UI
     * - puis toutes les 1s par le ticker
     */
    private fun updateLastSeenRelative() {
        val device = currentDevice
        if (device == null) {
            binding.tvLastSeen.text = "Jamais connecté"
            return
        }
        binding.tvLastSeen.text = device.getFormattedLastSeen()
    }


    /**
     * Configuration de l'interface utilisateur
     */
    private fun setupUI() {
        currentDevice?.let { device ->
            // Titre
            val name = device.name ?: "Capteur"
            val uid = device.espUid ?: device.id

            binding.tvToolbarTitle.text = name
            binding.tvDeviceName.text = name
            binding.tvEspUid.text = uid

            // ✅ Dernier heartbeat en temps relatif ("Il y a Xs")
            updateLastSeenRelative()

        }
    }

    /**
     * Formate la date "lastSeen"
     */
    private fun formatLastSeen(isoDate: String): String {
        return try {
            val format = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.getDefault())
            format.timeZone = java.util.TimeZone.getTimeZone("UTC")
            val date = format.parse(isoDate) ?: return "Date invalide"

            val displayFormat = java.text.SimpleDateFormat("dd/MM/yyyy HH:mm", java.util.Locale.FRENCH)
            displayFormat.format(date)
        } catch (e: Exception) {
            Log.e(TAG, "Erreur parsing date", e)
            "Date invalide"
        }
    }
}
