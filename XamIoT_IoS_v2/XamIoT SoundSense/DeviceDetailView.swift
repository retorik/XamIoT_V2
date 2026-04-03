import SwiftUI
import SwiftData

struct DeviceDetailView: View {
    let device: ESPDevice
    @EnvironmentObject private var session: SessionStore

    // Données
    @State private var rules: [APIRule] = []
    @State private var alerts: [APIAlert] = []
    @State private var deviceMeta: APIClient.DeviceMetaDTO?

    // États
    @State private var isLoadingRules = false
    @State private var isLoadingAlerts = false
    @State private var rulesErrorText: String?
    @State private var alertsErrorText: String?

    // Édition règles
    @State private var showingRuleEditor = false
    @State private var editingDraft = RuleDraft.empty
    @State private var isSavingRule = false
    @State private var confirmDeleteRule: APIRule?
    @State private var alertMessage: String?

    var body: some View {
        mainList
            .alert("DLV.error", isPresented: Binding(get: { alertMessage != nil }, set: { _ in alertMessage = nil })) {
                Button("DLV.ok", role: .cancel) { alertMessage = nil }
            } message: {
                Text(alertMessage ?? "")
            }
            .overlay {
                if let r = confirmDeleteRule {
                    ConfirmDeleteDialog(
                        title: NSLocalizedString("DDV.deletethisrule", comment: ""),
                        message: "\(ruleDisplayName(r)) \(NSLocalizedString("DDV.willbedeleted", comment: ""))",
                        onConfirm: { deleteRule(r); confirmDeleteRule = nil },
                        onCancel:  { confirmDeleteRule = nil }
                    )
                }
            }
    }

