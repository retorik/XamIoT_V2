import Foundation

#if DEBUG
@inline(__always) private func dlog(_ msg: @autoclosure () -> String) { print("🔎[API] \(msg())") }
#else
@inline(__always) private func dlog(_ msg: @autoclosure () -> String) { }
#endif

struct APIClient {
    static let shared = APIClient()
    private init() {}

    private var base: URL { ServerConfig.shared.baseURL }

    struct LoginResponse: Decodable {
        let token: String
        let user: User
        struct User: Decodable { let id: String; let email: String }
    }

    struct SignupResponse: Decodable {
        let ok: Bool
        let activation_url: String?
    }

    // MARK: - ESP DEVICES DTO
    struct DeviceDTO: Decodable {
        let id: String
        let esp_uid: String
        let name: String
        let topic_prefix: String
        let last_seen: String?
        let last_db: Double?
        /// Historique des 30 dernières trames soundPct, retourné directement par l'API.
        let sound_history: [Double]

        private enum CodingKeys: String, CodingKey { case id, esp_uid, name, topic_prefix, last_seen, last_db, sound_history }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)

            if let intId = try? c.decode(Int.self, forKey: .id) {
                self.id = String(intId)
            } else if let strId = try? c.decode(String.self, forKey: .id) {
                self.id = strId
            } else {
                self.id = ""
            }

            self.esp_uid = (try? c.decode(String.self, forKey: .esp_uid)) ?? ""

            if let name = try? c.decode(String.self, forKey: .name), !name.isEmpty {
                self.name = name
            } else {
                self.name = self.esp_uid
            }

