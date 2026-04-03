//
//  WiFiCredentialsStore.swift
//  XamIoT SoundSense
//
//  Created by Jérémy FAUVET on 04/10/2025.
//
import Foundation
import Security

enum WiFiCredentialsStore {
    private static let service = "com.xamiot.soundsense.wifi"

    static func save(ssid: String, password: String) {
        let dict: [String: Any] = ["ssid": ssid, "password": password]
        let data = try! JSONSerialization.data(withJSONObject: dict)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "last",
        ]
        SecItemDelete(query as CFDictionary)
        var attrs = query
        attrs[kSecValueData as String] = data
        SecItemAdd(attrs as CFDictionary, nil)
    }

    static func load() -> (ssid: String, password: String)? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "last",
            kSecReturnData as String: kCFBooleanTrue!,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        if let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            let ssid = dict["ssid"] as? String ?? ""
            let pwd  = dict["password"] as? String ?? ""
            return (ssid, pwd)
        }
        return nil
    }
}

