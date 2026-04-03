//
//  BLEManager.swift
//  XamIoT SoundSense
//
//  Created by Jérémy FAUVET on 04/10/2025.
//

import Foundation
import CoreBluetooth
import Combine

// MARK: - UUIDs (custom infos)
private let ESP_INFO_SERVICE_UUID = CBUUID(string: "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb1000") // si aucun service dédié, on découvre tout
private let ESP_UID_UUID          = CBUUID(string: "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb1006")
private let TOPIC_PREFIX_UUID     = CBUUID(string: "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb1005")

// 🔹 MQTT (firmware)
private let MQTT_HOST_UUID        = CBUUID(string: "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb0001")
private let MQTT_PORT_UUID        = CBUUID(string: "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb0002")
private let MQTT_USER_UUID        = CBUUID(string: "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb0003")
private let MQTT_PASS_UUID        = CBUUID(string: "7e1a9da9-2f1a-4d0e-bf2c-0f7f8efb0004")

// MARK: - WiFi (firmware)
private let SERVICE_WIFI_UUID  = CBUUID(string: "4fafc201-1fb5-459e-8fcc-c5c9c331914b")
private let WIFI_SSID_UUID     = CBUUID(string: "beb5483e-36e1-4688-b7f5-ea07361b26a8")
private let WIFI_PASS_UUID     = CBUUID(string: "cba1d466-3d7c-4382-8098-edbded2ef9e0")
private let WIFI_STATUS_UUID   = CBUUID(string: "5e3b1f9e-2d8a-4a1f-8c3d-9e7f1a3b5c7d")

private var userInitiatedConnectId: UUID?


// Filtre nom
private let kTargetNamePrefix = "SOUND-SENSOR"

// MARK: - Modèle
struct BLEDevice: Identifiable, Equatable {
    let id: UUID
    let name: String
    let peripheral: CBPeripheral
    var espUID: String?
    var topicPrefix: String?
    var wifiConnected: Bool = false

    static func == (lhs: BLEDevice, rhs: BLEDevice) -> Bool { lhs.id == rhs.id }
}

// MARK: - Manager
final class BLEManager: NSObject, ObservableObject {
    static let shared = BLEManager()

    // État public UI
    @Published private(set) var isPoweredOn = false
    @Published private(set) var isScanning = false
    @Published private(set) var devices: [BLEDevice] = []
    @Published var selected: BLEDevice?
    @Published private(set) var wifiConnecting = false
    @Published private(set) var wifiConnected = false
    @Published var lastBLEError: String?

    // CoreBluetooth
    private var central: CBCentralManager!
    private var known: [UUID: BLEDevice] = [:]

    // Caractéristiques Wi-Fi mémorisées (peu importe le service)
    private var wifiSsidChar: CBCharacteristic?
    private var wifiPassChar: CBCharacteristic?
    private var wifiStatChar: CBCharacteristic?
    
    // 🔹 Caractéristiques MQTT mémorisées
    private var mqttHostChar: CBCharacteristic?
    private var mqttPortChar: CBCharacteristic?
    private var mqttUserChar: CBCharacteristic?
    private var mqttPassChar: CBCharacteristic?

    // Écritures / MTU
    private struct PendingWrite {
        let characteristic: CBCharacteristic
        let data: Data
        let type: CBCharacteristicWriteType
        let label: String
    }
    private var writeQueue: [PendingWrite] = []
    private var isWriting = false
    private var maxWriteWithRsp: Int = 180
    private var maxWriteNoRsp: Int  = 180

    // Orchestration Wi-Fi
    private var pendingWiFi: (ssid: String, pass: String)?
    private var wantWifiAfterConnect = false
    private var wifiTimeoutWorkItem: DispatchWorkItem?
    
    // 🔹 Orchestration MQTT
    private var pendingMqtt: (username: String, pass: String, host: String, port: String)?

