import Foundation
import UserNotifications
import SwiftUI
import SwiftData
import UIKit

// MARK: - Notifications internes
extension Notification.Name {
    static let apnsTokenDidUpdate = Notification.Name("apnsTokenDidUpdate")
    static let deviceLogUpdated   = Notification.Name("deviceLogUpdated")
}

// MARK: - Stockage simple du token
final class APNsTokenStore {
    static let shared = APNsTokenStore()
    private let key = "apns.token"

    var current: String? {
        UserDefaults.standard.string(forKey: key)
    }

    @MainActor
    func set(_ token: String) {
        UserDefaults.standard.set(token, forKey: key)
        NotificationCenter.default.post(
            name: .apnsTokenDidUpdate,
            object: nil,
            userInfo: ["token": token]
        )
    }
}

// MARK: - Affichage + autorisations
final class NotificationManager: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationManager()

    @MainActor
    func configure() async {
        let center = UNUserNotificationCenter.current()
        center.delegate = self

        let settings = await center.notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            _ = try? await center.requestAuthorization(options: [.alert, .badge, .sound])
        }

        // Enregistrement APNs (indépendant de l'autorisation d'affichage)
        await MainActor.run {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    // Affiche la bannière même en foreground + log le payload
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let info = notification.request.content.userInfo
        print("📩 willPresent userInfo=\(info)")
        LogStore.shared.capture(userInfo: info)
        completionHandler([.banner, .sound, .badge])
    }
}

// MARK: - AppDelegate (token, réception silencieuse)
class AppDelegate: NSObject, UIApplicationDelegate {

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {

        let bundle = Bundle.main.bundleIdentifier ?? "nil"
        #if DEBUG
        let env = "development"   // Sandbox
        #else
        let env = "production"    // Production/TestFlight
        #endif
        print("🔰 didFinishLaunching — CFBundleIdentifier=\(bundle), APNs env=\(env)")

        Task { await NotificationManager.shared.configure() }
        return true
    }

    // ✅ Token APNs reçu → persister + notifier. (Pas d’appel réseau ici)
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let hex = deviceToken.map { String(format:"%02x", $0) }.joined()
        #if DEBUG
        let isSandbox = true
        #else
        let isSandbox = false
        #endif
        print("✅ APNs token (sandbox=\(isSandbox)) = \(hex)")
        Task { @MainActor in
            APNsTokenStore.shared.set(hex)
            UserDefaults.standard.set(isSandbox, forKey: "apns_isSandbox")
        }
    }

    // Échec d’enregistrement APNs → log explicite
    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("❌ didFailToRegisterForRemoteNotifications: \(error.localizedDescription)")
    }

    // Réception background/silencieuse (content-available)
    func application(_ application: UIApplication,
                     didReceiveRemoteNotification userInfo: [AnyHashable : Any],
                     fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        print("📩 didReceiveRemoteNotification userInfo=\(userInfo)")
        LogStore.shared.capture(userInfo: userInfo)
        completionHandler(.newData)
    }
}

// MARK: - Persistance simple des derniers payloads reçus
final class LogStore {
    static let shared = LogStore()

    private let defaultsKey = "device.logs"
    private var modelContext: ModelContext?
    // Local formatter to avoid relying on global extensions (and name clashes)
    private let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    func attach(modelContext: ModelContext) { self.modelContext = modelContext }

    func capture(userInfo: [AnyHashable: Any]) {
        let espId  = userInfo["esp_id"]  as? String ?? ""
        let espUID = userInfo["esp_uid"] as? String ?? ""
        let message = userInfo["message"] as? String ?? "Notification"
        let tsStr  = userInfo["timestamp"] as? String
        let date   = tsStr.flatMap { iso.date(from: $0) } ?? Date()

        var dict = UserDefaults.standard.dictionary(forKey: defaultsKey) as? [String: [String: Any]] ?? [:]
        dict[espId] = [
            "esp_uid": espUID,
            "message": message,
            "date": date.timeIntervalSince1970
        ]
        UserDefaults.standard.set(dict, forKey: defaultsKey)

        if let ctx = modelContext {
            let log = NotificationLog(espId: espId, espUID: espUID, message: message, createdAt: date)
            ctx.insert(log)
            try? ctx.save()
        }

        NotificationCenter.default.post(name: .deviceLogUpdated, object: espId)
    }

    func last(for espId: String) -> (message: String, date: Date)? {
        guard let dict = UserDefaults.standard.dictionary(forKey: defaultsKey) as? [String: [String: Any]],
              let entry = dict[espId],
              let msg = entry["message"] as? String,
              let ts  = entry["date"] as? TimeInterval else { return nil }
        return (msg, Date(timeIntervalSince1970: ts))
    }
}

//extension ISO8601DateFormatter {
//    static let withFractional: ISO8601DateFormatter = {
//        let f = ISO8601DateFormatter()
//        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
//        return f
//    }()
//}

