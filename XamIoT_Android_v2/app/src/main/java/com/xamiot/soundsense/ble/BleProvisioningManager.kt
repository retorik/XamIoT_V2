package com.xamiot.soundsense.ble

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.ActivityCompat
import com.xamiot.soundsense.R
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.security.SecureRandom
import java.util.UUID
import kotlin.math.min

class BleProvisioningManager(private val context: Context) {

    /**
     * Étapes d'enrôlement pour afficher une progression UI (équivalent "wizard" iOS).
     *
     * ⚠️ Ajout non cassant : l'app peut ignorer ces champs, tout le reste continue
     * de fonctionner comme avant.
     */
    enum class ProvisionStep {
        IDLE,
        SCANNING,
        CONNECTING,
        DISCOVERING,
        READING_INFO,
        SENDING_WIFI,
        WAITING_WIFI,
        SENDING_MQTT,
        READY,
        READY_TO_CREATE,
        ERROR
    }

    data class BleDevice(
        val device: BluetoothDevice,
        val name: String,
        val rssi: Int
    ) {
        val address: String get() = device.address
        override fun toString(): String = "$name  ($address)"
    }

    data class BleState(
        val isPoweredOn: Boolean = false,
        val isScanning: Boolean = false,
        val devices: List<BleDevice> = emptyList(),
        val selected: BleDevice? = null,
        val espUid: String = "",
        val topicPrefix: String = "",
        val wifiConnecting: Boolean = false,
        val wifiConnected: Boolean = false,
        val lastError: String? = null,

        // --- UI progression (non cassant) ---
        val step: ProvisionStep = ProvisionStep.IDLE,
        val stepText: String = "",
        val busy: Boolean = false,
        val canRetry: Boolean = false
    )

    private val _state = MutableStateFlow(BleState())
    val state: StateFlow<BleState> = _state.asStateFlow()

    // iOS: filtre "SOUND-SENSOR"
    private val targetNamePrefix = "SOUND-SENSOR"

    // UUIDs (copiés de ton iOS)
    private val ESP_UID_UUID = UUID.fromString("7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb1006")
    private val TOPIC_PREFIX_UUID = UUID.fromString("7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb1005")

    private val WIFI_SSID_UUID = UUID.fromString("beb5483e-36e1-4688-b7f5-ea07361b26a8")
    private val WIFI_PASS_UUID = UUID.fromString("cba1d466-3d7c-4382-8098-edbded2ef9e0")
    private val WIFI_STATUS_UUID = UUID.fromString("5e3b1f9e-2d8a-4a1f-8c3d-9e7f1a3b5c7d")

    private val MQTT_HOST_UUID = UUID.fromString("7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb0001")
    private val MQTT_PORT_UUID = UUID.fromString("7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb0002")
    private val MQTT_USER_UUID = UUID.fromString("7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb0003")
    private val MQTT_PASS_UUID = UUID.fromString("7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb0004")

    private val CCCD_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

    private val mainHandler = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val bluetoothManager =
        context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val adapter: BluetoothAdapter? = bluetoothManager.adapter
    private val scanner: BluetoothLeScanner? get() = adapter?.bluetoothLeScanner

    private val known = LinkedHashMap<String, BleDevice>()

    private var scanJob: Job? = null

    private var gatt: BluetoothGatt? = null
    private var mtu: Int = 23

    // chars mémorisées
    private var espUidChar: BluetoothGattCharacteristic? = null
    private var topicPrefixChar: BluetoothGattCharacteristic? = null
    private var wifiSsidChar: BluetoothGattCharacteristic? = null
    private var wifiPassChar: BluetoothGattCharacteristic? = null
    private var wifiStatusChar: BluetoothGattCharacteristic? = null
    private var mqttHostChar: BluetoothGattCharacteristic? = null
    private var mqttPortChar: BluetoothGattCharacteristic? = null
    private var mqttUserChar: BluetoothGattCharacteristic? = null
    private var mqttPassChar: BluetoothGattCharacteristic? = null