    // Anti-flapping / fenêtre de provisioning
    private var provisioningDeadline: Date?
    private var lastStrongPositiveAt: Date?
    private var negativeStreak: Int = 0

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: .main)
    }

    // MARK: - Scan / Connexion
    func startScan() {
        guard isPoweredOn else { return }
        lastBLEError = nil
        devices.removeAll()
        known.removeAll()
        isScanning = true
        central.scanForPeripherals(withServices: nil, options: [
            CBCentralManagerScanOptionAllowDuplicatesKey: false
        ])
        // auto-stop au bout de 10s
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in
            self?.stopScan()
        }
        print("🔎 Scan démarré")
    }

    func stopScan() {
        guard isScanning else { return }
        central.stopScan()
        isScanning = false
        print("🛑 Scan arrêté")
    }

    func connect(_ device: BLEDevice) {
        lastBLEError = nil
        userInitiatedConnectId = device.id          // ✅ on marque l'intention utilisateur
        print("🔗 Connexion à \(device.name)")
        central.connect(device.peripheral, options: nil)
    }

    func disconnectSelected() {
        guard let sel = selected else { return }
        print("🔌 Déconnexion de \(sel.name)")
        central.cancelPeripheralConnection(sel.peripheral)
        selected = nil
        wifiConnected = false
        wifiConnecting = false
        wifiSsidChar = nil
        wifiPassChar = nil
        wifiStatChar = nil
        
        // 🔹 reset MQTT
        mqttHostChar = nil
        mqttPortChar = nil
        mqttUserChar = nil
        mqttPassChar = nil
        pendingMqtt = nil
        
        writeQueue.removeAll()
        isWriting = false
        pendingWiFi = nil
        cancelWifiTimeout()
        clearProvisioningWindow()
    }

    func disconnectAll() {
        // Stoppe le scan d’abord (sinon iOS peut relancer des connexions)
        if isScanning { stopScan() }

        // Déconnexion de tous les périphériques connus
        for dev in devices {
            central.cancelPeripheralConnection(dev.peripheral)
        }

        // Réinitialise l’état UI
        selected = nil
        wifiConnected = false
        wifiConnecting = false
        //statusChar = nil
        lastBLEError = nil
    }

    // MARK: - Push Wi-Fi (robuste)
    func pushWiFi(ssid: String, password: String) {
        guard let sel = selected else {
            lastBLEError = "Aucun périphérique sélectionné"
            print("⚠️ pushWiFi: pas de selected")
            return
        }
        guard !ssid.isEmpty else {
            lastBLEError = "SSID vide"
            print("⚠️ pushWiFi: SSID vide")
            return
        }

        print("➡️ pushWiFi demandé pour \(sel.name)")
        wifiConnecting = true
        wifiConnected  = false
        pendingWiFi    = (ssid, password)
        wantWifiAfterConnect = true

        // Démarre la fenêtre de provisioning anti-flapping (8s)
        startProvisioningWindow(seconds: 8)

        // S'assurer du delegate
        sel.peripheral.delegate = self

        // Si pas connecté → se (re)connecter
        if sel.peripheral.state != .connected {
            print("ℹ️ pushWiFi: périphérique pas connecté → central.connect()")
            userInitiatedConnectId = sel.id  // ✅ connexion déclenchée par action utilisateur
            central.connect(sel.peripheral, options: nil)
            startWifiTimeout(for: sel.peripheral)
            return
        }

        // Déjà connecté → on (re)découvre tous les services pour attraper les chars quel que soit le service
        print("ℹ️ pushWiFi: discoverServices(nil)")
        sel.peripheral.discoverServices(nil)
        startWifiTimeout(for: sel.peripheral)

        // Lecture de statut programmée (au cas où l'ESP notifie peu)
        scheduleStatusPolls(on: sel.peripheral)
    }
    
    // MARK: - Push MQTT credentials
    func pushMqttCredentials(username: String, password: String, host: String, port: String) {
        guard let sel = selected else {
            lastBLEError = "Aucun périphérique sélectionné"
            print("⚠️ pushMqttCredentials: pas de selected")
            return
        }
        guard !username.isEmpty else {
            lastBLEError = "Nom d’utilisateur MQTT vide"
            print("⚠️ pushMqttCredentials: username vide")
            return
        }

        print("➡️ pushMqttCredentials demandé pour \(sel.name) (user=\(username) host=\(host):\(port))")

        // On mémorise ce qu’on veut envoyer (comme pour pendingWiFi)
        pendingMqtt = (username: username, pass: password, host: host, port: port)

        // S’assurer du delegate
        sel.peripheral.delegate = self

        // Si pas encore connecté, on se connecte ; l’envoi se fera
        // dans didDiscoverCharacteristicsFor dès que les chars MQTT sont connues.
        if sel.peripheral.state != .connected {
            print("ℹ️ pushMqttCredentials: périphérique pas connecté → central.connect()")
            userInitiatedConnectId = sel.id
            central.connect(sel.peripheral, options: nil)
            return
        }

        // Déjà connecté : si les chars sont déjà connues, on envoie tout de suite,
        // sinon on déclenche discoverServices(nil) pour les découvrir.
        if mqttHostChar != nil && mqttPortChar != nil &&
           mqttUserChar != nil && mqttPassChar != nil {
            print("ℹ️ pushMqttCredentials: chars MQTT déjà connues → envoi direct")
            sendPendingMqtt(on: sel.peripheral)
        } else {
            print("ℹ️ pushMqttCredentials: chars MQTT inconnues → discoverServices(nil)")
            sel.peripheral.discoverServices(nil)
        }
    }

    private func sendPendingWiFi(on p: CBPeripheral) {
        guard let pending = pendingWiFi else {
            print("ℹ️ sendPendingWiFi: rien à envoyer")
            return
        }

        // SSID
        if let c = wifiSsidChar {
            let ssidData = pending.ssid.trimmingCharacters(in: .whitespaces).data(using: .utf8) ?? Data()
            enqueueWrite(ssidData, to: c, label: "Wi-Fi SSID", on: p)
        } else {
            print("❌ WIFI_SSID char absente")
        }

        // PASS
        if let c = wifiPassChar {
            let passData = pending.pass.data(using: .utf8) ?? Data()
            enqueueWrite(passData, to: c, label: "Wi-Fi PASS", on: p)
        } else {
            print("❌ WIFI_PASS char absente")
        }

        pendingWiFi = nil
        if !isWriting { processNextWrite(on: p) }

        // Lecture initiale du statut si possible
        if let st = wifiStatChar, st.properties.contains(.read) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                p.readValue(for: st)
            }
        }
    }
    
    private func sendPendingMqtt(on p: CBPeripheral) {
        guard let pending = pendingMqtt else {
            print("ℹ️ sendPendingMqtt: rien à envoyer")
            return
        }

        // HOST
        if let c = mqttHostChar {
            let hostData = pending.host.data(using: .utf8) ?? Data()
            enqueueWrite(hostData, to: c, label: "MQTT HOST", on: p)
        } else {
            print("⚠️ MQTT_HOST char absente — hôte non poussé")
        }

        // PORT
        if let c = mqttPortChar {
            let portData = pending.port.data(using: .utf8) ?? Data()
            enqueueWrite(portData, to: c, label: "MQTT PORT", on: p)
        } else {
            print("⚠️ MQTT_PORT char absente — port non poussé")
        }

        // USER
        if let c = mqttUserChar {
            let userData = pending.username
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .data(using: .utf8) ?? Data()
            enqueueWrite(userData, to: c, label: "MQTT USER", on: p)
        } else {
            print("❌ MQTT_USER char absente")
        }

        // PASS
        if let c = mqttPassChar {
            let passData = pending.pass.data(using: .utf8) ?? Data()
            enqueueWrite(passData, to: c, label: "MQTT PASS", on: p)
        } else {
            print("❌ MQTT_PASS char absente")
        }

        pendingMqtt = nil

        if !isWriting {
            processNextWrite(on: p)
        }
    }


    // MARK: - Internes
    private func upsert(_ peripheral: CBPeripheral, name: String?) {
        guard let n = name, n.hasPrefix(kTargetNamePrefix) else { return }
        if known[peripheral.identifier] == nil {
            peripheral.delegate = self
            let d = BLEDevice(id: peripheral.identifier,
                              name: n,
                              peripheral: peripheral,
                              espUID: nil,
                              topicPrefix: nil,
                              wifiConnected: false)
            known[peripheral.identifier] = d
            devices = Array(known.values).sorted { $0.name < $1.name }
            print("➕ Ajout \(n) (\(peripheral.identifier))")
            // 🚫 Ne pas connecter ici. On attend une action utilisateur.
        }
    }


    private func updateSelected(with newValue: BLEDevice) {
        if selected?.id == newValue.id { selected = newValue }
        known[newValue.id] = newValue
        devices = Array(known.values).sorted { $0.name < $1.name }
    }
}

