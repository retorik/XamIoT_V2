import Foundation

/// Gère la sélection du serveur API (prod / local).
/// Accès via 5 taps sur le titre de l'écran de connexion.
final class ServerConfig {
    static let shared = ServerConfig()
    private init() {}

    static let production = "https://api.xamiot.com"
    static let local      = "https://apixam.holiceo.com"

    private let key = "xamiot_server_url"

    var baseURL: URL {
        let raw = UserDefaults.standard.string(forKey: key) ?? Self.production
        return URL(string: raw) ?? URL(string: Self.production)!
    }

    var currentLabel: String { isLocal ? "Debug VPS (apixam.holiceo.com)" : "Production (api.xamiot.com)" }
    var isLocal: Bool { UserDefaults.standard.string(forKey: key) == Self.local }

    func set(_ urlString: String) {
        UserDefaults.standard.set(urlString, forKey: key)
    }
}
