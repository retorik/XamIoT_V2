import Foundation
import UIKit
import Darwin

/// Enregistre / met à jour le device iOS côté API une fois le JWT obtenu.
final class MobileDeviceRegistrar {
    static let shared = MobileDeviceRegistrar()

    private var obs: NSObjectProtocol?
    private var lastRegisteredToken: String?

    deinit {
        if let obs { NotificationCenter.default.removeObserver(obs) }
    }

    /// À appeler immédiatement après un login réussi (tu as le JWT)
    func ensureAfterLogin(jwt: String) {
        // 1) Si on a déjà le token APNs, on upsert tout de suite
        if let apns = APNsTokenStore.shared.current {
            Task { try? await self.register(jwt: jwt, apnsToken: apns) }
        }

        // 2) Écoute l’arrivée / le renouvellement du token APNs
        obs = NotificationCenter.default.addObserver(
            forName: .apnsTokenDidUpdate, object: nil, queue: .main
        ) { [weak self] note in
            guard
                let self,
                let tok = (note.userInfo?["token"] as? String) ?? APNsTokenStore.shared.current
            else { return }
            Task { try? await self.register(jwt: jwt, apnsToken: tok) }
        }
    }

    /// À appeler quand l’app redevient active (pour rafraîchir last_seen)
    func touchOnAppOpen(jwt: String) {
        guard let apns = APNsTokenStore.shared.current else { return }
        Task { try? await self.register(jwt: jwt, apnsToken: apns) }
    }

    // MARK: - Private

    private func register(jwt: String, apnsToken: String) async throws {
        lastRegisteredToken = apnsToken

        // Swift 6 / MainActor : récupère name, bundle, sandbox et métadonnées device
        let (name, bundle, isSandbox, model, osVersion, tz, appVersion, appBuild): (String, String, Bool, String, String, String, String, Int) = await MainActor.run {
            let deviceName = UIDevice.current.name
            let bundleId   = Bundle.main.bundleIdentifier ?? "nil"
            let sandbox    = UserDefaults.standard.bool(forKey: "apns_isSandbox")
            // Modèle matériel via sysctl (ex: "iPhone16,1")
            var hwModel = UIDevice.current.model
            var size = 0
            sysctlbyname("hw.machine", nil, &size, nil, 0)
            if size > 0 {
                var buf = [CChar](repeating: 0, count: size)
                if sysctlbyname("hw.machine", &buf, &size, nil, 0) == 0 {
                    hwModel = String(cString: buf)
                }
            }
            let os      = "iOS \(UIDevice.current.systemVersion)"
            let tz      = TimeZone.current.identifier
            let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
            let build   = Int(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0") ?? 0
            return (deviceName, bundleId, sandbox, hwModel, os, tz, version, build)
        }

        _ = try await APIClient.shared.registerMobileDevice(
            token: jwt,
            name: name,
            platform: "iOS",
            apns_token: apnsToken,
            bundle_id: bundle,
            sandbox: isSandbox,
            model: model,
            os_version: osVersion,
            timezone: tz,
            app_version: appVersion,
            app_build_number: appBuild
        )
        print("📲 Mobile upsert OK (name=\(name), model=\(model), os=\(osVersion), v=\(appVersion) (\(appBuild)), sandbox=\(isSandbox))")
    }
}