    // queues
    private data class PendingWrite(
        val c: BluetoothGattCharacteristic,
        val data: ByteArray,
        val writeType: Int,
        val expectsCallback: Boolean
    )

    private val writeQueue = ArrayDeque<PendingWrite>()
    private var isWriting = false

    private val readQueue = ArrayDeque<BluetoothGattCharacteristic>()
    private var isReading = false

    // pending provisioning
    private var pendingWifi: Pair<String, String>? = null

    private data class PendingMqttData(
        val user: String,
        val pass: String,
        val host: String,
        val port: String
    )
    private var pendingMqtt: PendingMqttData? = null

    // anti-flapping (comme iOS)
    private var provisioningDeadlineMs: Long = 0L
    private var lastStrongPositiveAtMs: Long = 0L
    private var negativeStreak: Int = 0

    // ---------- UI progression helpers ----------
    private fun stepIsBusy(step: ProvisionStep): Boolean {
        return when (step) {
            ProvisionStep.CONNECTING,
            ProvisionStep.DISCOVERING,
            ProvisionStep.READING_INFO,
            ProvisionStep.SENDING_WIFI,
            ProvisionStep.WAITING_WIFI,
            ProvisionStep.SENDING_MQTT -> true
            else -> false
        }
    }

    private fun updateBusy() {
        val s = _state.value
        val busy = stepIsBusy(s.step) || isWriting || isReading
        if (s.busy != busy) {
            _state.value = s.copy(busy = busy)
        }
    }

    private fun setStep(step: ProvisionStep, text: String = "") {
        val s = _state.value
        _state.value = s.copy(
            step = step,
            stepText = text,
            canRetry = (step == ProvisionStep.ERROR)
        )
        updateBusy()
    }

    private fun setError(msg: String) {
        val s = _state.value
        _state.value = s.copy(
            lastError = msg,
            step = ProvisionStep.ERROR,
            stepText = if (msg.length > 60) "Erreur" else msg,
            canRetry = true,
            wifiConnecting = false
        )
        updateBusy()
    }

    private fun clearError() {
        val s = _state.value
        if (s.lastError != null || s.canRetry) {
            _state.value = s.copy(lastError = null, canRetry = false)
        }
    }

    private fun updateReadyStateIfPossible() {
        val s = _state.value
        // "Prêt" dès qu'on a UID + topic.
        if (s.espUid.isNotBlank() && s.topicPrefix.isNotBlank()) {
            if (s.wifiConnected) {
                if (s.step != ProvisionStep.READY_TO_CREATE) {
                    _state.value = s.copy(
                        step = ProvisionStep.READY_TO_CREATE,
                        stepText = "Prêt à créer",
                        canRetry = false
                    )
                }
            } else {
                if (s.step == ProvisionStep.READING_INFO ||
                    s.step == ProvisionStep.DISCOVERING ||
                    s.step == ProvisionStep.CONNECTING
                ) {
                    _state.value = s.copy(
                        step = ProvisionStep.READY,
                        stepText = "Prêt",
                        canRetry = false
                    )
                }
            }
            updateBusy()
        }
    }

    /**
     * Quand UID/Topic sont finalement lus, on peut effacer l'erreur "caractéristiques manquantes".
     */
    private fun clearMissingErrorIfOk() {
        val s = _state.value
        if (s.espUid.isNotBlank() && s.topicPrefix.isNotBlank()
            && s.lastError?.startsWith("BLE: caractéristiques manquantes") == true
        ) {
            _state.value = s.copy(lastError = null, canRetry = false)
        }
    }

    fun refreshBluetoothState() {
        val on = adapter?.isEnabled == true
        _state.value = _state.value.copy(isPoweredOn = on)
    }

    @SuppressLint("MissingPermission")
    fun startScan() {
        refreshBluetoothState()
        if (_state.value.isPoweredOn.not()) {
            setError("Bluetooth désactivé")
            return
        }

        known.clear()
        clearError()
        _state.value = _state.value.copy(
            isScanning = true,
            devices = emptyList(),
            lastError = null,
            step = ProvisionStep.SCANNING,
            stepText = "Scan BLE…",
            canRetry = false
        )
        updateBusy()

        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()

        val cb = scanCallback

        scanner?.startScan(null, settings, cb)

        scanJob?.cancel()
        scanJob = scope.launch {
            delay(10_000)
            stopScan()
        }
    }

