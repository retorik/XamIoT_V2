import Foundation
import SwiftData

@Model
final class UserSession {
    @Attribute(.unique) var key: String
    var token: String
    var userId: String
    var email: String
    var createdAt: Date

    init(token: String, userId: String, email: String) {
        self.key = "current"
        self.token = token
        self.userId = userId
        self.email = email
        self.createdAt = Date()
    }
}

@Model
final class ESPDevice: Identifiable {
    @Attribute(.unique) var id: String
    var espUID: String
    var name: String
    var topicPrefix: String
    var lastSeen: Date?
    var lastDb: Double?

    var lastNotificationText: String?
    var lastNotificationAt: Date?

    /// Historique des 30 dernières mesures soundPct, encodé en JSON.
    /// Stocké comme String pour éviter les problèmes de migration SwiftData avec [Double].
    var soundHistoryJSON: String = "[]"

    init(
        id: String,
        espUID: String,
        name: String,
        topicPrefix: String,
        lastSeen: Date?,
        lastDb: Double? = nil
    ) {
        self.id = id
        self.espUID = espUID
        self.name = name
        self.topicPrefix = topicPrefix
        self.lastSeen = lastSeen
        self.lastDb = lastDb
    }

    /// Valeurs décodées depuis soundHistoryJSON (0–100, max 30 entrées).
    var soundHistory: [Double] {
        (try? JSONDecoder().decode([Double].self, from: Data(soundHistoryJSON.utf8))) ?? []
    }

    /// Remplace l'historique par les valeurs fournies (30 max, ordre chronologique).
    /// Utilisé pour charger les trames réelles depuis l'API.
    func setSoundHistory(_ values: [Double]) {
        let clamped = Array(values.suffix(30))
        soundHistoryJSON = (try? String(data: JSONEncoder().encode(clamped), encoding: .utf8)) ?? "[]"
    }

    /// Ajoute une mesure au buffer rolling (max 30 valeurs).
    func appendSoundSample(_ value: Double) {
        var arr = soundHistory
        arr.append(value)
        if arr.count > 30 { arr.removeFirst(arr.count - 30) }
        soundHistoryJSON = (try? String(data: JSONEncoder().encode(arr), encoding: .utf8)) ?? soundHistoryJSON
    }
}

@Model
final class ESPRule: Identifiable {
    @Attribute(.unique) var id: String
    var espId: String
    var field: String
    var op: String
    var thresholdNum: Double?
    var thresholdStr: String?
    var cooldownSec: Int?
    var enabled: Bool
    var createdAt: Date?

    init(id: String, espId: String, field: String, op: String, thresholdNum: Double?, thresholdStr: String?, cooldownSec: Int?, enabled: Bool, createdAt: Date?) {
        self.id = id
        self.espId = espId
        self.field = field
        self.op = op
        self.thresholdNum = thresholdNum
        self.thresholdStr = thresholdStr
        self.cooldownSec = cooldownSec
        self.enabled = enabled
        self.createdAt = createdAt
    }
}

@Model
final class NotificationLog: Identifiable {
    var id: UUID
    var espId: String
    var espUID: String
    var message: String
    var createdAt: Date

    init(espId: String, espUID: String, message: String, createdAt: Date = Date()) {
        self.id = UUID()
        self.espId = espId
        self.espUID = espUID
        self.message = message
        self.createdAt = createdAt
    }
}