// MARK: - CBCentralManagerDelegate
extension BLEManager: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        isPoweredOn = central.state == .poweredOn
        if !isPoweredOn { isScanning = false }
        print("📶 Bluetooth state = \(central.state.rawValue)")
    }

    func centralManager(_ central: CBCentralManager,
                        didDiscover peripheral: CBPeripheral,
                        advertisementData: [String : Any],
                        rssi RSSI: NSNumber) {
        let name = (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? peripheral.name
        upsert(peripheral, name: name)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        // MTU
        maxWriteWithRsp = peripheral.maximumWriteValueLength(for: .withResponse)
        maxWriteNoRsp  = peripheral.maximumWriteValueLength(for: .withoutResponse)
        print("✅ Connecté \(peripheral.identifier) — MTU WR/RNR \(maxWriteWithRsp)/\(maxWriteNoRsp)")

        peripheral.delegate = self
        peripheral.discoverServices(nil)

        // 🚫 Ancien code (à enlever) :
        // if selected == nil, let d = known[peripheral.identifier] { selected = d }

        // ✅ Nouveau : ne sélectionner que si la connexion était initiée par l'utilisateur
        if userInitiatedConnectId == peripheral.identifier,
           let d = known[peripheral.identifier] {
            selected = d
        }
        userInitiatedConnectId = nil
    }


    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        lastBLEError = "Connexion BLE échouée: \(error?.localizedDescription ?? "inconnue")"
        print("❌ didFailToConnect: \(error?.localizedDescription ?? "inconnue")")
        cancelWifiTimeout()
        wifiConnecting = false
        clearProvisioningWindow()
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        if let e = error { lastBLEError = "Déconnecté: \(e.localizedDescription)" }
        print("🔌 Déconnecté \(peripheral.identifier)")
        if userInitiatedConnectId == peripheral.identifier { userInitiatedConnectId = nil }  // ✅
        if selected?.id == peripheral.identifier {
            wifiSsidChar = nil; wifiPassChar = nil; wifiStatChar = nil
            mqttHostChar = nil; mqttPortChar = nil
            mqttUserChar = nil; mqttPassChar = nil
            pendingMqtt = nil
            writeQueue.removeAll(); isWriting = false
            wifiConnecting = false
            cancelWifiTimeout()
            // on ne force pas wifiConnected=false ici ; ta logique statut BLE gère
        }
    }
}