            self.topic_prefix    = (try? c.decode(String.self, forKey: .topic_prefix)) ?? ""
            self.last_seen       = try? c.decode(String.self, forKey: .last_seen)
            self.last_db         = try? c.decode(Double.self, forKey: .last_db)
            self.sound_history   = (try? c.decode([Double].self, forKey: .sound_history)) ?? []
        }
    }

    struct RuleDTO: Decodable {
        let id: String
        let esp_id: String
        let field: String
        let op: String
        let threshold_num: Double?
        let threshold_str: String?
        let cooldown_sec: Int?
        let enabled: Bool
        let created_at: String?
        let user_label: String?
        let template_name: String?
        let template_id: String?
        let cooldown_min_sec: Int?
    }

    struct DeviceMetaDTO: Decodable {
        let esp_id: String
        let esp_name: String
        let device_type: DeviceTypeInfo?
        let available_fields: [FieldInfo]
        let rule_templates: [RuleTemplateInfo]

        struct DeviceTypeInfo: Decodable { let id: String; let name: String; let description: String? }
        struct FieldInfo: Decodable { let name: String; let label: String?; let data_type: String; let unit: String?; let min_value: Double?; let max_value: Double?; let operators: [String] }
        struct RuleTemplateInfo: Decodable {
            let id: String
            let name: String
            let description: String?
            let field: String
            let field_label: String
            let field_data_type: String
            let field_unit: String?
            let field_min: Double?
            let field_max: Double?
            let field_operators: [String]
            let cooldown_min_sec: Int
            let frame_name: String?
        }
    }

    struct AlertDTO: Decodable {
        let id: String
        let rule_id: String?
        let device_id: String?
        let sent_at: String?
        let channel: String?
        let status: String?
        let payload: PayloadDTO?
        let error: String?

        struct PayloadDTO: Decodable {
            let op: String?
            let body: String?
            let field: String?
            let title: String?
            let topic: String?
            let value: Double?
            let chipid: String?
            let esp_id: String?
            let rule_id: String?
            let threshold_num: Double?
            let threshold_str: String?
        }
    }

    struct MobileDeviceDTO: Decodable {
        let id: String
        let name: String?
        let platform: String?
        let apns_token: String?
        let bundle_id: String?
        let created_at: String?
        let last_seen: String?
    }

    // MARK: - Auth
    func login(email: String, password: String) async throws -> LoginResponse {
        var req = URLRequest(url: base.appendingPathComponent("auth").appendingPathComponent("login"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body = [
            "email": email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
            "password": password
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.unknown }
        guard 200..<300 ~= http.statusCode else { throw APIError.http(http.statusCode) }
        return try JSONDecoder().decode(LoginResponse.self, from: data)
    }

    func signup(email: String,
                password: String,
                firstName: String? = nil,
                lastName: String? = nil,
                phone: String? = nil) async throws -> SignupResponse {
        let url = base.appendingPathComponent("auth").appendingPathComponent("signup")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try jsonBody([
            "email": email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
            "password": password,
            "FirstName": firstName,
            "LastName": lastName,
            "Phone": phone
        ])
        dlog("➡️ POST \(url.absoluteString)")
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.unknown }
        guard 200..<300 ~= http.statusCode else { throw APIError.http(http.statusCode) }
        return try JSONDecoder().decode(SignupResponse.self, from: data)
    }

    func activateAccount(token: String) async throws {
        let url = base.appendingPathComponent("auth").appendingPathComponent("activate")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try jsonBody(["token": token])

        dlog("➡️ POST \(url.absoluteString)")
        let (_, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.unknown }
        guard 200..<300 ~= http.statusCode else { throw APIError.http(http.statusCode) }
    }

    // MARK: - ESP DEVICES
    func fetchDevices(token: String) async throws -> [DeviceDTO] {
        var req = URLRequest(url: base.appendingPathComponent("esp-devices"))
        req.httpMethod = "GET"
        req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.unknown }
        guard 200..<300 ~= http.statusCode else { throw APIError.http(http.statusCode) }
        return try JSONDecoder().decode([DeviceDTO].self, from: data)
    }

    func createESPDevice(
        token: String,
        esp_uid: String,
        name: String,
        topic_prefix: String,
        mqtt_password: String
    ) async throws -> DeviceDTO {
        let url = base.appendingPathComponent("esp-devices")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        req.httpBody = try jsonBody([
            "esp_uid": esp_uid,
            "name": name,
            "topic_prefix": topic_prefix,
            "mqtt_password": mqtt_password    // 🔐 on l'envoie à l'API
        ])
        dlog("➡️ POST \(url.absoluteString)")
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.unknown }
        guard 200..<300 ~= http.statusCode else { throw APIError.http(http.statusCode) }
        return try JSONDecoder().decode(DeviceDTO.self, from: data)
    }

    func updateESPDevice(token: String, id: String, name: String? = nil, topic_prefix: String? = nil) async throws -> DeviceDTO {
        let url = base.appendingPathComponent("esp-devices").appendingPathComponent(id)
        var req = URLRequest(url: url)
        req.httpMethod = "PATCH"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        req.httpBody = try jsonBody([
            "name": name,
            "topic_prefix": topic_prefix
        ])
        dlog("➡️ PATCH \(url.absoluteString)")
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.unknown }
        guard 200..<300 ~= http.statusCode else { throw APIError.http(http.statusCode) }
        return try JSONDecoder().decode(DeviceDTO.self, from: data)
    }

    func deleteESPDevice(token: String, id: String) async throws {
        let url = base.appendingPathComponent("esp-devices").appendingPathComponent(id)
        var req = URLRequest(url: url)
        req.httpMethod = "DELETE"
        req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        dlog("➡️ DELETE \(url.absoluteString)")
        let (_, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.unknown }
        guard (200..<300).contains(http.statusCode) || http.statusCode == 204 else { throw APIError.http(http.statusCode) }
    }

    // MARK: - RULES
    func fetchRules(token: String, espId: String) async throws -> [RuleDTO] {
        var comps = URLComponents(url: base.appendingPathComponent("esp-rules"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "esp_id", value: espId)]
        var req = URLRequest(url: comps.url!)
        req.httpMethod = "GET"
        req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.unknown }
        guard 200..<300 ~= http.statusCode else { throw APIError.http(http.statusCode) }
        return try JSONDecoder().decode([RuleDTO].self, from: data)
    }

    func createRule(token: String,
                    esp_id: String,
                    field: String,
                    op: String,
                    threshold_num: Double? = nil,
                    threshold_str: String? = nil,
                    cooldown_sec: Int? = nil,
                    enabled: Bool = true,
                    user_label: String? = nil,
                    template_id: String? = nil) async throws -> RuleDTO {
        let url = base.appendingPathComponent("esp-rules")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        req.httpBody = try jsonBody([
            "esp_id": esp_id,
            "field": field,
            "op": op,
            "threshold_num": threshold_num,
            "threshold_str": threshold_str,
            "cooldown_sec": cooldown_sec,
            "enabled": enabled,
            "user_label": user_label,
            "template_id": template_id
        ])
        dlog("➡️ POST \(url.absoluteString)")
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.unknown }
        guard 200..<300 ~= http.statusCode else { throw APIError.http(http.statusCode) }
        return try JSONDecoder().decode(RuleDTO.self, from: data)
    }

    func fetchDeviceMeta(token: String, espId: String) async throws -> DeviceMetaDTO {
        let url = base.appendingPathComponent("esp-devices").appendingPathComponent(espId).appendingPathComponent("meta")
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        dlog("➡️ GET \(url.absoluteString)")
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.unknown }
        guard 200..<300 ~= http.statusCode else { throw APIError.http(http.statusCode) }
        return try JSONDecoder().decode(DeviceMetaDTO.self, from: data)
    }

    func updateRule(token: String,
                    ruleId: String,
                    field: String? = nil,
                    op: String? = nil,
                    threshold_num: Double? = nil,
                    threshold_str: String? = nil,
                    cooldown_sec: Int? = nil,
                    enabled: Bool? = nil,
                    user_label: String? = nil,
                    template_id: String? = nil) async throws -> RuleDTO {
        let url = base.appendingPathComponent("esp-rules").appendingPathComponent(ruleId)
        var req = URLRequest(url: url)
        req.httpMethod = "PATCH"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        req.httpBody = try jsonBody([
            "field": field,
            "op": op,
            "threshold_num": threshold_num,
            "threshold_str": threshold_str,
            "cooldown_sec": cooldown_sec,
            "enabled": enabled,
            "user_label": user_label,
            "template_id": template_id
        ])
        dlog("➡️ PATCH \(url.absoluteString)")
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.unknown }
        guard 200..<300 ~= http.statusCode else { throw APIError.http(http.statusCode) }
        return try JSONDecoder().decode(RuleDTO.self, from: data)
    }

    func deleteRule(token: String, ruleId: String) async throws {
        let url = base.appendingPathComponent("esp-rules").appendingPathComponent(ruleId)
        var req = URLRequest(url: url)
        req.httpMethod = "DELETE"
        req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        dlog("➡️ DELETE \(url.absoluteString)")
        let (_, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.unknown }
        guard (200..<300).contains(http.statusCode) || http.statusCode == 204 else { throw APIError.http(http.statusCode) }
    }

    // MARK: - ALERTS
    func fetchAlerts(token: String, espId: String) async throws -> [AlertDTO] {
        var comps = URLComponents(url: base.appendingPathComponent("esp-alerts"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "esp_id", value: espId)]
        let url = comps.url!
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        dlog("➡️ GET \(url.absoluteString)")
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.unknown }
        if http.statusCode == 404 { return [] }
        guard 200..<300 ~= http.statusCode else { throw APIError.http(http.statusCode) }
        return try JSONDecoder().decode([AlertDTO].self, from: data)
    }

    func fetchLastAlert(token: String, espId: String) async throws -> AlertDTO? {
        var comps = URLComponents(url: base.appendingPathComponent("esp-alerts"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [
            URLQueryItem(name: "esp_id", value: espId),
            URLQueryItem(name: "limit", value: "1"),
            URLQueryItem(name: "offset", value: "0")
        ]
        var req = URLRequest(url: comps.url!)
        req.httpMethod = "GET"
        req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.unknown }
        if http.statusCode == 404 { return nil }
        guard 200..<300 ~= http.statusCode else { throw APIError.http(http.statusCode) }
        return try JSONDecoder().decode([AlertDTO].self, from: data).first
    }

    // MARK: - MOBILE DEVICES
    func registerMobileDevice(token: String, name: String, platform: String, apns_token: String, bundle_id: String, sandbox: Bool = false, model: String? = nil, os_version: String? = nil, timezone: String? = nil, app_version: String? = nil, app_build_number: Int? = nil) async throws -> MobileDeviceDTO? {
        let url = base.appendingPathComponent("devices")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        var body: [String: Any?] = [
            "name": name,
            "platform": platform,
            "apns_token": apns_token,
            "bundle_id": bundle_id,
            "sandbox": sandbox,
        ]
        if let m = model            { body["model"]            = m }
        if let o = os_version       { body["os_version"]       = o }
        if let t = timezone         { body["timezone"]         = t }
        if let v = app_version      { body["app_version"]      = v }
        if let b = app_build_number { body["app_build_number"] = b }
        req.httpBody = try jsonBody(body)
        dlog("➡️ POST \(url.absoluteString)")
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.unknown }
        guard 200..<300 ~= http.statusCode else { throw APIError.http(http.statusCode) }
        if data.isEmpty { return nil }
        return try? JSONDecoder().decode(MobileDeviceDTO.self, from: data)
    }

    func fetchMobileDevices(token: String) async throws -> [MobileDeviceDTO] {
        let url = base.appendingPathComponent("devices")
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        dlog("➡️ GET \(url.absoluteString)")
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.unknown }
        guard 200..<300 ~= http.statusCode else { throw APIError.http(http.statusCode) }
        return try JSONDecoder().decode([MobileDeviceDTO].self, from: data)
    }

    func updateMobileDevice(token: String, id: String, name: String? = nil, apns_token: String? = nil, bundle_id: String? = nil) async throws -> MobileDeviceDTO {
        let url = base.appendingPathComponent("devices").appendingPathComponent(id)
        var req = URLRequest(url: url)
        req.httpMethod = "PATCH"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        let now = ISO8601DateFormatter.withFractional.string(from: Date())
        req.httpBody = try jsonBody([
            "name": name,
            "apns_token": apns_token,
            "bundle_id": bundle_id,
            "last_seen": now
        ])
        dlog("➡️ PATCH \(url.absoluteString)")
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.unknown }
        guard 200..<300 ~= http.statusCode else { throw APIError.http(http.statusCode) }
        if data.isEmpty {
            return MobileDeviceDTO(id: id, name: name, platform: "iOS", apns_token: apns_token, bundle_id: bundle_id, created_at: nil, last_seen: now)
        }
        return try JSONDecoder().decode(MobileDeviceDTO.self, from: data)
    }

    func deleteMobileDevice(token: String, id: String) async throws {
        let url = base.appendingPathComponent("devices").appendingPathComponent(id)
        var req = URLRequest(url: url)
        req.httpMethod = "DELETE"
        req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        dlog("➡️ DELETE \(url.absoluteString)")
        let (_, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.unknown }
        guard (200..<300).contains(http.statusCode) || http.statusCode == 204 else { throw APIError.http(http.statusCode) }
    }
    
    // MARK: - Helpers JSON
    private func jsonBody(_ dict: [String: Any?]) throws -> Data {
        var clean: [String: Any] = [:]
        for (k, v) in dict { if let v = v { clean[k] = v } }
        return try JSONSerialization.data(withJSONObject: clean)
    }

    // MARK: - Badge
    func fetchBadge(token: String) async throws -> Int {
        var req = URLRequest(url: base.appendingPathComponent("me").appendingPathComponent("badge"))
        req.httpMethod = "GET"
        req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.unknown }
        guard 200..<300 ~= http.statusCode else { throw APIError.http(http.statusCode) }
        let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return (obj?["badge"] as? Int) ?? 0
    }

    @discardableResult
    func resetBadge(token: String) async throws -> Int {
        var req = URLRequest(url: base.appendingPathComponent("me").appendingPathComponent("badge").appendingPathComponent("reset"))
        req.httpMethod = "POST"
        req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.unknown }
        guard 200..<300 ~= http.statusCode else { throw APIError.http(http.statusCode) }
        let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return (obj?["badge"] as? Int) ?? 0
    }
}

enum APIError: Error, LocalizedError {
    case http(Int)
    case decoding
    case unknown

    var errorDescription: String? {
        switch self {
        case .http(let code): return "Erreur serveur (\(code))."
        case .decoding: return "Réponse inattendue."
        case .unknown: return "Erreur inconnue."
        }
    }
}

extension ISO8601DateFormatter {
    static let withFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}

