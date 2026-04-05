package com.xamiot.soundsense

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.util.Log
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import androidx.appcompat.widget.Toolbar
import androidx.core.widget.doAfterTextChanged
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.ItemTouchHelper
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.floatingactionbutton.FloatingActionButton
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import com.xamiot.soundsense.data.api.ApiClient
import com.xamiot.soundsense.data.local.TokenManager
import com.xamiot.soundsense.data.remote.dto.AlertDto
import com.xamiot.soundsense.data.remote.dto.DeviceDTO
import com.xamiot.soundsense.data.repository.AlertRepository
import com.xamiot.soundsense.data.repository.AuthRepository
import com.xamiot.soundsense.ui.adapter.DeviceAdapter
import com.xamiot.soundsense.ui.auth.LoginActivity
import com.xamiot.soundsense.ui.devicedetail.DeviceDetailActivity
import com.xamiot.soundsense.ui.enroll.EnrollDeviceActivity
import com.xamiot.soundsense.utils.ApiResult
import androidx.core.app.NotificationManagerCompat
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    companion object {
        private const val KEY_AUTO_REFRESH_ENABLED = "auto_refresh_enabled"
        private const val AUTO_REFRESH_INTERVAL_MS = 10_000L
    }

    private val tag = "MainActivity"

    private lateinit var tokenManager: TokenManager
    private lateinit var authRepository: AuthRepository
    private lateinit var alertRepository: AlertRepository
    private lateinit var deviceAdapter: DeviceAdapter

    private var autoRefreshEnabled = false
    private var isDeleteAccountInProgress = false
    private var isFetchInProgress = false

    // ✅ Ticker UI : met à jour en continu les textes "Il y a Xs" et "Alerte Il y a Xs"
    private val timeTickerHandler = Handler(Looper.getMainLooper())
    private val timeTickerRunnable = object : Runnable {
        override fun run() {
            if (::deviceAdapter.isInitialized && deviceAdapter.itemCount > 0) {
                deviceAdapter.notifyItemRangeChanged(
                    0,
                    deviceAdapter.itemCount,
                    DeviceAdapter.PAYLOAD_TIME_TICK
                )
            }
            timeTickerHandler.postDelayed(this, 1000L)
        }
    }

    // ✅ Auto-refresh réseau : récupère périodiquement heartbeat / alertes quand l'écran est visible
    private val autoRefreshHandler = Handler(Looper.getMainLooper())
    private val autoRefreshRunnable = object : Runnable {
        override fun run() {
            if (!autoRefreshEnabled) return
            refreshDevices(showToast = false)
            autoRefreshHandler.postDelayed(this, AUTO_REFRESH_INTERVAL_MS)
        }
    }

    // Views
    private lateinit var rvDevices: RecyclerView
    private lateinit var llEmptyState: LinearLayout
    private lateinit var llLoadingState: LinearLayout
    private lateinit var llErrorState: LinearLayout
    private lateinit var btnAddDevice: Button
    private lateinit var btnRetry: Button
    private lateinit var fabAddDevice: FloatingActionButton
    private lateinit var toolbar: Toolbar
    private lateinit var flDeleteOverlay: View

    /**
     * ✅ Lance l'enrôlement et rafraîchit la liste au retour si RESULT_OK
     */
    private val enrollLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == RESULT_OK) {
                refreshDevices(showToast = false)
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        tokenManager = TokenManager(this)
        authRepository = AuthRepository(this)
        alertRepository = AlertRepository(ApiClient.apiService)
        autoRefreshEnabled = savedInstanceState?.getBoolean(KEY_AUTO_REFRESH_ENABLED, false) ?: false

        if (tokenManager.getToken() == null) {
            redirectToLogin()
            return
        }

        initViews()
        setupToolbar()
        setupRecyclerView()
        loadDevices()
    }

    override fun onStart() {
        super.onStart()

        timeTickerHandler.removeCallbacks(timeTickerRunnable)
        timeTickerHandler.post(timeTickerRunnable)

        restartAutoRefreshIfNeeded(refreshImmediately = true)

        // Vider les notifications + badge au retour en foreground
        val token = tokenManager.getToken()
        if (!token.isNullOrEmpty()) {
            lifecycleScope.launch {
                try {
                    ApiClient.apiService.resetBadge("Bearer $token")
                } catch (_: Exception) {}
                NotificationManagerCompat.from(this@MainActivity).cancelAll()
            }
        }
    }

    override fun onStop() {
        super.onStop()
        timeTickerHandler.removeCallbacks(timeTickerRunnable)
        stopAutoRefresh()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putBoolean(KEY_AUTO_REFRESH_ENABLED, autoRefreshEnabled)
    }

    private fun initViews() {
        toolbar = findViewById(R.id.toolbar)
        rvDevices = findViewById(R.id.rvDevices)
        llEmptyState = findViewById(R.id.llEmptyState)
        llLoadingState = findViewById(R.id.llLoadingState)
        llErrorState = findViewById(R.id.llErrorState)
        btnAddDevice = findViewById(R.id.btnAddDevice)
        btnRetry = findViewById(R.id.btnRetry)
        fabAddDevice = findViewById(R.id.fabAddDevice)
        flDeleteOverlay = findViewById(R.id.flDeleteOverlay)

        // ✅ Bouton "Ajouter un capteur" (état vide) => ouvre l’enrôlement
        btnAddDevice.setOnClickListener {
            enrollLauncher.launch(Intent(this, EnrollDeviceActivity::class.java))
        }

        btnRetry.setOnClickListener {
            loadDevices()
        }

        // ✅ FAB => ouvre l’enrôlement
        fabAddDevice.setOnClickListener {
            enrollLauncher.launch(Intent(this, EnrollDeviceActivity::class.java))
        }
    }

    private fun setupToolbar() {
        setSupportActionBar(toolbar)

        supportActionBar?.apply {
            title = getString(R.string.app_name)
            subtitle = tokenManager.getEmail()
            setDisplayShowTitleEnabled(true)
        }

        toolbar.navigationIcon = getDrawable(R.drawable.ic_account)
        toolbar.navigationContentDescription = getString(R.string.account_actions)
        toolbar.setNavigationOnClickListener {
            showDeleteAccountDialog()
        }
    }

    private fun setupRecyclerView() {
        deviceAdapter = DeviceAdapter { device ->
            onDeviceClick(device)
        }

        rvDevices.apply {
            layoutManager = LinearLayoutManager(this@MainActivity)
            adapter = deviceAdapter
        }

        // ✅ Swipe gauche => suppression (confirmation)
        setupSwipeToDelete()
    }

    /**
     * Active le swipe-to-delete (gauche) sur la liste.
     * Sécurisé : demande confirmation et restaure l'item si annulation/erreur.
     */
    private fun setupSwipeToDelete() {
        val callback = object : ItemTouchHelper.SimpleCallback(
            0,
            ItemTouchHelper.LEFT
        ) {
            override fun onMove(
                recyclerView: RecyclerView,
                viewHolder: RecyclerView.ViewHolder,
                target: RecyclerView.ViewHolder
            ): Boolean = false

            override fun onSwiped(viewHolder: RecyclerView.ViewHolder, direction: Int) {
                val position = viewHolder.adapterPosition
                val originalList = deviceAdapter.currentList

                if (position == RecyclerView.NO_POSITION || position >= originalList.size) {
                    return
                }

                val device = originalList[position]
                showDeleteConfirmation(device, position, originalList)
            }
        }

        ItemTouchHelper(callback).attachToRecyclerView(rvDevices)
    }

    private fun showDeleteConfirmation(
        device: DeviceDTO,
        position: Int,
        originalList: List<DeviceDTO>
    ) {
        MaterialAlertDialogBuilder(this, R.style.Theme_SoundSense_Dialog)
            .setIcon(R.drawable.ic_delete)
            .setTitle(R.string.delete_device_title)
            .setMessage(
                getString(
                    R.string.delete_device_message,
                    device.name ?: getString(R.string.unnamed_device)
                )
            )
            .setNegativeButton(R.string.btn_cancel) { _, _ ->
                restoreSwipedItem(position)
            }
            .setPositiveButton(R.string.delete_label) { _, _ ->
                restoreSwipedItem(position)
                deleteDeviceOnServer(device)
            }
            .setOnCancelListener {
                restoreSwipedItem(position)
            }
            .show()
    }

    private fun restoreSwipedItem(position: Int) {
        if (position != RecyclerView.NO_POSITION) {
            deviceAdapter.notifyItemChanged(position)
        }
    }

    private fun deleteDeviceOnServer(device: DeviceDTO) {
        val token = tokenManager.getToken()
        if (token.isNullOrBlank()) {
            Toast.makeText(this, R.string.missing_token, Toast.LENGTH_LONG).show()
            return
        }

        flDeleteOverlay.visibility = View.VISIBLE

        lifecycleScope.launch {
            try {
                val res = ApiClient.apiService.deleteEspDevice(
                    authorization = "Bearer $token",
                    deviceId = device.id
                )

                if (res.isSuccessful) {
                    Toast.makeText(
                        this@MainActivity,
                        R.string.device_deleted,
                        Toast.LENGTH_SHORT
                    ).show()
                    refreshDevices(showToast = false)
                } else {
                    Log.e(tag, "Suppression device HTTP ${res.code()}")
                    Toast.makeText(
                        this@MainActivity,
                        getString(R.string.delete_error_with_code, res.code()),
                        Toast.LENGTH_LONG
                    ).show()
                }
            } catch (e: Exception) {
                Log.e(tag, "Exception suppression: ${e.message}", e)
                Toast.makeText(
                    this@MainActivity,
                    getString(R.string.delete_error_message, e.message ?: getString(R.string.unknown_error_label)),
                    Toast.LENGTH_LONG
                ).show()
            } finally {
                flDeleteOverlay.visibility = View.GONE
            }
        }
    }

    private fun loadDevices() {
        fetchDevices(showLoading = true, showToast = false)
    }

    private fun refreshDevices(showToast: Boolean = true) {
        fetchDevices(showLoading = false, showToast = showToast)
    }

    private fun fetchDevices(showLoading: Boolean, showToast: Boolean) {
        val token = tokenManager.getToken() ?: return
        if (isFetchInProgress) return

        isFetchInProgress = true

        if (showLoading && deviceAdapter.currentList.isEmpty()) {
            showLoadingState()
        }

        lifecycleScope.launch {
            try {
                val response = ApiClient.apiService.getDevices("Bearer $token")

                if (response.isSuccessful) {
                    val devices = response.body() ?: emptyList()
                    Log.d(tag, "✅ ${devices.size} device(s) récupéré(s)")

                    val devicesWithAlerts = devices.map { device ->
                        async {
                            when (val alertResult = alertRepository.fetchLastAlert("Bearer $token", device.id)) {
                                is ApiResult.Success<*> -> {
                                    device.lastAlert = alertResult.data as? AlertDto
                                }
                                else -> Unit
                            }
                            device
                        }
                    }.awaitAll()

                    if (devicesWithAlerts.isEmpty()) {
                        showEmptyState()
                        if (showToast) {
                            Toast.makeText(
                                this@MainActivity,
                                R.string.no_device_found,
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    } else {
                        showDevicesList(devicesWithAlerts)
                        if (showToast) {
                            Toast.makeText(
                                this@MainActivity,
                                R.string.list_refreshed,
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    }
                } else {
                    Log.e(tag, "❌ Erreur API devices: ${response.code()}")
                    handleFetchError(showToast)
                }
            } catch (e: Exception) {
                Log.e(tag, "❌ Exception devices: ${e.message}", e)
                handleFetchError(showToast, e)
            } finally {
                isFetchInProgress = false
            }
        }
    }

    private fun handleFetchError(showToast: Boolean, exception: Exception? = null) {
        if (deviceAdapter.currentList.isEmpty()) {
            showErrorState()
        }

        if (showToast) {
            val message = exception?.message?.takeIf { it.isNotBlank() }
                ?: getString(R.string.refresh_error)
            Toast.makeText(this, message, Toast.LENGTH_LONG).show()
        }
    }

    private fun showLoadingState() {
        rvDevices.visibility = View.GONE
        llEmptyState.visibility = View.GONE
        llLoadingState.visibility = View.VISIBLE
        llErrorState.visibility = View.GONE
        fabAddDevice.visibility = View.GONE
    }

    private fun showEmptyState() {
        rvDevices.visibility = View.GONE
        llEmptyState.visibility = View.VISIBLE
        llLoadingState.visibility = View.GONE
        llErrorState.visibility = View.GONE
        fabAddDevice.visibility = View.VISIBLE
    }

    private fun showDevicesList(devices: List<DeviceDTO>) {
        Log.d(tag, "📱 showDevicesList appelé avec ${devices.size} device(s)")
        deviceAdapter.submitList(devices)

        rvDevices.visibility = View.VISIBLE
        llEmptyState.visibility = View.GONE
        llLoadingState.visibility = View.GONE
        llErrorState.visibility = View.GONE
        fabAddDevice.visibility = View.VISIBLE
    }

    private fun showErrorState() {
        rvDevices.visibility = View.GONE
        llEmptyState.visibility = View.GONE
        llLoadingState.visibility = View.GONE
        llErrorState.visibility = View.VISIBLE
        fabAddDevice.visibility = View.GONE
    }

    private fun onDeviceClick(device: DeviceDTO) {
        val intent = Intent(this, DeviceDetailActivity::class.java).apply {
            putExtra(DeviceDetailActivity.EXTRA_DEVICE, device)
        }
        startActivity(intent)
    }

    override fun onCreateOptionsMenu(menu: Menu?): Boolean {
        menuInflater.inflate(R.menu.main_menu, menu)
        return true
    }

    override fun onPrepareOptionsMenu(menu: Menu): Boolean {
        menu.findItem(R.id.action_auto_refresh)?.apply {
            setIcon(if (autoRefreshEnabled) R.drawable.ic_refresh_auto_on else R.drawable.ic_refresh_auto_off)
            title = getString(
                if (autoRefreshEnabled) R.string.disable_auto_refresh else R.string.enable_auto_refresh
            )
        }
        return super.onPrepareOptionsMenu(menu)
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.action_auto_refresh -> {
                toggleAutoRefresh()
                true
            }
            R.id.action_refresh -> {
                refreshDevices(showToast = true)
                true
            }
            R.id.action_logout -> {
                showLogoutConfirmation()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }

    private fun toggleAutoRefresh() {
        autoRefreshEnabled = !autoRefreshEnabled
        invalidateOptionsMenu()

        if (autoRefreshEnabled) {
            Toast.makeText(this, R.string.auto_refresh_enabled_message, Toast.LENGTH_SHORT).show()
            restartAutoRefreshIfNeeded(refreshImmediately = true)
        } else {
            stopAutoRefresh()
            Toast.makeText(this, R.string.auto_refresh_disabled_message, Toast.LENGTH_SHORT).show()
        }
    }

    private fun restartAutoRefreshIfNeeded(refreshImmediately: Boolean) {
        stopAutoRefresh()
        if (!autoRefreshEnabled) return

        if (refreshImmediately) {
            refreshDevices(showToast = false)
        }
        autoRefreshHandler.postDelayed(autoRefreshRunnable, AUTO_REFRESH_INTERVAL_MS)
    }

    private fun stopAutoRefresh() {
        autoRefreshHandler.removeCallbacks(autoRefreshRunnable)
    }

    private fun showDeleteAccountDialog() {
        val sessionEmail = tokenManager.getEmail()?.trim().orEmpty()
        if (sessionEmail.isBlank()) {
            Toast.makeText(this, R.string.session_email_missing, Toast.LENGTH_LONG).show()
            return
        }

        val density = resources.displayMetrics.density
        val padding = (20 * density).toInt()
        val spacing = (12 * density).toInt()

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, padding, padding, padding / 2)
        }

        val warningText = TextView(this).apply {
            text = getString(R.string.delete_account_warning)
            setTextColor(getColor(android.R.color.holo_red_light))
            textSize = 15f
        }

        val infoText = TextView(this).apply {
            text = getString(R.string.delete_account_info, sessionEmail)
            setTextColor(getColor(android.R.color.white))
            textSize = 14f
        }

        val inputLayout = TextInputLayout(this).apply {
            hint = getString(R.string.email_hint)
        }

        val emailInput = TextInputEditText(inputLayout.context).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
            setSingleLine(true)
        }
        inputLayout.addView(emailInput)

        container.addView(warningText)
        addVerticalSpace(container, spacing)
        container.addView(infoText)
        addVerticalSpace(container, spacing)
        container.addView(inputLayout)

        val dialog = MaterialAlertDialogBuilder(this, R.style.Theme_SoundSense_Dialog)
            .setIcon(R.drawable.ic_delete)
            .setTitle(R.string.delete_my_account)
            .setView(container)
            .setNegativeButton(R.string.btn_cancel, null)
            .setPositiveButton(R.string.delete_account_confirm_button, null)
            .create()

        dialog.setOnShowListener {
            val positiveButton = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
            val negativeButton = dialog.getButton(AlertDialog.BUTTON_NEGATIVE)

            fun updateValidation() {
                val enteredEmail = emailInput.text?.toString()?.trim().orEmpty()
                val matches = enteredEmail.equals(sessionEmail, ignoreCase = true)

                inputLayout.error = when {
                    enteredEmail.isBlank() -> null
                    !matches -> getString(R.string.delete_account_email_mismatch)
                    else -> null
                }

                positiveButton.isEnabled = matches && !isDeleteAccountInProgress
            }

            emailInput.doAfterTextChanged { updateValidation() }
            updateValidation()

            positiveButton.setOnClickListener {
                val enteredEmail = emailInput.text?.toString()?.trim().orEmpty()
                val matches = enteredEmail.equals(sessionEmail, ignoreCase = true)

                if (!matches) {
                    inputLayout.error = getString(R.string.delete_account_email_mismatch)
                    return@setOnClickListener
                }

                performDeleteAccount(
                    dialog = dialog,
                    inputLayout = inputLayout,
                    positiveButton = positiveButton,
                    negativeButton = negativeButton
                )
            }
        }

        dialog.show()
    }

    private fun performDeleteAccount(
        dialog: AlertDialog,
        inputLayout: TextInputLayout,
        positiveButton: Button,
        negativeButton: Button
    ) {
        if (isDeleteAccountInProgress) return

        isDeleteAccountInProgress = true
        dialog.setCancelable(false)
        dialog.setCanceledOnTouchOutside(false)
        inputLayout.error = null
        positiveButton.isEnabled = false
        negativeButton.isEnabled = false
        positiveButton.text = getString(R.string.deleting_account)

        lifecycleScope.launch {
            when (val result = authRepository.deleteMyAccount()) {
                is ApiResult.Success<*> -> {
                    tokenManager.logout()
                    if (dialog.isShowing) dialog.dismiss()
                    Toast.makeText(
                        this@MainActivity,
                        R.string.account_deleted,
                        Toast.LENGTH_LONG
                    ).show()
                    redirectToLogin()
                }
                is ApiResult.Error -> {
                    isDeleteAccountInProgress = false
                    positiveButton.text = getString(R.string.delete_account_confirm_button)
                    negativeButton.isEnabled = true
                    positiveButton.isEnabled = true
                    dialog.setCancelable(true)
                    dialog.setCanceledOnTouchOutside(true)
                    Toast.makeText(
                        this@MainActivity,
                        result.error.toUserMessage(),
                        Toast.LENGTH_LONG
                    ).show()
                }
                ApiResult.Loading -> Unit
            }
        }
    }

    private fun addVerticalSpace(parent: LinearLayout, heightPx: Int) {
        parent.addView(
            View(this).apply {
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    heightPx
                )
            }
        )
    }

    private fun showLogoutConfirmation() {
        MaterialAlertDialogBuilder(this, R.style.Theme_SoundSense_Dialog)
            .setTitle(R.string.logout)
            .setMessage(R.string.logout_confirm)
            .setPositiveButton(R.string.btn_yes) { _, _ -> logout() }
            .setNegativeButton(R.string.btn_no, null)
            .show()
    }

    private fun logout() {
        tokenManager.logout()
        redirectToLogin()
    }

    private fun redirectToLogin() {
        stopAutoRefresh()

        val intent = Intent(this, LoginActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        MaterialAlertDialogBuilder(this, R.style.Theme_SoundSense_Dialog)
            .setTitle(R.string.quit_app)
            .setMessage(R.string.quit_app_confirmation)
            .setPositiveButton(R.string.btn_yes) { _, _ -> finishAffinity() }
            .setNegativeButton(R.string.btn_no, null)
            .show()
    }
}