    private var mainList: some View {
        List {
            deviceSection
            rulesSection
            alertsSection
        }
        .navigationTitle(device.name)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button {
                    Task {
                        await loadRules()
                        await loadAlerts()
                        await refreshHeaderLastAlert()
                    }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                Button {
                    // Pré-sélectionner le premier template disponible (jamais de champ en dur)
                    let firstTpl = deviceMeta?.rule_templates.first
                    editingDraft = RuleDraft(
                        id: nil,
                        field: firstTpl?.field ?? RuleDraft.empty.field,
                        op: firstTpl?.field_operators.first ?? RuleDraft.empty.op,
                        templateId: firstTpl?.id
                    )
                    showingRuleEditor = true
                } label: {
                    Label("DDV.addrule", systemImage: "plus.circle")
                }
            }
        }
        .task {
            await loadMeta()
            await loadRules()
            await loadAlerts()
            await refreshHeaderLastAlert()
        }
        .refreshable {
            await loadMeta()
            await loadRules()
            await loadAlerts()
            await refreshHeaderLastAlert()
        }
        .sheet(isPresented: $showingRuleEditor) {
            NavigationStack {
                RuleEditorSheet(draft: $editingDraft, meta: deviceMeta, onSave: saveDraft, isSaving: isSavingRule)
                    .presentationDetents([.medium, .large])
                    .navigationTitle(editingDraft.id == nil ? "DDV.newrule" : "DDV.changerule")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("DDV.cancel") { showingRuleEditor = false }
                        }
                        ToolbarItem(placement: .confirmationAction) {
                            Button(action: saveDraft) {
                                if isSavingRule { ProgressView() } else { Text("DLV.save") }
                            }
                            .disabled(isSavingRule)
                        }
                    }
            }
        }
    }

    // MARK: - Sections

    @ViewBuilder private var deviceSection: some View {
        Section("DLV.device") {
            LabeledContent("signup.name", value: device.name)
            LabeledContent("UID", value: device.espUID)
            if let last = device.lastSeen {
                LabeledContent("DDV.seen", value: last.formatted(date: .abbreviated, time: .shortened))
            }
            if let lastdb = device.lastDb {
                LabeledContent("DDV.level", value: String(format: "%.0f xB", lastdb))
            }
            if device.lastNotificationText != nil || device.lastNotificationAt != nil {
                LabeledContent("DDV.lastnotification", value: lastNotifSummary(device))
            }
        }
    }

    @ViewBuilder private var rulesSection: some View {
        Section("DDV.activerules") {
            if isLoadingRules { ProgressView() }
            if let err = rulesErrorText { Text(err).foregroundStyle(.red) }
            ForEach(rules) { r in
                RuleRow(
                    rule: r,
                    displayName: ruleDisplayName(r),
                    onToggle: { toggleEnabled(rule: r, to: $0) },
                    onEdit: {
                        editingDraft = RuleDraft(
                            id: r.id,
                            field: r.field,
                            op: r.op,
                            thresholdNum: Double(r.thresholdText),
                            thresholdStr: Double(r.thresholdText) == nil ? r.thresholdText : nil,
                            cooldownSec: r.cooldownSec,
                            cooldownMinSec: r.cooldownMinSec,
                            enabled: r.enabled,
                            userLabel: r.userLabel ?? "",
                            templateId: r.templateId
                        )
                        showingRuleEditor = true
                    },
                    onDelete: { confirmDeleteRule = r }
                )
            }
        }
    }

    @ViewBuilder private var alertsSection: some View {
        Section("DDV.alarmlogs") {
            if isLoadingAlerts { ProgressView() }
            if let err = alertsErrorText { Text(err).foregroundStyle(.red) }
            ForEach(alerts) { a in
                AlertRow(alert: a, linkedRule: a.ruleId.flatMap { rid in rules.first(where: { $0.id == rid }) })
            }
        }
    }

    // MARK: - Modèles
    struct APIRule: Identifiable {
        let id: String
        let field: String
        let op: String
        let thresholdText: String
        let cooldownSec: Int?
        let cooldownMinSec: Int?
        let enabled: Bool
        let createdAt: Date?
        let userLabel: String?
        let templateName: String?
        let templateId: String?
    }

    struct APIAlert: Identifiable {
        let id: String
        let ruleId: String?
        let deviceId: String?
        let sentAt: Date?
        let channel: String?
        let status: String?
        let body: String?
        let field: String?
        let value: Double?
        let error: String?
    }

    struct RuleDraft: Identifiable, Equatable {
        var id: String?
        var field: String = "soundPct"
        var op: String = ">"
        var thresholdNum: Double?
        var thresholdStr: String?
        var cooldownSec: Int?
        var cooldownMinSec: Int?
        var enabled: Bool
        var userLabel: String = ""
        var templateId: String? = nil

        init(id: String? = nil,
             field: String = "soundPct",
             op: String = ">",
             thresholdNum: Double? = 50,
             thresholdStr: String? = nil,
             cooldownSec: Int? = 60,
             cooldownMinSec: Int? = nil,
             enabled: Bool = true,
             userLabel: String = "",
             templateId: String? = nil)
        {
            self.id = id
            self.field = field
            self.op = op
            self.thresholdNum = thresholdNum ?? 50
            self.thresholdStr = thresholdStr
            self.cooldownMinSec = cooldownMinSec
            let effectiveMin = cooldownMinSec ?? 60
            self.cooldownSec = max(effectiveMin, cooldownSec ?? effectiveMin)
            self.enabled = enabled
            self.userLabel = userLabel
            self.templateId = templateId
        }

        static let empty = RuleDraft(
            id: nil,
            field: "soundPct",
            op: ">",
            thresholdNum: 50,
            thresholdStr: nil,
            cooldownSec: 60,
            cooldownMinSec: nil,
            enabled: true,
            userLabel: "",
            templateId: nil
        )
    }

    // MARK: - Loaders
    private func loadMeta() async {
        guard let token = session.token else { return }
        do {
            let meta = try await APIClient.shared.fetchDeviceMeta(token: token, espId: device.id)
            await MainActor.run { self.deviceMeta = meta }
        } catch {
            // On ignore silencieusement — fallback sur comportement sans template
        }
    }

    private func loadRules() async {
        guard let token = session.token else { return }
        await MainActor.run { isLoadingRules = true; rulesErrorText = nil }
        defer { Task { await MainActor.run { isLoadingRules = false } } }
        do {
            let dtos = try await APIClient.shared.fetchRules(token: token, espId: device.id)
            let mapped: [APIRule] = dtos.map { dto in
                let threshold = dto.threshold_num.map { String(format: "%.0f", $0) } ?? dto.threshold_str ?? "—"
                let createdAt: Date? = dto.created_at.flatMap { ISO8601Parsers.parse($0) }
                return APIRule(
                    id: dto.id,
                    field: dto.field,
                    op: dto.op,
                    thresholdText: threshold,
                    cooldownSec: dto.cooldown_sec,
                    cooldownMinSec: dto.cooldown_min_sec,
                    enabled: dto.enabled,
                    createdAt: createdAt,
                    userLabel: dto.user_label,
                    templateName: dto.template_name,
                    templateId: dto.template_id
                )
            }
            await MainActor.run { self.rules = mapped }
        } catch {
            await MainActor.run {
                self.rulesErrorText = (error as? LocalizedError)?.errorDescription
                    ?? "Impossible de récupérer les règles."
            }
        }
    }

    private func loadAlerts() async {
        guard let token = session.token else { return }
        await MainActor.run { isLoadingAlerts = true; alertsErrorText = nil }
        defer { Task { await MainActor.run { isLoadingAlerts = false } } }
        do {
            let dtos = try await APIClient.shared.fetchAlerts(token: token, espId: device.id)
            let mapped: [APIAlert] = dtos.map { dto in
                let sentAt: Date? = dto.sent_at.flatMap { ISO8601Parsers.parse($0) }
                return APIAlert(
                    id: dto.id,
                    ruleId: dto.rule_id,
                    deviceId: dto.device_id,
                    sentAt: sentAt,
                    channel: dto.channel,
                    status: dto.status,
                    body: dto.payload?.body,
                    field: dto.payload?.field,
                    value: dto.payload?.value,
                    error: dto.error
                )
            }
            await MainActor.run { self.alerts = mapped }
        } catch {
            await MainActor.run {
                self.alertsErrorText = (error as? LocalizedError)?.errorDescription
                    ?? "Impossible de récupérer l'historique d'alertes."
            }
        }
    }

    // MARK: - Header last alert (API pour CE device)
    private func refreshHeaderLastAlert() async {
        guard let token = session.token else { return }
        do {
            if let last = try await APIClient.shared.fetchLastAlert(token: token, espId: device.id) {
                let sent = last.sent_at.flatMap { ISO8601Parsers.parse($0) }
                await MainActor.run {
                    device.lastNotificationText = (last.payload?.body?.isEmpty == false) ? last.payload?.body : "Notification"
                    device.lastNotificationAt = sent
                }
            }
        } catch {
            // On ignore l'erreur pour ne pas polluer l'écran
        }
    }

    // MARK: - Actions
    private func toggleEnabled(rule: APIRule, to newValue: Bool) {
        guard let token = session.token else { return }
        if let idx = rules.firstIndex(where: { $0.id == rule.id }) {
            let old = rules[idx]
            rules[idx] = APIRule(id: old.id, field: old.field, op: old.op, thresholdText: old.thresholdText, cooldownSec: old.cooldownSec, cooldownMinSec: old.cooldownMinSec, enabled: newValue, createdAt: old.createdAt, userLabel: old.userLabel, templateName: old.templateName, templateId: old.templateId)
        }
        Task {
            do {
                _ = try await APIClient.shared.updateRule(
                    token: token, ruleId: rule.id,
                    field: nil, op: nil,
                    threshold_num: Double(rule.thresholdText),
                    threshold_str: Double(rule.thresholdText) == nil ? rule.thresholdText : nil,
                    cooldown_sec: nil, enabled: newValue
                )
            } catch {
                if let idx = rules.firstIndex(where: { $0.id == rule.id }) { rules[idx] = rule }
                await MainActor.run { alertMessage = "Impossible de mettre à jour l'état de la règle." }
            }
        }
    }

    private func saveDraft() {
        guard let token = session.token else { return }
        isSavingRule = true
        Task {
            defer { Task { await MainActor.run { isSavingRule = false } } }
            do {
                // Cooldown min : template (création) ou cooldownMinSec du draft (édition) ou 60s par défaut
                let selectedTemplate = deviceMeta?.rule_templates.first(where: { $0.id == editingDraft.templateId })
                let cooldownMin = selectedTemplate?.cooldown_min_sec ?? editingDraft.cooldownMinSec ?? 60
                editingDraft.cooldownSec = max(cooldownMin, editingDraft.cooldownSec ?? cooldownMin)
                editingDraft.thresholdNum = editingDraft.thresholdNum ?? 50

                let labelToSend: String? = editingDraft.userLabel.isEmpty ? nil : editingDraft.userLabel

                if let id = editingDraft.id {
                    _ = try await APIClient.shared.updateRule(
                        token: token, ruleId: id,
                        field: editingDraft.field, op: editingDraft.op,
                        threshold_num: editingDraft.thresholdNum, threshold_str: nil,
                        cooldown_sec: editingDraft.cooldownSec, enabled: editingDraft.enabled,
                        user_label: labelToSend,
                        template_id: editingDraft.templateId
                    )
                } else {
                    _ = try await APIClient.shared.createRule(
                        token: token, esp_id: device.id,
                        field: editingDraft.field, op: editingDraft.op,
                        threshold_num: editingDraft.thresholdNum, threshold_str: nil,
                        cooldown_sec: editingDraft.cooldownSec, enabled: editingDraft.enabled,
                        user_label: labelToSend,
                        template_id: editingDraft.templateId
                    )
                }
                await loadRules()
                await MainActor.run { showingRuleEditor = false }
            } catch {
                await MainActor.run { alertMessage = "Échec de l'enregistrement de la règle." }
            }
        }
    }

    private func deleteRule(_ r: APIRule) {
        guard let token = session.token else { return }
        Task {
            do {
                try await APIClient.shared.deleteRule(token: token, ruleId: r.id)
                await loadRules()
            } catch {
                await MainActor.run { alertMessage = "Suppression impossible." }
            }
        }
    }

    // MARK: - Helpers
    private func ruleDisplayName(_ r: APIRule) -> String {
        if let label = r.userLabel, !label.isEmpty { return label }
        return "\(r.field) \(r.op) \(r.thresholdText)"
    }

    private func lastNotifSummary(_ dev: ESPDevice) -> String {
        let msg = dev.lastNotificationText ?? "—"
        if let at = dev.lastNotificationAt {
            return "\(msg) — \(at.formatted(date: .abbreviated, time: .shortened))"
        } else {
            return msg
        }
    }
}