    @SuppressLint("MissingPermission")
    fun stopScan() {
        if (_state.value.isScanning.not()) return
        try {
            scanner?.stopScan(scanCallback)
        } catch (_: Throwable) {
        }
        scanJob?.cancel()
        scanJob = null
        val hadSelection = _state.value.selected != null
        _state.value = _state.value.copy(
            isScanning = false,
            step = if (!hadSelection && _state.value.step == ProvisionStep.SCANNING) {
                ProvisionStep.IDLE
            } else {
                _state.value.step
            },
            stepText = if (!hadSelection && _state.value.step == ProvisionStep.SCANNING) {
                ""
            } else {
                _state.value.stepText
            }
        )
        updateBusy()
    }

    @SuppressLint("MissingPermission")
    fun connect(device: BleDevice) {
        disconnect()

        _state.value = _state.value.copy(
            selected = device,
            espUid = "",
            topicPrefix = "",
            wifiConnecting = false,
            wifiConnected = false,
            lastError = null,
            step = ProvisionStep.CONNECTING,
            stepText = context.getString(R.string.connexion),
            canRetry = false
        )
        updateBusy()

        gatt = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            device.device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
        } else {
            device.device.connectGatt(context, false, gattCallback)
        }
    }

    @SuppressLint("MissingPermission")
    fun disconnect() {
        cancelWifiTimeout()
        try {
            gatt?.close()
        } catch (_: Throwable) {
        }
        gatt = null
        mtu = 23
        clearChars()
        clearQueues()
        pendingWifi = null
        pendingMqtt = null
        _state.value = _state.value.copy(
            wifiConnecting = false,
            wifiConnected = false
        )
        updateBusy()
    }

    /**
     * Réessayer sans relancer l'écran :
     * - s'il y a un périphérique sélectionné → on reconnecte et on relit UID/Topic
     * - sinon → on relance un scan
     */
    @SuppressLint("MissingPermission")
    fun retry() {
        val sel = _state.value.selected
        clearError()
        cancelWifiTimeout()
        if (sel != null) {
            connect(sel)
        } else {
            startScan()
        }
    }

    @SuppressLint("MissingPermission")
    fun pushWifi(ssid: String, pass: String) {
        if (_state.value.selected == null) {
            setError(context.getString(R.string.no_device_selected))
            return
        }
        if (ssid.isBlank()) {
            setError(context.getString(R.string.empty_ssid))
            return
        }

        pendingWifi = ssid.trim() to pass
        startProvisioningWindow(8_000)

        clearError()
        setStep(ProvisionStep.SENDING_WIFI, context.getString(R.string.sending_wi_fi_settings))
        _state.value = _state.value.copy(wifiConnecting = true, wifiConnected = false)

        val g = gatt
        if (g == null) {
            setError(context.getString(R.string.not_connected_to_the_device_ble))
            return
        }

        if (wifiSsidChar != null && wifiPassChar != null) {
            sendPendingWifi(g)
            return
        }

        if (!hasBluetoothConnectPermission()) {
            setError(context.getString(R.string.bluetooth_connection_permission_missing))
            return
        }

        discoverServicesSafely(g)
    }

    @SuppressLint("MissingPermission")
    fun pushMqttCredentials(username: String, password: String, host: String, port: String) {
        if (username.isBlank()) {
            setError(context.getString(R.string.empty_mqtt_username))
            return
        }
        pendingMqtt = PendingMqttData(user = username.trim(), pass = password, host = host, port = port)
        val g = gatt ?: return
        clearError()
        setStep(ProvisionStep.SENDING_MQTT, context.getString(R.string.sending_mqtt_settings))
        if (mqttUserChar != null && mqttPassChar != null) {
            sendPendingMqtt(g)
        } else {
            if (!hasBluetoothConnectPermission()) {
                setError(context.getString(R.string.bluetooth_connection_permission_missing))
                return
            }

            discoverServicesSafely(g)
        }
    }

    fun generateMqttPassword(length: Int = 32): String {
        val chars =
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}.,:?"
        val rnd = SecureRandom()
        val sb = StringBuilder(length)
        repeat(length) {
            sb.append(chars[rnd.nextInt(chars.length)])
        }
        return sb.toString()
    }

    // ---------- Scan callback ----------
    private val scanCallback = object : ScanCallback() {
        @SuppressLint("MissingPermission")
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val dev = result.device ?: return
            val name = result.scanRecord?.deviceName ?: dev.name ?: return
            if (!name.startsWith(targetNamePrefix)) return

            val address = dev.address
            known[address] = BleDevice(dev, name, result.rssi)

            _state.value = _state.value.copy(
                devices = known.values.sortedBy { it.name }
            )
        }

        override fun onScanFailed(errorCode: Int) {
            setError(context.getString(R.string.ble_scan_failed, errorCode))
        }
    }

    // ---------- GATT callback ----------
    private val gattCallback = object : BluetoothGattCallback() {

        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                clearError()
                setStep(ProvisionStep.DISCOVERING, context.getString(R.string.discover_our_services))
                try {
                    g.requestMtu(247)
                } catch (_: Throwable) {
                }
                discoverServicesSafely(g)
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                if (status != 0) {
                    setError(context.getString(R.string.disconnected_status, status))
                } else {
                    _state.value = _state.value.copy(step = ProvisionStep.IDLE, stepText = "")
                    updateBusy()
                }
                clearChars()
                clearQueues()
            }
        }

        override fun onMtuChanged(g: BluetoothGatt, mtuValue: Int, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                mtu = mtuValue
            }
        }

        @SuppressLint("MissingPermission")
        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                setError(context.getString(R.string.services_error_status, status))
                return
            }

            clearError()
            setStep(ProvisionStep.READING_INFO, context.getString(R.string.uid_topic_reading))

            clearChars()

            g.services?.forEach { svc ->
                svc.characteristics?.forEach { c ->
                    when (c.uuid) {
                        ESP_UID_UUID -> espUidChar = c
                        TOPIC_PREFIX_UUID -> topicPrefixChar = c
                        WIFI_SSID_UUID -> wifiSsidChar = c
                        WIFI_PASS_UUID -> wifiPassChar = c
                        WIFI_STATUS_UUID -> wifiStatusChar = c
                        MQTT_HOST_UUID -> mqttHostChar = c
                        MQTT_PORT_UUID -> mqttPortChar = c
                        MQTT_USER_UUID -> mqttUserChar = c
                        MQTT_PASS_UUID -> mqttPassChar = c
                    }

                    val s0 = _state.value
                    val hasUid = (espUidChar != null) || s0.espUid.isNotBlank()
                    val hasTopic = (topicPrefixChar != null) || s0.topicPrefix.isNotBlank()

                    val missing = mutableListOf<String>()
                    if (!hasUid) missing += context.getString(R.string.esp_uid_1006)
                    if (!hasTopic) missing += context.getString(R.string.topic_prefix_1005)

                    _state.value = if (missing.isEmpty()) {
                        if (s0.lastError?.startsWith("BLE: caractéristiques manquantes") == true) {
                            s0.copy(lastError = null)
                        } else {
                            s0
                        }
                    } else {
                        s0.copy(lastError = "BLE: caractéristiques manquantes : ${missing.joinToString()}")
                    }
                }
            }

            espUidChar?.let { enqueueRead(g, it) }
            topicPrefixChar?.let { enqueueRead(g, it) }

            wifiStatusChar?.let { statusChar ->
                mainHandler.postDelayed({
                    if (gatt == g) {
                        enableNotify(g, statusChar)
                    }
                }, 600)
            }

            if (pendingWifi != null && wifiSsidChar != null && wifiPassChar != null) {
                sendPendingWifi(g)
            }
            if (pendingMqtt != null && mqttUserChar != null && mqttPassChar != null) {
                sendPendingMqtt(g)
            }
        }

        private fun handleCharacteristicRead(
            g: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
            status: Int
        ) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                val text = String(value, Charsets.UTF_8).trim()
                when (characteristic.uuid) {
                    ESP_UID_UUID -> {
                        _state.value = _state.value.copy(espUid = text)
                        clearMissingErrorIfOk()
                        updateReadyStateIfPossible()
                    }

                    TOPIC_PREFIX_UUID -> {
                        _state.value = _state.value.copy(topicPrefix = text)
                        clearMissingErrorIfOk()
                        updateReadyStateIfPossible()
                    }

                    WIFI_STATUS_UUID -> handleWifiStatusText(text)
                }
            }
            isReading = false
            updateBusy()
            processNextRead(g)
        }

        @Deprecated("Conservé pour compatibilité Android < 13")
        override fun onCharacteristicRead(
            g: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int
        ) {
            @Suppress("DEPRECATION")
            val value = characteristic.value ?: byteArrayOf()
            handleCharacteristicRead(g, characteristic, value, status)
        }

        override fun onCharacteristicRead(
            g: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
            status: Int
        ) {
            handleCharacteristicRead(g, characteristic, value, status)
        }

        private fun handleCharacteristicChanged(
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray
        ) {
            val text = String(value, Charsets.UTF_8)
            if (characteristic.uuid == WIFI_STATUS_UUID) {
                handleWifiStatusText(text)
            }
        }

        @Deprecated("Conservé pour compatibilité Android < 13")
        override fun onCharacteristicChanged(
            g: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic
        ) {
            @Suppress("DEPRECATION")
            val value = characteristic.value ?: byteArrayOf()
            handleCharacteristicChanged(characteristic, value)
        }

        override fun onCharacteristicChanged(
            g: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray
        ) {
            handleCharacteristicChanged(characteristic, value)
        }

        override fun onCharacteristicWrite(
            g: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int
        ) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                setError(
                    context.getString(
                        R.string.writing_error_status_on,
                        status,
                        characteristic.uuid
                    )
                )
            }
            isWriting = false
            updateBusy()
            processNextWrite(g)
        }

        override fun onDescriptorWrite(
            g: BluetoothGatt,
            descriptor: BluetoothGattDescriptor,
            status: Int
        ) {
            // rien
        }
    }

    // ---------- Reads queue ----------
    @SuppressLint("MissingPermission")
    private fun enqueueRead(g: BluetoothGatt, c: BluetoothGattCharacteristic) {
        readQueue.add(c)
        if (!isReading) processNextRead(g)
        updateBusy()
    }

    @SuppressLint("MissingPermission")
    private fun processNextRead(g: BluetoothGatt) {
        if (isReading) return
        val next = readQueue.removeFirstOrNull() ?: run {
            updateBusy()
            return
        }

        val canRead = (next.properties and BluetoothGattCharacteristic.PROPERTY_READ) != 0
        if (!canRead) {
            setError("Char non lisible (READ absent): ${next.uuid}")
            isReading = false
            updateBusy()
            mainHandler.post { processNextRead(g) }
            return
        }

        isReading = true
        updateBusy()
        val ok = g.readCharacteristic(next)

        if (!ok) {
            isReading = false
            updateBusy()
            readQueue.add(0, next)
            mainHandler.postDelayed({ processNextRead(g) }, 250)
        }
    }

    // ---------- Writes queue ----------
    @SuppressLint("MissingPermission")
    private fun enqueueWrite(g: BluetoothGatt, c: BluetoothGattCharacteristic, bytes: ByteArray) {
        val props = c.properties
        val canWrite = (props and BluetoothGattCharacteristic.PROPERTY_WRITE) != 0
        val canWriteNoRsp = (props and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0
        if (!canWrite && !canWriteNoRsp) {
            setError("Char non inscriptible: ${c.uuid}")
            return
        }

        val writeType = if (canWrite) {
            BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
        } else {
            BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
        }

        val expectsCallback = (writeType == BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT)

        val payloadMax = maxOf(20, mtu - 3)
        var offset = 0
        while (offset < bytes.size) {
            val end = min(offset + payloadMax, bytes.size)
            val chunk = bytes.copyOfRange(offset, end)
            writeQueue.add(PendingWrite(c, chunk, writeType, expectsCallback))
            offset = end
        }

        if (!isWriting) processNextWrite(g)
        updateBusy()
    }

    @SuppressLint("MissingPermission")
    @Suppress("DEPRECATION")
    private fun processNextWrite(g: BluetoothGatt) {
        if (isWriting) return
        val next = writeQueue.removeFirstOrNull() ?: run {
            val s = _state.value
            when (s.step) {
                ProvisionStep.SENDING_MQTT -> {
                    if (s.wifiConnected && s.espUid.isNotBlank() && s.topicPrefix.isNotBlank()) {
                        _state.value = s.copy(
                            step = ProvisionStep.READY_TO_CREATE,
                            stepText = "Prêt à créer",
                            canRetry = false
                        )
                    } else {
                        _state.value = s.copy(
                            step = ProvisionStep.READY,
                            stepText = "MQTT envoyé",
                            canRetry = false
                        )
                    }
                }

                else -> Unit
            }
            updateBusy()
            return
        }

        next.c.writeType = next.writeType
        next.c.value = next.data

        val ok: Boolean = g.writeCharacteristic(next.c)

        if (!ok) {
            setError(context.getString(R.string.ble_writing_denied, next.c.uuid))
            isWriting = false
            updateBusy()
            writeQueue.add(0, next)
            mainHandler.postDelayed({ processNextWrite(g) }, 250)
            return
        }

        if (next.expectsCallback) {
            isWriting = true
            updateBusy()
        } else {
            isWriting = false
            updateBusy()
            mainHandler.postDelayed({ processNextWrite(g) }, 40)
        }
    }

    // ---------- Enable notify ----------
    @SuppressLint("MissingPermission")
    @Suppress("DEPRECATION")
    private fun enableNotify(g: BluetoothGatt, c: BluetoothGattCharacteristic) {
        val canNotify = (c.properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0
        val canIndicate = (c.properties and BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0
        if (!canNotify && !canIndicate) return

        g.setCharacteristicNotification(c, true)

        val desc = c.getDescriptor(CCCD_UUID) ?: return
        val value = if (canNotify) {
            BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
        } else {
            BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
        }

        if (Build.VERSION.SDK_INT >= 33) {
            g.writeDescriptor(desc, value)
        } else {
            desc.value = value
            g.writeDescriptor(desc)
        }
    }

    // ---------- Send pending Wi-Fi / MQTT ----------
    private fun sendPendingWifi(g: BluetoothGatt) {
        val (ssid, pass) = pendingWifi ?: return

        wifiSsidChar?.let { enqueueWrite(g, it, ssid.toByteArray(Charsets.UTF_8)) }
        wifiPassChar?.let { enqueueWrite(g, it, pass.toByteArray(Charsets.UTF_8)) }

        pendingWifi = null

        _state.value = _state.value.copy(wifiConnecting = true, wifiConnected = false)
        setStep(ProvisionStep.WAITING_WIFI, context.getString(R.string.waiting_for_wi_fi_connection))
        startWifiTimeout()
    }

    private fun sendPendingMqtt(g: BluetoothGatt) {
        val pending = pendingMqtt ?: return

        setStep(ProvisionStep.SENDING_MQTT, context.getString(R.string.sending_mqtt_settings))

        mqttHostChar?.let { enqueueWrite(g, it, pending.host.toByteArray(Charsets.UTF_8)) }
        mqttPortChar?.let { enqueueWrite(g, it, pending.port.toByteArray(Charsets.UTF_8)) }
        mqttUserChar?.let { enqueueWrite(g, it, pending.user.toByteArray(Charsets.UTF_8)) }
        mqttPassChar?.let { enqueueWrite(g, it, pending.pass.toByteArray(Charsets.UTF_8)) }

        pendingMqtt = null
    }

    // ---------- Wi-Fi status parsing ----------
    private enum class WifiClass { POSITIVE, NEGATIVE, NEUTRAL }

    private fun classifyWifi(s: String): WifiClass {
        val lower = s.trim().lowercase()

        if (lower.contains("mqtt")) return WifiClass.NEUTRAL

        val ipv4Regex = Regex("""(?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)""")
        if (ipv4Regex.containsMatchIn(lower)) return WifiClass.POSITIVE

        if (lower.contains("got_ip") ||
            lower.contains("connected:") ||
            lower == "connected" ||
            lower.contains("association ok") ||
            lower.contains("ok") ||
            lower == "1" ||
            lower.contains("up")
        ) return WifiClass.POSITIVE

        if (lower.contains("disconnect") || lower.contains("déconnect") ||
            lower.contains("reason=") || lower.contains("fail") || lower == "0"
        ) return WifiClass.NEGATIVE

        return WifiClass.NEUTRAL
    }

    private fun handleWifiStatusText(text: String) {
        val cls = classifyWifi(text)
        val now = System.currentTimeMillis()
        val inProvisioning = provisioningDeadlineMs != 0L && now < provisioningDeadlineMs

        when (cls) {
            WifiClass.POSITIVE -> {
                lastStrongPositiveAtMs = now
                negativeStreak = 0
                provisioningDeadlineMs = 0L
                _state.value = _state.value.copy(
                    wifiConnected = true,
                    wifiConnecting = false
                )
                cancelWifiTimeout()
                setStep(ProvisionStep.READY, context.getString(R.string.wi_fi_connected))
                updateReadyStateIfPossible()
            }

            WifiClass.NEGATIVE -> {
                if (inProvisioning) return
                negativeStreak += 1
                val recentPositive =
                    (lastStrongPositiveAtMs != 0L && (now - lastStrongPositiveAtMs) < 3000)
                if (negativeStreak >= 2 && !recentPositive) {
                    _state.value = _state.value.copy(wifiConnected = false)
                }
            }

            WifiClass.NEUTRAL -> Unit
        }
    }

    // ---------- timeout Wi-Fi ----------
    private var wifiTimeoutJob: Job? = null

    private fun startProvisioningWindow(ms: Long) {
        provisioningDeadlineMs = System.currentTimeMillis() + ms
        negativeStreak = 0
        lastStrongPositiveAtMs = 0L
    }

    private fun startWifiTimeout() {
        wifiTimeoutJob?.cancel()
        wifiTimeoutJob = scope.launch {
            delay(15_000)
            if (_state.value.wifiConnected.not()) {
                _state.value = _state.value.copy(wifiConnecting = false)
                setError("Wi-Fi: no confirmation from ESP (timeout). Check SSID/password.")
                gatt?.let { g ->
                    wifiStatusChar?.let { enqueueRead(g, it) }
                }
            }
        }
    }

    private fun cancelWifiTimeout() {
        wifiTimeoutJob?.cancel()
        wifiTimeoutJob = null
    }

    /**
     * discoverServices() peut retourner false si une autre opération GATT est en cours.
     * Dans ce cas, on évite d'afficher une erreur "rouge" et on retente une seule fois.
     */
    @SuppressLint("MissingPermission")
    private fun discoverServicesSafely(g: BluetoothGatt) {
        val ok = try {
            g.discoverServices()
        } catch (_: SecurityException) {
            false
        }
        if (ok) return
        mainHandler.postDelayed({
            try {
                g.discoverServices()
            } catch (_: Throwable) {
            }
        }, 300)
    }

    // ---------- utils ----------
    private fun clearChars() {
        espUidChar = null
        topicPrefixChar = null
        wifiSsidChar = null
        wifiPassChar = null
        wifiStatusChar = null
        mqttHostChar = null
        mqttPortChar = null
        mqttUserChar = null
        mqttPassChar = null
    }

    private fun clearQueues() {
        writeQueue.clear()
        readQueue.clear()
        isWriting = false
        isReading = false
    }

    private fun hasBluetoothConnectPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ActivityCompat.checkSelfPermission(
                context,
                Manifest.permission.BLUETOOTH_CONNECT
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }
}