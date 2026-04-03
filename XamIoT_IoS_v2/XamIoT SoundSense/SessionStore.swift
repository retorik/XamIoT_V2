import Foundation
import Combine

final class SessionStore: ObservableObject {
    @Published private(set) var token: String?
    @Published private(set) var userId: String?
    @Published private(set) var email: String?

    private let tokenKey = "auth.token"
    private let userIdKey = "auth.userId"
    private let emailKey = "auth.email"

    init() {
        self.token = KeychainHelper.standard.string(for: tokenKey)
        self.userId = KeychainHelper.standard.string(for: userIdKey)
        self.email = KeychainHelper.standard.string(for: emailKey)
    }

    var isAuthenticated: Bool { token != nil }

    func signIn(token: String, userId: String, email: String) {
        KeychainHelper.standard.set(token, for: tokenKey)
        KeychainHelper.standard.set(userId, for: userIdKey)
        KeychainHelper.standard.set(email, for: emailKey)
        self.token = token
        self.userId = userId
        self.email = email
    }

    func signOut() {
        KeychainHelper.standard.remove(for: tokenKey)
        KeychainHelper.standard.remove(for: userIdKey)
        KeychainHelper.standard.remove(for: emailKey)
        self.token = nil
        self.userId = nil
        self.email = nil
    }
}