// MARK: - Rule row
private struct RuleRow: View {
    let rule: DeviceDetailView.APIRule
    let displayName: String
    let onToggle: (Bool) -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(displayName).font(.headline)
            HStack {
                if let cd = rule.cooldownSec { Text("Cooldown: \(cd)s") }
                if let created = rule.createdAt { Text("creee: \(created, style: .date)") }
                Spacer()
                Toggle(isOn: Binding(get: { rule.enabled }, set: onToggle)) {
                    Text(rule.enabled ? "DDV.enabled" : "DDV.disabled")
                }
                .labelsHidden()
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 6)
        .swipeActions(edge: .trailing) {
            Button(action: onEdit) { Label("DLV.modify", systemImage: "pencil") }
                .tint(.blue)
            Button(role: .destructive, action: onDelete) { Label("DLV.delele", systemImage: "trash") }
        }
    }
}

// MARK: - Alert row
private struct AlertRow: View {
    let alert: DeviceDetailView.APIAlert
    let linkedRule: DeviceDetailView.APIRule?

    private var title: String {
        if let r = linkedRule { return "\(r.field) \(r.op) \(r.thresholdText)" }
        return alert.channel ?? "Alerte"
    }

    private var statusOk: Bool {
        let s = (alert.status ?? "").lowercased()
        return s == "sent" || s == "ok"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.headline)
            HStack(spacing: 12) {
                if let sent = alert.sentAt {
                    Text(sent, style: .date)
                    Text(sent, style: .time)
                }
                if let st = alert.status { Text(st) }
                Spacer()
                Image(systemName: statusOk ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                    .foregroundStyle(statusOk ? .green : .orange)
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
            if let b = alert.body, !b.isEmpty {
                Text(b).font(.footnote).foregroundStyle(.secondary).lineLimit(3)
            }
            if let e = alert.error, !e.isEmpty {
                Text("Erreur : \(e)").font(.footnote).foregroundStyle(.red)
            }
        }
        .padding(.vertical, 6)
    }
}