// MARK: - CBPeripheralDelegate
extension BLEManager: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let e = error {
            lastBLEError = "Services: \(e.localizedDescription)"
            print("❌ Services: \(e.localizedDescription)")
            return
        }
        let uuids = (peripheral.services ?? []).map { $0.uuid.uuidString }.joined(separator: ", ")
        print("🔍 Services découverts: \((peripheral.services ?? []).count) → [\(uuids)]")

        peripheral.services?.forEach { svc in
            peripheral.discoverCharacteristics(nil, for: svc)
        }
    }

    func peripheral(_ peripheral: CBPeripheral,
                    didDiscoverCharacteristicsFor service: CBService,
                    error: Error?) {
        if let e = error {
            lastBLEError = "Caractéristiques: \(e.localizedDescription)"
            print("❌ Characteristics(\(service.uuid)): \(e.localizedDescription)")
            return
        }
        guard let chars = service.characteristics else { return }

        // Log exhaustif des caractéristiques
        for c in chars {
            let props = c.properties
            var propsList: [String] = []
            if props.contains(.read) { propsList.append("READ") }
            if props.contains(.write) { propsList.append("WRITE") }
            if props.contains(.writeWithoutResponse) { propsList.append("WRITE_NR") }
            if props.contains(.notify) { propsList.append("NOTIFY") }
            if props.contains(.indicate) { propsList.append("INDICATE") }
            print("  • Char \(c.uuid.uuidString) (\(propsList.joined(separator: "|"))) in service \(service.uuid.uuidString)")

            // Mapping PAR UUID (peu importe le service)
            switch c.uuid {
            case ESP_UID_UUID:
                peripheral.readValue(for: c)
            case TOPIC_PREFIX_UUID:
                peripheral.readValue(for: c)

            case WIFI_SSID_UUID:
                wifiSsidChar = c
                print("🔎 WIFI_SSID prêt")
            case WIFI_PASS_UUID:
                wifiPassChar = c
                print("🔎 WIFI_PASS prêt")
            case WIFI_STATUS_UUID:
                wifiStatChar = c
                print("🔎 WIFI_STATUS prêt")
                if c.properties.contains(.notify) { peripheral.setNotifyValue(true, for: c) }
                if c.properties.contains(.read)   {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { peripheral.readValue(for: c) }
                }
            // 🔹 MQTT
            case MQTT_HOST_UUID:
                mqttHostChar = c
                print("🔎 MQTT_HOST prêt")
            case MQTT_PORT_UUID:
                mqttPortChar = c
                print("🔎 MQTT_PORT prêt")
            case MQTT_USER_UUID:
                mqttUserChar = c
                print("🔎 MQTT_USER prêt")
            case MQTT_PASS_UUID:
                mqttPassChar = c
                print("🔎 MQTT_PASS prêt")
            default:
                break
            }
        }

        // Si un push Wi-Fi attendait, l'envoyer dès qu'on a au moins une des deux chars
        if pendingWiFi != nil, (wifiSsidChar != nil || wifiPassChar != nil) {
            print("➡️ Caractéristiques Wi-Fi détectées → envoi pending")
            sendPendingWiFi(on: peripheral)
        }
        
        // 🔹 Si un push MQTT attendait, l'envoyer dès qu'on a les QUATRE chars
        if pendingMqtt != nil,
           mqttHostChar != nil && mqttPortChar != nil &&
           mqttUserChar != nil && mqttPassChar != nil {
            print("➡️ Caractéristiques MQTT détectées → envoi pending")
            sendPendingMqtt(on: peripheral)
        }
    }

    func peripheral(_ peripheral: CBPeripheral,
                    didUpdateValueFor characteristic: CBCharacteristic,
                    error: Error?) {
        if let e = error {
            lastBLEError = "Lecture: \(e.localizedDescription)"
            print("❌ Read \(characteristic.uuid): \(e.localizedDescription)")
            return
        }
        guard let data = characteristic.value else { return }

        if characteristic.uuid == ESP_UID_UUID {
            let uid = String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
            if var d = known[peripheral.identifier] { d.espUID = uid; updateSelected(with: d) }
            print("📥 ESP_UID = \(String(decoding: data, as: UTF8.self))")

        } else if characteristic.uuid == TOPIC_PREFIX_UUID {
            let topic = String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
            if var d = known[peripheral.identifier] { d.topicPrefix = topic; updateSelected(with: d) }
            print("📥 TOPIC_PREFIX = \(String(decoding: data, as: UTF8.self))")

        } else if characteristic.uuid == WIFI_STATUS_UUID {
            let text = String(decoding: data, as: UTF8.self)
            handleWifiStatusText(text, peripheral: peripheral)
        }
    }

    func peripheral(_ peripheral: CBPeripheral,
                    didWriteValueFor characteristic: CBCharacteristic,
                    error: Error?) {
        if let e = error {
            lastBLEError = "Écriture \(characteristic.uuid): \(e.localizedDescription)"
            print("❌ Write \(characteristic.uuid): \(e.localizedDescription)")
        } else {
            print("✅ Write OK \(characteristic.uuid)")
        }
        processNextWrite(on: peripheral)
    }

    func peripheral(_ peripheral: CBPeripheral,
                    didUpdateNotificationStateFor characteristic: CBCharacteristic,
                    error: Error?) {
        if let e = error {
            print("❌ Notif \(characteristic.uuid): \(e.localizedDescription)")
        } else {
            print("✅ Notif activée \(characteristic.uuid)")
        }
        // Kick lecture statut si notifs OK + lisible
        if characteristic.uuid == WIFI_STATUS_UUID,
           characteristic.isNotifying,
           characteristic.properties.contains(.read) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                peripheral.readValue(for: characteristic)
            }
        }
    }
}

