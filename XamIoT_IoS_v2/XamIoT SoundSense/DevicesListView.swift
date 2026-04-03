import SwiftUI
import SwiftData
import CoreBluetooth
import Security


struct DevicesListView: View {
    @Environment(\.modelContext) private var ctx_placeholder
    @Query(sort: \ESPDevice.name) private var storedDevices_placeholder: [ESPDevice]
    @EnvironmentObject private var session: SessionStore
    @EnvironmentObject private var ble: BLEManager

    @State private var isLoading = false
    @State private var errorText: String?

    // CRUD UI state
    @State private var showingEditor = false
    @State private var editingDraft = DeviceDraft.empty
    @State private var isSaving = false
    @State private var confirmDelete: ESPDevice?
    @State private var isDeleting = false
    @State private var alertMessage: String?

    // Suppression du compte
    @State private var showDeleteAccountSheet = false
    @State private var deleteEmail = ""
    @State private var isDeletingAccount = false
    @State private var deleteAccountError: String?

    // Auto-refresh (10 s)
    @State private var autoRefreshOn = false
    @State private var autoRefreshTask: Task<Void, Never>? = nil
    private let autoRefreshIntervalNS: UInt64 = 10 * 1_000_000_000

    @Environment(\.scenePhase) private var scenePhase
    @State private var isAppActive = true

    @Environment(\.openURL) private var openURL


    var body: some View {
        NavigationStack {
            contentView
                .navigationTitle("DLV.mydevices")
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Menu {
                            Button {
                                session.signOut()
                            } label: {
                                Label("DLV.signout", systemImage: "person.fill.xmark")
                            }
                            Button {
                                if let url = URL(string: "https://xamiot.com/aide/") {
                                    openURL(url)
                                }
                            } label: {
                                Label("DLV.onlinehelp", systemImage: "safari")
                            }

                            Divider()

                            Button(role: .destructive) {
                                deleteEmail = ""
                                deleteAccountError = nil
                                showDeleteAccountSheet = true
                            } label: {
                                Label("DLV.deleteaccount", systemImage: "person.slash.fill")
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                                .imageScale(.large)
                                .accessibilityLabel("DLV.options")
                        }
                    }
                    ToolbarItemGroup(placement: .topBarTrailing) {
                        Button {
                            toggleAutoRefresh()
                        } label: {
                            Image(systemName: "10.arrow.trianglehead.clockwise")
                                .symbolRenderingMode(.hierarchical)
                                .accessibilityLabel(autoRefreshOn ? "DLV.disabledautorefresh" : "DLV.autorefresh")
                        }
                        .tint(autoRefreshOn ? .green : .primary)

                        Button { Task { await refresh() } } label: {
                            Image(systemName: "arrow.clockwise.circle")
                        }

                        Button {
                            editingDraft = .empty
                            showingEditor = true
                        } label: { Label("DLV.add", systemImage: "plus.circle") }
                    }
                }
                .task { await refresh() }
                .refreshable { await refresh() }
                .onReceive(NotificationCenter.default.publisher(for: .deviceLogUpdated)) { _ in
                    updateDevicesWithLastNotifications()
                }
                .navigationDestination(for: String.self) { devId in
                    if let dev = storedDevices.first(where: { $0.id == devId }) {
                        DeviceDetailView(device: dev)
                    }
                }
        }
        .onDisappear { stopAutoRefresh() }
        .onChange(of: scenePhase) { _, phase in
            isAppActive = (phase == .active)
            if isAppActive {
                if autoRefreshOn && autoRefreshTask == nil {
                    Task { await refresh() }
                    startAutoRefresh()
                }
            } else {
                stopAutoRefresh()
            }
        }

        // Éditeur (enrôlement) — NavigationStack géré dans le sheet lui-même
        .sheet(isPresented: $showingEditor) {
            DeviceEditorSheet(
                draft: $editingDraft,
                onSaveEdit: saveEditDraft,
                onDeviceCreated: handleCreatedDevice,
                isSaving: isSaving
            )
            .environmentObject(ble)
            .environmentObject(session)
        }

        // Alertes génériques
        .alert("DLV.error", isPresented: Binding(get: { alertMessage != nil }, set: { _ in alertMessage = nil })) {
            Button("DLV.ok", role: .cancel) { alertMessage = nil }
        } message: { Text(alertMessage ?? "") }