// MARK: - Rule editor
private struct RuleEditorSheet: View {
    @Binding var draft: DeviceDetailView.RuleDraft
    let meta: APIClient.DeviceMetaDTO?
    let onSave: () -> Void
    let isSaving: Bool

    private let allOperators: [String] = [">", ">=", "<", "<=", "==", "!="]

    private var selectedTemplate: APIClient.DeviceMetaDTO.RuleTemplateInfo? {
        guard let tid = draft.templateId else { return nil }
        return meta?.rule_templates.first(where: { $0.id == tid })
    }

    private var fieldInfo: APIClient.DeviceMetaDTO.FieldInfo? {
        meta?.available_fields.first(where: { $0.name == draft.field })
    }

    private var thresholdMin: Double {
        fieldInfo?.min_value ?? selectedTemplate?.field_min ?? 0
    }
    private var thresholdMax: Double {
        fieldInfo?.max_value ?? selectedTemplate?.field_max ?? 200
    }
    private var cooldownMin: Int { selectedTemplate?.cooldown_min_sec ?? draft.cooldownMinSec ?? 60 }

    private var thresholdBinding: Binding<Double> {
        Binding<Double>(
            get: { draft.thresholdNum ?? thresholdMin },
            set: { newVal in
                draft.thresholdNum = min(thresholdMax, max(thresholdMin, newVal))
                draft.thresholdStr = nil
            }
        )
    }