// MARK: - Timeout & Provisioning
private extension BLEManager {
    func startWifiTimeout(for p: CBPeripheral) {
        wifiTimeoutWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self = self else { return }
            if !self.wifiConnected {
                self.wifiConnecting = false
                self.lastBLEError = "Aucune confirmation Wi-Fi de l’ESP (timeout)"
                print("⏰ Timeout Wi-Fi: pas de statut reçu")
                if let st = self.wifiStatChar, st.properties.contains(.read) {
                    p.readValue(for: st)
                }
            }
        }
        wifiTimeoutWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 10, execute: work)
    }

    func cancelWifiTimeout() {
        wifiTimeoutWorkItem?.cancel()
        wifiTimeoutWorkItem = nil
    }

    func startProvisioningWindow(seconds: TimeInterval) {
        provisioningDeadline = Date().addingTimeInterval(seconds)
        negativeStreak = 0
        lastStrongPositiveAt = nil
    }

    func clearProvisioningWindow() {
        provisioningDeadline = nil
        negativeStreak = 0
        lastStrongPositiveAt = nil
    }

    func scheduleStatusPolls(on p: CBPeripheral) {
        guard let st = wifiStatChar, st.properties.contains(.read) else { return }
        let delays: [TimeInterval] = [0.5, 2.0, 4.0, 6.0]
        for d in delays {
            DispatchQueue.main.asyncAfter(deadline: .now() + d) { [weak p, weak st] in
                if let p = p, let st = st { p.readValue(for: st) }
            }
        }
    }
}