        // Confirmation suppression d'un périphérique
        .overlay {
            if let d = confirmDelete {
                ConfirmDeleteDialog(
                    title: NSLocalizedString("DLV.deletethisdevice", comment: ""),
                    message: "\(d.name) \(NSLocalizedString("DDV.willbedeleted", comment: ""))",
                    onConfirm: { deleteDevice(d); confirmDelete = nil },
                    onCancel:  { confirmDelete = nil }
                )
            }
        }

        // Overlay spinner pendant la suppression
        .overlay {
            if isDeleting {
                ZStack {
                    Color.black.opacity(0.6).ignoresSafeArea()
                    VStack(spacing: 16) {
                        ProgressView()
                            .scaleEffect(1.5)
                            .tint(.white)
                        Text("DLV.deletingDevice")
                            .foregroundStyle(.white)
                    }
                    .padding(32)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
                }
            }
        }

        // Feuille suppression de compte
        .sheet(isPresented: $showDeleteAccountSheet) {
            NavigationView {
                Form {
                    Section {
                        Text("DLV.permanentdelete")
                            .foregroundStyle(.red)
                    }
                    Section("DLV.confirmaccount") {
                        TextField("DLV.youremail", text: $deleteEmail)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                    if let msg = deleteAccountError {
                        Text(msg).foregroundStyle(.red)
                    }
                    Section {
                        Button(role: .destructive) {
                            Task { await deleteMyAccount() }
                        } label: {
                            HStack {
                                if isDeletingAccount { ProgressView() }
                                Text("DLV.confirmdefdelete")
                            }
                        }
                        .disabled(!canSubmitDeletion || isDeletingAccount)
                    }
                }
                .navigationTitle("DLV.deletemyaccount")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("DDV.cancel") { showDeleteAccountSheet = false }
                    }
                }
            }
        }
    }

    // MARK: - Liste
    @ViewBuilder
    private var contentView: some View {
        List {
            Section("DLV.alreadyrecord") {
                if isLoading && storedDevices.isEmpty {
                    HStack { Spacer(); ProgressView("DLV.loading"); Spacer() }
                } else if let err = errorText, !err.isEmpty, storedDevices.isEmpty {
                    ContentUnavailableView("DLV.error", systemImage: "exclamationmark.triangle", description: Text(err))
                } else if storedDevices.isEmpty {
                    ContentUnavailableView("DLV.nodevice", systemImage: "sensor")
                } else {
                    ForEach(storedDevices) { dev in
                        NavigationLink(value: dev.id) { DeviceRowView(device: dev) }
                            .swipeActions(edge: .trailing) {
                                Button {
                                    editingDraft = DeviceDraft(
                                        id: dev.id,
                                        esp_uid: dev.espUID,
                                        name: dev.name,
                                        topic_prefix: dev.topicPrefix,
                                        mqtt_password: nil
                                    )
                                    showingEditor = true
                                } label: { Label("DLV.modify", systemImage: "pencil") }
                                .tint(.blue)

                                Button(role: .destructive) {
                                    confirmDelete = dev
                                } label: { Label("DLV.delele", systemImage: "trash") }
                            }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Confort
    private var ctx: ModelContext { ctx_placeholder }
    private var storedDevices: [ESPDevice] { storedDevices_placeholder }

    // MARK: - Suppression du compte
    private var canSubmitDeletion: Bool {
        let mailEntered = deleteEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let mailSession = (session.email ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return !mailEntered.isEmpty && mailEntered == mailSession
    }

    private func deleteMyAccount() async {
        deleteAccountError = nil
        guard let token = session.token else {
            deleteAccountError = "Session expirée."
            return
        }
        let mailEntered = deleteEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let mailSession = (session.email ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !mailEntered.isEmpty, mailEntered == mailSession else {
            deleteAccountError = "Veuillez ressaisir l'e-mail de votre compte."
            return
        }

        isDeletingAccount = true
        defer { isDeletingAccount = false }

        do {
            let url = ServerConfig.shared.baseURL.appendingPathComponent("me")
            var req = URLRequest(url: url)
            req.httpMethod = "DELETE"
            req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: ["confirm": "DELETE"])

            let (_, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse else { throw URLError(.unknown) }

            if (200...299).contains(http.statusCode) || http.statusCode == 204 {
                await MainActor.run {
                    showDeleteAccountSheet = false
                    session.signOut()
                }
            } else {
                let msg: String
                switch http.statusCode {
                case 401: msg = "Session expirée. Reconnectez-vous."
                case 403: msg = "Action non autorisée."
                case 404: msg = "Service de suppression indisponible (404)."
                default:  msg = "Erreur serveur (\(http.statusCode))."
                }
                await MainActor.run { deleteAccountError = msg }
            }
        } catch {
            await MainActor.run {
                deleteAccountError = "Impossible de supprimer le compte pour le moment."
            }
        }
    }

    // MARK: - Refresh
    private func refresh() async {
        guard let token = session.token else { return }
        await MainActor.run { isLoading = true; errorText = nil }
        defer { Task { await MainActor.run { isLoading = false } } }

        do {
            let dtos = try await APIClient.shared.fetchDevices(token: token)
            try await MainActor.run {
                upsertDevices(from: dtos)
                removeDevicesNotInAPI(dtos)
                try ctx.save()
            }
            await fetchLastAlertsForAllDevices()
        } catch {
            if case APIError.http(401) = error {
                await MainActor.run { session.signOut() }
                return
            }
            await MainActor.run {
                self.errorText = (error as? LocalizedError)?.errorDescription
                    ?? "Impossible de récupérer les périphériques."
            }
        }
    }

    private func upsertDevices(from dtos: [APIClient.DeviceDTO]) {
        for dto in dtos {
            let lastSeen = dto.last_seen.flatMap { ISO8601DateFormatter.withFractional.date(from: $0) }
            if let existing = storedDevices.first(where: { $0.id == dto.id }) {
                existing.name       = dto.name
                existing.espUID     = dto.esp_uid
                existing.topicPrefix = dto.topic_prefix
                existing.lastSeen   = lastSeen
                existing.lastDb     = dto.last_db
                // Remplace l'historique par les vraies trames MQTT retournées par l'API
                existing.setSoundHistory(dto.sound_history)
                applyLastNotificationLocalOnly(to: existing)
            } else {
                let dev = ESPDevice(
                    id: dto.id,
                    espUID: dto.esp_uid,
                    name: dto.name,
                    topicPrefix: dto.topic_prefix,
                    lastSeen: lastSeen,
                    lastDb: dto.last_db
                )
                dev.setSoundHistory(dto.sound_history)
                applyLastNotificationLocalOnly(to: dev)
                ctx.insert(dev)
            }
        }
    }

    private func removeDevicesNotInAPI(_ dtos: [APIClient.DeviceDTO]) {
        let apiIds = Set(dtos.map { $0.id })
        for local in storedDevices where !apiIds.contains(local.id) {
            ctx.delete(local)
        }
    }

    private func fetchLastAlertsForAllDevices() async {
        guard let token = session.token else { return }
        let devices = storedDevices

        await withTaskGroup(of: Void.self) { group in
            for dev in devices {
                group.addTask {
                    do {
                        if let last = try await APIClient.shared.fetchLastAlert(token: token, espId: dev.id) {
                            let sent = last.sent_at.flatMap { ISO8601DateFormatter.withFractional.date(from: $0) }
                            await MainActor.run {
                                dev.lastNotificationText = (last.payload?.body?.isEmpty == false) ? last.payload?.body : "Notification"
                                dev.lastNotificationAt = sent
                            }
                        } else {
                            await MainActor.run {
                                dev.lastNotificationText = nil
                                dev.lastNotificationAt = nil
                            }
                        }
                    } catch { }
                }
            }
            await group.waitForAll()
        }
        try? ctx.save()
    }

    // MARK: - CRUD périphériques

    /// Enregistre les modifications d'un device existant (mode édition uniquement).
    private func saveEditDraft() {
        guard let token = session.token, let id = editingDraft.id else { return }
        isSaving = true
        Task {
            defer { Task { await MainActor.run { isSaving = false } } }
            do {
                let updated = try await APIClient.shared.updateESPDevice(
                    token: token,
                    id: id,
                    name: editingDraft.name,
                    topic_prefix: editingDraft.topic_prefix
                )
                try await MainActor.run {
                    if let existing = storedDevices.first(where: { $0.id == updated.id }) {
                        existing.name        = updated.name
                        existing.espUID      = updated.esp_uid
                        existing.topicPrefix = updated.topic_prefix
                        existing.lastSeen    = updated.last_seen.flatMap { ISO8601DateFormatter.withFractional.date(from: $0) }
                        existing.lastDb      = updated.last_db
                    }
                    try ctx.save()
                    showingEditor = false
                }
            } catch {
                await MainActor.run { alertMessage = "Échec de la mise à jour." }
            }
        }
    }

    /// Appelée par DeviceEditorSheet après création réussie via API.
    private func handleCreatedDevice(_ dto: APIClient.DeviceDTO) {
        let lastSeen = dto.last_seen.flatMap { ISO8601DateFormatter.withFractional.date(from: $0) }
        let dev = ESPDevice(
            id: dto.id,
            espUID: dto.esp_uid,
            name: dto.name,
            topicPrefix: dto.topic_prefix,
            lastSeen: lastSeen,
            lastDb: dto.last_db
        )
        dev.setSoundHistory(dto.sound_history)
        ctx.insert(dev)
        try? ctx.save()
        showingEditor = false
        Task { await fetchLastAlertsForAllDevices() }
    }

    private func deleteDevice(_ dev: ESPDevice) {
        guard let token = session.token else { return }
        isDeleting = true
        Task {
            do {
                try await APIClient.shared.deleteESPDevice(token: token, id: dev.id)
                try await MainActor.run {
                    ctx.delete(dev)
                    try ctx.save()
                }
            } catch {
                await MainActor.run { alertMessage = "Suppression impossible." }
            }
            await MainActor.run { isDeleting = false }
        }
    }

    // MARK: - Notifications locales
    private func updateDevicesWithLastNotifications() {
        for dev in storedDevices { applyLastNotificationLocalOnly(to: dev) }
        try? ctx.save()
    }

    private func applyLastNotificationLocalOnly(to dev: ESPDevice) {
        if let local = LogStore.shared.last(for: dev.id)
            ?? LogStore.shared.last(for: dev.espUID)
            ?? LogStore.shared.last(for: dev.topicPrefix) {
            dev.lastNotificationText = local.message
            dev.lastNotificationAt = local.date
        }
    }

    // MARK: - Auto-refresh
    private func toggleAutoRefresh() {
        autoRefreshOn.toggle()
        if autoRefreshOn {
            Task { await refresh() }
            startAutoRefresh()
        } else {
            stopAutoRefresh()
        }
    }

    private func startAutoRefresh() {
        autoRefreshTask?.cancel()
        autoRefreshTask = Task { [autoRefreshIntervalNS] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: autoRefreshIntervalNS)
                if Task.isCancelled { break }
                let active = await MainActor.run { isAppActive }
                if active { await refresh() }
            }
        }
    }

    private func stopAutoRefresh() {
        autoRefreshTask?.cancel()
        autoRefreshTask = nil
    }
}

// MARK: - Draft (éditeur)
struct DeviceDraft: Equatable {
    var id: String?
    var esp_uid: String
    var name: String
    var topic_prefix: String   // technique — envoyé à l'API, masqué dans l'UI
    var mqtt_password: String?

    var isValid: Bool {
        !esp_uid.trimmingCharacters(in: .whitespaces).isEmpty &&
        !name.trimmingCharacters(in: .whitespaces).isEmpty
    }

    static let empty = DeviceDraft(
        id: nil,
        esp_uid: "",
        name: "",
        topic_prefix: "",
        mqtt_password: nil
    )
}

// MARK: - Générateur mot de passe MQTT
func generateRandomMQTTPass(length: Int = 32) -> String {
    let chars = Array("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}.,:?")
    var result = ""
    result.reserveCapacity(length)
    for _ in 0..<length {
        var byte: UInt8 = 0
        let status = SecRandomCopyBytes(kSecRandomDefault, 1, &byte)
        if status == errSecSuccess {
            result.append(chars[Int(byte) % chars.count])
        } else {
            if let random = chars.randomElement() { result.append(random) }
        }
    }
    return result
}


// MARK: - DeviceEditorSheet
struct DeviceEditorSheet: View {
    @Binding var draft: DeviceDraft
    let onSaveEdit: () -> Void                              // mode édition
    let onDeviceCreated: (APIClient.DeviceDTO) -> Void      // mode création
    let isSaving: Bool

    @EnvironmentObject private var ble: BLEManager
    @EnvironmentObject private var session: SessionStore
    @Environment(\.dismiss) private var dismiss

    @State private var ssid: String = ""
    @State private var pass: String = ""
    @State private var isCreating = false
    @State private var stepMessage: String?
    @State private var creationError: String?

    private var isCreationMode: Bool { draft.id == nil }

    /// Contrôles de validation pour le bouton "Créer le capteur".
    private var canCreate: Bool {
        !draft.esp_uid.isEmpty &&
        !draft.name.trimmingCharacters(in: .whitespaces).isEmpty &&
        !ssid.isEmpty &&
        ble.selected != nil &&
        !isCreating && !isSaving
    }

    /// Contrôles pour le bouton "Enregistrer les changements" (mode édition).
    private var canSaveEdit: Bool {
        !draft.name.trimmingCharacters(in: .whitespaces).isEmpty && !isSaving
    }

    var body: some View {
        NavigationStack {
            Form {
                // 1. Sélection du capteur BLE (création uniquement)
                if isCreationMode {
                    Section("DLV.selectdevice") {
                        Picker("DLV.device", selection: selectedBinding) {
                            Text("DLV.selectonedevice").tag(nil as UUID?)
                            ForEach(ble.devices) { dev in
                                Text(dev.name).tag(dev.id as UUID?)
                            }
                        }
                        HStack(spacing: 8) {
                            if ble.isScanning {
                                ProgressView().controlSize(.small)
                                Text("DLV.scaninprogress").foregroundStyle(.secondary)
                            } else {
                                Text("\(ble.devices.count) \(String(localized: .dlvDetected))\(ble.devices.count > 1 ? "s" : "")")
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .font(.footnote)

                        // UID
                        LabeledContent("UID") {
                            Text(draft.esp_uid.isEmpty ? "—" : draft.esp_uid)
                                .monospaced()
                                .foregroundStyle(draft.esp_uid.isEmpty ? .secondary : .primary)
                        }

                        if let err = ble.lastBLEError {
                            Text(err).foregroundStyle(.red)
                        }
                    }
                }

                // 2. WiFi (création uniquement — pas besoin pour l'édition d'un nom)
                if isCreationMode {
                    Section("\(String(localized: .dlvDevicewifi))") {
                        TextField("\(String(localized: .dlvSsid))", text: $ssid)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        SecureField(.loginPass, text: $pass)
                        wifiStatusPill
                            .padding(.top, 2)
                    }
                }

                // 3. Enrôlement / édition
                Section(.dlvRegisterdevice) {
                    TextField("DLV.devicename", text: $draft.name)

                    // Progression de la création (async flow)
                    if let msg = stepMessage {
                        HStack(spacing: 8) {
                            ProgressView().controlSize(.small)
                            Text(msg).foregroundStyle(.secondary)
                        }
                        .font(.footnote)
                    }

                    // Message d'erreur de création
                    if let err = creationError {
                        Text(err)
                            .foregroundStyle(.red)
                            .font(.footnote)
                    }

                    // Bouton principal
                    let actionDisabled = isCreationMode ? !canCreate : !canSaveEdit
                    Button(action: {
                        if isCreationMode {
                            Task { await createSensor() }
                        } else {
                            onSaveEdit()
                        }
                    }) {
                        if isCreating || isSaving {
                            ProgressView().frame(maxWidth: .infinity, alignment: .center)
                        } else {
                            Text(isCreationMode ? "DLV.createdevice" : "DLV.recordchanges")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(actionDisabled)
                    .opacity(actionDisabled ? 0.5 : 1)
                }
            }
            .navigationTitle(isCreationMode ? "DLV.newdevice" : "DLV.editdevice")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                // Bouton X à droite — remplace "Annuler" texte
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .symbolRenderingMode(.hierarchical)
                            .foregroundStyle(.secondary)
                            .imageScale(.large)
                    }
                    .disabled(isCreating)
                    .accessibilityLabel(String(localized: "DDV.cancel"))
                }
            }
        }
        // Empêche le swipe-to-dismiss pendant la création pour éviter les états incohérents
        .interactiveDismissDisabled(isCreating)
        .onAppear {
            if isCreationMode {
                ble.selected = nil
                draft.esp_uid = ""
                draft.topic_prefix = ""
                if ble.isPoweredOn, !ble.isScanning { ble.startScan() }
                if let saved = WiFiCredentialsStore.load() {
                    ssid = saved.ssid
                    pass = saved.password
                }
            }
        }
        .onDisappear {
            if isCreationMode {
                if ble.isScanning { ble.stopScan() }
                ble.disconnectAll()
            }
        }
        .onChange(of: ble.selected) { _, newSel in
            guard let s = newSel else {
                draft.esp_uid = ""
                draft.topic_prefix = ""
                return
            }
            if let uid = s.espUID     { draft.esp_uid      = uid }
            if let tp  = s.topicPrefix { draft.topic_prefix = tp  }
        }
        .onChange(of: ble.selected?.espUID)      { _, uid in draft.esp_uid      = uid ?? "" }
        .onChange(of: ble.selected?.topicPrefix) { _, tp  in draft.topic_prefix = tp  ?? "" }
    }

    // MARK: - Pill statut WiFi
    private var wifiStatusPill: some View {
        HStack(spacing: 6) {
            Circle()
                .frame(width: 10, height: 10)
                .foregroundStyle(ble.wifiConnected ? .green : .red)
            Text(ble.wifiConnecting
                 ? "DLV.connection"
                 : (ble.wifiConnected ? "DLV.connected" : "DLV.offline"))
                .foregroundStyle(ble.wifiConnected ? .green : .secondary)
        }
        .accessibilityLabel("DLV.wifistate")
        .font(.footnote)
    }

    // MARK: - Binding sélection BLE
    private var selectedBinding: Binding<UUID?> {
        Binding<UUID?>(
            get: { ble.selected?.id },
            set: { newID in
                ble.disconnectAll()
                guard let id = newID,
                      let dev = ble.devices.first(where: { $0.id == id }) else {
                    ble.selected = nil
                    return
                }
                ble.selected = dev
                ble.connect(dev)
            }
        )
    }

    // MARK: - Flow création unifié (WiFi → API → MQTT)
    private func createSensor() async {
        creationError = nil

        // Génération du mot de passe MQTT si absent
        if draft.mqtt_password == nil || draft.mqtt_password?.isEmpty == true {
            draft.mqtt_password = generateRandomMQTTPass()
        }
        let mqttPass = draft.mqtt_password!

        // Sauvegarde locale des identifiants WiFi
        if !ssid.isEmpty {
            WiFiCredentialsStore.save(ssid: ssid, password: pass)
        }

        await MainActor.run {
            isCreating = true
            stepMessage = "Configuration du WiFi…"
        }

        // Étape 1 — Push WiFi via BLE
        await MainActor.run { ble.pushWiFi(ssid: ssid, password: pass) }

        // Étape 2 — Attente connexion WiFi (timeout 15 s)
        let wifiOK = await waitForWiFiConnected(timeout: 15.0)
        guard wifiOK else {
            await MainActor.run {
                isCreating  = false
                stepMessage = nil
                creationError = "Connexion WiFi échouée. Vérifiez le SSID et le mot de passe."
            }
            return
        }

        // Étape 3 — Création via API
        await MainActor.run { stepMessage = "Enregistrement du capteur…" }
        guard let token = await MainActor.run(body: { session.token }) else {
            await MainActor.run {
                isCreating  = false
                stepMessage = nil
                creationError = "Session expirée. Reconnectez-vous."
            }
            return
        }

        do {
            let created = try await APIClient.shared.createESPDevice(
                token: token,
                esp_uid: draft.esp_uid,
                name: draft.name,
                topic_prefix: draft.topic_prefix,   // masqué en UI, conservé dans le payload
                mqtt_password: mqttPass
            )

            // Étape 4 — Push credentials MQTT via BLE
            await MainActor.run { stepMessage = "Configuration MQTT…" }
            let mqttHost = ServerConfig.shared.isLocal ? "mqtt.holiceo.com" : "mqtt.xamiot.com"
            await MainActor.run {
                ble.pushMqttCredentials(
                    username: draft.esp_uid,
                    password: mqttPass,
                    host: mqttHost,
                    port: "8883"
                )
            }
            try? await Task.sleep(nanoseconds: 1_500_000_000)

            // Étape 5 — Notifier le parent et fermer
            await MainActor.run {
                isCreating  = false
                stepMessage = nil
                onDeviceCreated(created)
                // handleCreatedDevice() appelle dismiss via showingEditor = false dans le parent
            }

        } catch {
            await MainActor.run {
                isCreating  = false
                stepMessage = nil
                creationError = "Échec de l'enregistrement. Réessayez."
            }
        }
    }

    /// Polling de ble.wifiConnected toutes les 250 ms pendant `timeout` secondes.
    private func waitForWiFiConnected(timeout: TimeInterval) async -> Bool {
        let start = Date()
        while !Task.isCancelled {
            let connected = await MainActor.run { ble.wifiConnected }
            if connected { return true }
            if Date().timeIntervalSince(start) >= timeout { return false }
            try? await Task.sleep(nanoseconds: 250_000_000)
        }
        return false
    }
}