    private var cooldownBinding: Binding<Int> {
        Binding<Int>(
            get: { max(cooldownMin, draft.cooldownSec ?? cooldownMin) },
            set: { newVal in
                draft.cooldownSec = max(cooldownMin, newVal)
            }
        )
    }

    var body: some View {
        Form {
            // Picker de templates — création ET édition, si templates disponibles
            if let templates = meta?.rule_templates, !templates.isEmpty {
                // Détermine si plusieurs trames sont présentes (pour affichage "Trame : Nom")
                let multiFrame = Set(templates.compactMap { $0.frame_name }).count > 1
                Section("DDV.template") {
                    Picker("DDV.template", selection: Binding<String>(
                        get: { draft.templateId ?? templates.first!.id },
                        set: { newId in
                            if let tpl = templates.first(where: { $0.id == newId }) {
                                draft.templateId = tpl.id
                                draft.field = tpl.field
                                draft.op = tpl.field_operators.first ?? ">"
                                draft.cooldownSec = max(tpl.cooldown_min_sec, draft.cooldownSec ?? tpl.cooldown_min_sec)
                            }
                        }
                    )) {
                        ForEach(templates, id: \.id) { tpl in
                            let label: String = (multiFrame && tpl.frame_name != nil)
                                ? "\(tpl.frame_name!) : \(tpl.name)"
                                : tpl.name
                            Text(label).tag(tpl.id)
                        }
                    }
                    .pickerStyle(.menu)

                    if let desc = selectedTemplate?.description, !desc.isEmpty {
                        Text(desc).font(.footnote).foregroundStyle(.secondary)
                    }
                }
            }

            // Nom de l'alerte
            Section("DDV.alertname") {
                TextField("DDV.alertname.placeholder", text: $draft.userLabel)
                    .autocorrectionDisabled()
            }

            // Condition
            Section("DDV.condition") {
                // Operateur : editable dans les deux modes (style menu = dropdown visible)
                let operators = selectedTemplate?.field_operators ?? allOperators
                Picker("DDV.operator", selection: $draft.op) {
                    ForEach(operators, id: \.self) { op in
                        Text(op).tag(op)
                    }
                }
                .pickerStyle(.menu)

                HStack(spacing: 12) {
                    Text("DDV.threshold")
                    Spacer()
                    Stepper("", value: thresholdBinding, in: thresholdMin...thresholdMax, step: 1)
                        .labelsHidden()
                    TextField("", value: thresholdBinding, format: .number)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 70)
                        .textFieldStyle(.roundedBorder)
                }
                .accessibilityElement(children: .combine)

                if let unit = fieldInfo?.unit, !unit.isEmpty {
                    Text("(\(unit))").font(.footnote).foregroundStyle(.secondary)
                }
            }

            // Options
            Section("DLV.options") {
                Stepper(value: cooldownBinding, in: cooldownMin...3600, step: 5) {
                    Text("Cooldown \(cooldownBinding.wrappedValue)s")
                }

                Toggle("DDV.enabled", isOn: $draft.enabled)
            }

            Section {
                Button(action: onSave) {
                    HStack {
                        if isSaving { ProgressView() }
                        Text(draft.id == nil ? "DDV.createrules" : "DLV.save")
                            .frame(maxWidth: .infinity)
                    }
                }
                .disabled(isSaving)
            }
        }
        .onAppear {
            draft.thresholdStr = nil
            draft.cooldownSec = max(cooldownMin, draft.cooldownSec ?? cooldownMin)
            draft.thresholdNum = draft.thresholdNum ?? thresholdMin
        }
    }
}

// MARK: - ISO helpers
enum ISO8601Parsers {
    static let iso = ISO8601DateFormatter()
    static let isoFrac: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions.insert(.withFractionalSeconds)
        return f
    }()
    static func parse(_ s: String) -> Date? {
        isoFrac.date(from: s) ?? iso.date(from: s)
    }
}