// MARK: - Statut Wi-Fi robuste
private extension BLEManager {
    enum WifiClass {
        case positive   // got_ip, connected, up, 1
        case negative   // disconnect, fail, reason=...
        case neutral
    }

    func classify(_ s: String) -> WifiClass {
            let lower = s.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

            // a) ignorer le bruit MQTT
            if lower.contains("mqtt") { return .neutral }

            // b) IPv4 brute n'importe où → positif
            if lower.range(of: #"(?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)"#, options: .regularExpression) != nil {
                return .positive
            }

            // c) mots-clés positifs usuels (FR/EN)
            if lower.contains("got_ip") ||
               lower.contains("connected:") ||   // "connecté: 192.168..." (souvent après IPv4 mais on double-sécurise)
               lower == "connected" ||
               lower.contains("association ok") ||
               lower.contains("ok") ||
               lower == "1" ||
               lower.contains("up")
            {
                return .positive
            }

            // d) négatifs
            if lower.contains("disconnect") || lower.contains("déconnect") ||
               lower.contains("reason=") || lower.contains("fail") || lower == "0"
            {
                return .negative
            }

            // e) "ssid reçu", "pass reçu", "connexion...", "connecté (association)" → neutre
            return .neutral
        }

    func handleWifiStatusText(_ text: String, peripheral: CBPeripheral) {
        let cls = classify(text)
        print("📥 WIFI_STATUS (\(cls)) — «\(text)»")
        let now = Date()
        let inProvisioning = (provisioningDeadline != nil && now < provisioningDeadline!)

        switch cls {
        case .positive:
            // sticky positive
            lastStrongPositiveAt = now
            wifiConnected = true
            wifiConnecting = false
            negativeStreak = 0
            if var d = known[peripheral.identifier] { d.wifiConnected = true; updateSelected(with: d) }
            print("📥 WIFI_STATUS (positive) = CONNECTÉ  — «\(text)»")
            cancelWifiTimeout()
            clearProvisioningWindow()

        case .negative:
            print("📥 WIFI_STATUS (negative) — «\(text)»  inProvisioning=\(inProvisioning)")
            if inProvisioning {
                // on ignore les négatifs pendant la fenêtre, pour ne pas écraser un futur GOT_IP
                return
            }
            negativeStreak += 1
            // Ne bascule à false qu'après 2 négatifs consécutifs ET pas de positif récent (<3s)
            let recentPositive = (lastStrongPositiveAt != nil && now.timeIntervalSince(lastStrongPositiveAt!) < 3)
            if negativeStreak >= 2 && !recentPositive {
                wifiConnected = false
                if var d = known[peripheral.identifier] { d.wifiConnected = false; updateSelected(with: d) }
                print("↘︎ WIFI_STATUS → NON CONNECTÉ (confirmé)")
            }

        case .neutral:
            print("📥 WIFI_STATUS (neutral) — «\(text)»")
            // rien
        }
    }
}

