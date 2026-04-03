import SwiftUI
import SwiftData
import UserNotifications

@main
struct XamIoT_SoundSenseApp: App {
    // 1) AppDelegate (configure APNs + logs)
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var ble = BLEManager.shared

    // 2) Conteneur SwiftData
    var sharedModelContainer: ModelContainer = {
        let schema = Schema([
            UserSession.self,
            ESPDevice.self,
            ESPRule.self,
            NotificationLog.self
        ])
        let modelConfiguration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)
        do {
            return try ModelContainer(for: schema, configurations: [modelConfiguration])
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }
    }()

    // 3) Session globale
    @StateObject private var session = SessionStore()

    // 4) Scene phase pour détecter le retour en avant-plan
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootShellView()
                .environmentObject(session)
                .environmentObject(ble)
        }
        .modelContainer(sharedModelContainer)

        // ✅ iOS 17+: onChange avec 2 paramètres (oldValue, newValue)
        .onChange(of: session.isAuthenticated) { oldValue, newValue in
            guard newValue, let jwt = session.token else { return }
            // Enregistre/MAJ l'appareil côté API une fois authentifié
            MobileDeviceRegistrar.shared.ensureAfterLogin(jwt: jwt)
            // Touch immédiat (optionnel) pour mettre à jour last_seen
            MobileDeviceRegistrar.shared.touchOnAppOpen(jwt: jwt)
        }

        // ✅ iOS 17+: onChange avec 2 paramètres (oldPhase, newPhase)
        .onChange(of: scenePhase) { oldPhase, newPhase in
            if newPhase == .active, session.isAuthenticated, let jwt = session.token {
                Task {
                    // Remet à zéro côté API
                    _ = try? await APIClient.shared.resetBadge(token: jwt)
                    // Remet la pastille à zéro côté app
                    UNUserNotificationCenter.current().setBadgeCount(0, withCompletionHandler: nil)
                }
                // (tu gardes ton touch last_seen)
                MobileDeviceRegistrar.shared.touchOnAppOpen(jwt: jwt)
            }
        }
    }
}

struct RootShellView: View {
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var session: SessionStore
    @State private var showSplash = true

    var body: some View {
        Group {
            if session.isAuthenticated {
                DevicesListView()
            } else {
                LoginView()
            }
        }
        // Persistance des payloads de notifications
        .task {
            LogStore.shared.attach(modelContext: modelContext)
        }
        .overlay {
            if showSplash {
                SplashView().transition(.opacity)
            }
        }
        .task {
            try? await Task.sleep(nanoseconds: 800_000_000)
            withAnimation { showSplash = false }
        }
    }
}

