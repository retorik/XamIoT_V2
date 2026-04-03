package com.xamiot.soundsense.ui.enroll

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Spinner
import android.widget.TextView
import android.widget.ProgressBar
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import com.xamiot.soundsense.R
import com.xamiot.soundsense.ble.BleProvisioningManager
import com.xamiot.soundsense.data.api.ApiClient
import com.xamiot.soundsense.data.local.TokenManager
import com.xamiot.soundsense.data.local.WifiCredentialsStore
import com.xamiot.soundsense.data.remote.dto.CreateEspDeviceRequest
import com.xamiot.soundsense.utils.ServerConfig
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class EnrollDeviceActivity : AppCompatActivity() {

    private lateinit var ble: BleProvisioningManager
    private lateinit var tokenManager: TokenManager

    // UI
    private lateinit var spinner: Spinner
    private lateinit var tvDetected: TextView
    private lateinit var tvEspUid: TextView
    private lateinit var tvTopicPrefix: TextView
    private lateinit var tvBleError: TextView

    // Progression (nouveau)
    private lateinit var pbStep: ProgressBar
    private lateinit var tvStep: TextView
    private lateinit var btnRetry: MaterialButton
    private lateinit var btnRescan: MaterialButton

    private lateinit var etSsid: TextInputEditText
    private lateinit var etWifiPass: TextInputEditText
    private lateinit var btnPushWifi: MaterialButton
    private lateinit var viewDot: View
    private lateinit var tvWifiState: TextView

    private lateinit var etDeviceName: TextInputEditText
    private lateinit var btnCreate: MaterialButton

    // Adapter / liste
    private lateinit var adapter: ArrayAdapter<String>
    private var deviceList: List<BleProvisioningManager.BleDevice> = emptyList()
    private var lastNames: List<String> = emptyList()

    // Fix sélection 1er device
    private var hasAutoConnectedFirstDevice = false
    private var userTouchedSpinner = false
    private var spinnerProgrammaticUpdate = false

    // Etat création / MQTT
    private var isCreating = false
    private var mqttPassword: String? = null

    private val enableBt = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        ble.refreshBluetoothState()
        startFlowIfReady()
    }

    private val requestPerms = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        startFlowIfReady()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_enroll_device)

        ble = BleProvisioningManager(applicationContext)
        tokenManager = TokenManager(this)

        // views
        spinner = findViewById(R.id.spinnerDevices)
        tvDetected = findViewById(R.id.tvDetected)
        tvEspUid = findViewById(R.id.tvEspUid)
        tvTopicPrefix = findViewById(R.id.tvTopicPrefix)
        tvBleError = findViewById(R.id.tvBleError)

        etSsid = findViewById(R.id.etSsid)
        etWifiPass = findViewById(R.id.etWifiPass)
        btnPushWifi = findViewById(R.id.btnPushWifi)
        viewDot = findViewById(R.id.viewDot)
        tvWifiState = findViewById(R.id.tvWifiState)

        etDeviceName = findViewById(R.id.etDeviceName)
        btnCreate = findViewById(R.id.btnCreate)

        pbStep = findViewById(R.id.pbStep)
        tvStep = findViewById(R.id.tvStep)
        btnRetry = findViewById(R.id.btnRetry)

        btnRescan = findViewById(R.id.btnRescan)

        // Toolbar close
        findViewById<MaterialToolbar>(R.id.toolbar).apply {
            setNavigationOnClickListener { finish() }
        }

        // Restore Wi-Fi
        WifiCredentialsStore.load(this)?.let { (ssid, pass) ->
            etSsid.setText(ssid)
            etWifiPass.setText(pass)
        }

        // Adapter spinner
        adapter = ArrayAdapter(this, R.layout.item_spinner_device, mutableListOf("—"))
        adapter.setDropDownViewResource(R.layout.item_spinner_device_dropdown)
        spinner.adapter = adapter

        // Marquer quand l’utilisateur touche le spinner (pour éviter auto-select agressif)
        spinner.setOnTouchListener { _, _ ->
            userTouchedSpinner = true
            false
        }

        // Listener sélection (connect)
        spinner.setOnItemSelectedListener(object : android.widget.AdapterView.OnItemSelectedListener {
            override fun onItemSelected(
                parent: android.widget.AdapterView<*>?,
                view: View?,
                position: Int,
                id: Long
            ) {
                if (spinnerProgrammaticUpdate) return
                if (deviceList.isEmpty()) return
                if (position < 0 || position >= deviceList.size) return

                val chosen = deviceList[position]
                val currentAddr = ble.state.value.selected?.device?.address
                val chosenAddr = chosen.device.address

                // évite de reconnecter en boucle
                if (currentAddr != null && currentAddr == chosenAddr) return

                ble.connect(chosen)
            }

            override fun onNothingSelected(parent: android.widget.AdapterView<*>?) {}
        })

        btnRescan.setOnClickListener {
            // Scan (re)lancé manuellement
            ble.startScan()
        }

        btnRetry.setOnClickListener {
            // Réessayer sans quitter l'écran (reconnect si déjà sélectionné, sinon re-scan)
            ble.retry()
        }

        // Bouton créer : enchaîne WiFi → attente → API → MQTT
        btnCreate.setOnClickListener {
            createDevice()
        }

        // ✅ Mise à jour des boutons quand on tape SSID / Nom (sinon obligé de repush Wi-Fi)
        etSsid.addTextChangedListener(simpleWatcher { updateButtons() })
        etDeviceName.addTextChangedListener(simpleWatcher { updateButtons() })

        // Observe BLE state
        lifecycleScope.launch {
            ble.state.collect { s ->
                tvDetected.text = "${s.devices.size} " + getString(R.string.detected)
                btnRescan.text = if (s.isScanning) getString(R.string.stop) else getString(R.string.Scan)
                tvEspUid.text = if (s.espUid.isBlank()) "—" else s.espUid

                if (s.lastError.isNullOrBlank()) {
                    tvBleError.visibility = View.GONE
                } else {
                    tvBleError.text = s.lastError
                    tvBleError.visibility = View.VISIBLE
                }

                // Wi-Fi status
                when {
                    s.wifiConnecting -> {
                        viewDot.backgroundTintList =
                            android.content.res.ColorStateList.valueOf(0xFFBDBDBD.toInt())
                        tvWifiState.text = "Connexion…"
                    }
                    s.wifiConnected -> {
                        viewDot.backgroundTintList =
                            android.content.res.ColorStateList.valueOf(0xFF34C759.toInt())
                        tvWifiState.text = getString(R.string.connected)
                    }
                    else -> {
                        viewDot.backgroundTintList =
                            android.content.res.ColorStateList.valueOf(0xFFFF4444.toInt())
                        tvWifiState.text = getString(R.string.offline)
                    }
                }

                // Progress / étape
                val stepText = when {
                    s.stepText.isNotBlank() -> s.stepText
                    s.isScanning -> "Scan BLE…"
                    s.selected == null -> getString(R.string.select_ble_device)
                    else -> ""
                }
                tvStep.text = stepText
                pbStep.visibility = if (s.busy || s.isScanning) View.VISIBLE else View.GONE
                btnRetry.visibility = if (s.canRetry) View.VISIBLE else View.GONE

                // ✅ Update spinner (sans reset inutile)
                updateSpinnerDevices(s.devices)

                // ✅ Recalcule les boutons à chaque changement BLE
                updateButtons()
            }
        }

        ensurePermissionsAndBluetooth()
    }

    override fun onDestroy() {
        super.onDestroy()
        ble.stopScan()
        ble.disconnect()
    }

    private fun simpleWatcher(after: () -> Unit): TextWatcher {
        return object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                after()
            }
        }
    }

    private fun updateSpinnerDevices(devices: List<BleProvisioningManager.BleDevice>) {
        // reset auto-connect si liste vide (ex: scan relancé)
        if (devices.isEmpty()) {
            deviceList = emptyList()
            lastNames = emptyList()
            hasAutoConnectedFirstDevice = false

            if (adapter.count != 1 || adapter.getItem(0) != "—") {
                spinnerProgrammaticUpdate = true
                adapter.clear()
                adapter.add("—")
                adapter.notifyDataSetChanged()
                spinnerProgrammaticUpdate = false
            }
            return
        }

        // Tri stable (optionnel, mais agréable)
        val sorted = devices.sortedBy { it.name }
        val names = sorted.map { it.name }

        // Si rien n'a changé, ne touche pas au spinner (évite reset de sélection)
        if (names == lastNames) {
            deviceList = sorted
            return
        }

        val currentSelectedAddr = ble.state.value.selected?.device?.address
        val currentIdx = if (currentSelectedAddr != null) {
            sorted.indexOfFirst { it.device.address == currentSelectedAddr }
        } else {
            -1
        }

        spinnerProgrammaticUpdate = true
        adapter.clear()
        adapter.addAll(names)
        adapter.notifyDataSetChanged()

        // Restore sélection si possible
        if (currentIdx >= 0) {
            spinner.setSelection(currentIdx, false)
        } else {
            spinner.setSelection(0, false)
        }
        spinnerProgrammaticUpdate = false

        deviceList = sorted
        lastNames = names

        // ✅ Auto-connect du 1er device (1 seule fois) si rien n'est sélectionné
        if (!hasAutoConnectedFirstDevice
            && !userTouchedSpinner
            && ble.state.value.selected == null
            && deviceList.isNotEmpty()
        ) {
            hasAutoConnectedFirstDevice = true
            ble.connect(deviceList[0])
        }
    }

    private fun updateButtons() {
        val s = ble.state.value

        // Quand une opération BLE est en cours ou création en cours, on bloque tout
        val busy = s.busy || isCreating

        btnRescan.isEnabled = !busy
        spinner.isEnabled = !busy && deviceList.isNotEmpty()
        etSsid.isEnabled = !busy
        etWifiPass.isEnabled = !busy
        etDeviceName.isEnabled = !busy

        // Create : nécessite device connecté + SSID + nom
        btnCreate.isEnabled = !busy && canCreate(s)
    }

    private fun canCreate(s: BleProvisioningManager.BleState): Boolean {
        val nameOk = etDeviceName.text?.toString().orEmpty().trim().isNotBlank()
        val ssidOk = etSsid.text?.toString().orEmpty().trim().isNotBlank()
        return nameOk && ssidOk && s.espUid.isNotBlank() && s.topicPrefix.isNotBlank() && s.selected != null
    }

    private fun ensurePermissionsAndBluetooth() {
        val perms = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= 31) {
            perms += Manifest.permission.BLUETOOTH_SCAN
            perms += Manifest.permission.BLUETOOTH_CONNECT
        } else {
            perms += Manifest.permission.ACCESS_FINE_LOCATION
        }

        val missing = perms.filter {
            ActivityCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missing.isNotEmpty()) {
            requestPerms.launch(missing.toTypedArray())
            return
        }

        val btAdapter =
            (getSystemService(BLUETOOTH_SERVICE) as android.bluetooth.BluetoothManager).adapter

        if (btAdapter?.isEnabled != true) {
            enableBt.launch(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE))
            return
        }

        startFlowIfReady()
    }

    private fun startFlowIfReady() {
        ble.refreshBluetoothState()
        if (!ble.state.value.isPoweredOn) return
        ble.startScan()
    }

    private fun createDevice() {
        val authHeader = tokenManager.getAuthHeader()
        if (authHeader.isNullOrBlank()) {
            showError("Session expirée (token manquant)")
            return
        }

        val s = ble.state.value
        val name = etDeviceName.text?.toString().orEmpty().trim()
        val ssid = etSsid.text?.toString().orEmpty().trim()
        val wifiPass = etWifiPass.text?.toString().orEmpty()

        if (name.isBlank()) {
            showError("Nom du périphérique vide")
            return
        }
        if (ssid.isBlank()) {
            showError("SSID Wi-Fi vide")
            return
        }

        // Générer le mot de passe MQTT si pas déjà fait
        if (mqttPassword.isNullOrBlank()) mqttPassword = ble.generateMqttPassword()
        val mqttPass = mqttPassword!!

        // Sauvegarder les credentials WiFi
        WifiCredentialsStore.save(this, ssid, wifiPass)

        isCreating = true
        updateButtons()

        lifecycleScope.launch {
            try {
                // ── Étape 1 : Push WiFi via BLE ──
                setCreateStep(getString(R.string.enroll_step_wifi))
                ble.pushWifi(ssid, wifiPass)

                // ── Étape 2 : Attendre la connexion WiFi (max 20s) ──
                setCreateStep(getString(R.string.enroll_step_wifi_wait))
                val wifiOk = waitForWifiConnected(timeoutMs = 20_000)
                if (!wifiOk) {
                    showError(getString(R.string.enroll_wifi_timeout))
                    return@launch
                }

                // ── Étape 3 : Création du device via API ──
                setCreateStep(getString(R.string.enroll_step_api))
                val resp = ApiClient.apiService.createEspDevice(
                    authorization = authHeader,
                    request = CreateEspDeviceRequest(
                        espUid = s.espUid,
                        name = name,
                        topicPrefix = s.topicPrefix,
                        mqttPassword = mqttPass
                    )
                )

                if (!resp.isSuccessful) {
                    val err = resp.errorBody()?.string()?.take(300).orEmpty()
                    showError("Échec création API (${resp.code()}): ${if (err.isBlank()) "Erreur serveur" else err}")
                    return@launch
                }

                // ── Étape 4 : Push MQTT via BLE ──
                setCreateStep(getString(R.string.enroll_step_mqtt))
                val espUid = s.espUid
                if (mqttPass.isNotBlank() && espUid.isNotBlank()) {
                    val mqttHost = if (ServerConfig.isLocal(applicationContext)) "mqtt.holiceo.com" else "mqtt.xamiot.com"
                    ble.pushMqttCredentials(espUid, mqttPass, mqttHost, "8883")
                    delay(1500)
                }

                setCreateStep(getString(R.string.enroll_step_done))
                delay(500)
                setResult(RESULT_OK)
                finish()

            } catch (e: Throwable) {
                showError("Erreur : ${e.message}")
            } finally {
                isCreating = false
                updateButtons()
                tvStep.text = ""
                pbStep.visibility = View.GONE
            }
        }
    }

    private fun setCreateStep(text: String) {
        tvStep.text = text
        pbStep.visibility = View.VISIBLE
    }

    private suspend fun waitForWifiConnected(timeoutMs: Long): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (ble.state.value.wifiConnected) return true
            delay(500)
        }
        return ble.state.value.wifiConnected
    }

    private fun showError(msg: String) {
        tvBleError.text = msg
        tvBleError.visibility = View.VISIBLE
    }
}