// MARK: - File d’écritures (type & chunk MTU)
private extension BLEManager {
    func enqueueWrite(_ data: Data, to c: CBCharacteristic, label: String, on p: CBPeripheral) {
        let canWrite = c.properties.contains(.write) || c.properties.contains(.writeWithoutResponse)
        guard canWrite else {
            lastBLEError = "Caractéristique \(c.uuid) non inscriptible"
            print("❌ \(label): char \(c.uuid) non inscriptible (props=\(c.properties))")
            return
        }

        let useWithRsp = c.properties.contains(.write)
        let type: CBCharacteristicWriteType = useWithRsp ? .withResponse : .withoutResponse
        let chunkSize = useWithRsp ? maxWriteWithRsp : maxWriteNoRsp

        print("✍️ \(label): type=\(useWithRsp ? "withResponse" : "withoutResponse") mtu=\(chunkSize) bytes (payload \(data.count) bytes)")

        if data.count > chunkSize {
            var offset = 0; var idx = 1
            while offset < data.count {
                let end = min(offset + chunkSize, data.count)
                let chunk = data.subdata(in: offset..<end)
                writeQueue.append(PendingWrite(characteristic: c, data: chunk, type: type, label: "\(label) [\(idx)]"))
                offset = end; idx += 1
            }
        } else {
            writeQueue.append(PendingWrite(characteristic: c, data: data, type: type, label: label))
        }
    }

    func processNextWrite(on p: CBPeripheral) {
        guard !writeQueue.isEmpty else { isWriting = false; print("🏁 File d'écriture terminée"); return }
        isWriting = true
        let next = writeQueue.removeFirst()
        print("📤 Écriture BLE: \(next.label)…")
        p.writeValue(next.data, for: next.characteristic, type: next.type)
    }
}

