import SwiftUI
import Foundation
#if canImport(UIKit)
import UIKit
#endif

struct LoginView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorText: String?
    @State private var showSignup = false

    @State private var isResetLoading = false

    // 5 taps sur le titre → sélecteur de serveur
    @State private var logoTapCount = 0
    @State private var showServerPicker = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                // Zone titre — 5 taps pour ouvrir le sélecteur de serveur
                VStack(spacing: 8) {
                    Text(.loginWelcome)
                        .font(.largeTitle.bold())
                    Text(.loginConnectdevices)
                        .foregroundStyle(.secondary)
                }
                .multilineTextAlignment(.center)
                .contentShape(Rectangle())
                .onTapGesture {
                    logoTapCount += 1
                    if logoTapCount >= 5 {
                        logoTapCount = 0
                        showServerPicker = true
                    }
                }

                VStack(spacing: 14) {
                    TextField("login.email", text: $email)
                        .textContentType(.username)
                        .autocapitalization(.none)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .padding()
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))

                    SecureField(.loginPass, text: $password)
                        .textContentType(.password)
                        .padding()
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
                }
                .padding(.horizontal)

                if let err = errorText {
                    Text(err)
                        .foregroundStyle(.red)
                        .padding(.horizontal)
                        .transition(.opacity)
                        .accessibilityIdentifier("loginErrorLabel")
                }

                Button {
                    Task { await signIn() }
                } label: {
                    HStack {
                        if isLoading { ProgressView() }
                        Text(.loginLogin)
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 14))
                    .foregroundStyle(.white)
                }
                .disabled(isLoading || email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || password.isEmpty)
                .padding(.horizontal)

                Button {
                    Task { await requestPasswordReset() }
                } label: {
                    HStack(spacing: 8) {
                        if isResetLoading { ProgressView() }
                        Text(.loginForgotpass)
                            .font(.subheadline.weight(.semibold))
                    }
                }
                .disabled(isResetLoading)
                .padding(.top, -8)

                HStack(spacing: 6) {
                    Text(.loginNoaccount)
                        .foregroundStyle(.secondary)
                    Button(.loginCreateaccount) {
                        showSignup = true
                    }
                    .fontWeight(.semibold)
                }
                .padding(.top, 8)

                Spacer()
            }
            .padding(.vertical, 24)
            .overlay(alignment: .bottomTrailing) {
                Text(appVersion)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .padding(.bottom, 10)
                    .padding(.trailing, 16)
            }
            .navigationDestination(isPresented: $showSignup) {
                SignupView()
            }
            // Sélecteur de serveur (dev tool — 5 taps sur le titre)
            .confirmationDialog(
                "🔧 Serveur API",
                isPresented: $showServerPicker,
                titleVisibility: .visible
            ) {
                Button("Production  (api.xamiot.com)") {
                    ServerConfig.shared.set(ServerConfig.production)
                }
                Button("Debug VPS  (apixam.holiceo.com)") {
                    ServerConfig.shared.set(ServerConfig.local)
                }
                Button("Annuler", role: .cancel) {}
            } message: {
                Text("Actuel : \(ServerConfig.shared.currentLabel)")
            }
        }
    }

    private var appVersion: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "—"
        return "\(v) (\(b))"
    }

    private func signIn() async {
        errorText = nil
        isLoading = true
        defer { isLoading = false }

        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)

        do {
            let res = try await APIClient.shared.login(email: trimmedEmail, password: password)
            await MainActor.run {
                session.signIn(token: res.token, userId: res.user.id, email: res.user.email)
            }
            MobileDeviceRegistrar.shared.ensureAfterLogin(jwt: res.token)
            MobileDeviceRegistrar.shared.touchOnAppOpen(jwt: res.token)
        } catch {
            let friendly = mapErrorToMessage(error)
            await MainActor.run {
                errorText = friendly
                UINotificationFeedbackGenerator().notificationOccurred(.error)
            }
        }
    }

    private func mapErrorToMessage(_ error: Error) -> String {
        if case APIError.http(let code) = error {
            switch code {
            case 400, 422: return "Requête invalide. Vérifiez vos informations."
            case 401:      return "Identifiant ou mot de passe incorrect."
            case 403:      return "Votre compte n'est pas encore activé. Vérifiez l'e-mail d'activation."
            case 404:      return "Service temporairement indisponible. Réessayez plus tard."
            case 429:      return "Trop de tentatives. Patientez un instant puis réessayez."
            case 500...599: return "Problème serveur. Réessayez dans quelques instants."
            default: break
            }
        }
        let nsErr = error as NSError
        if nsErr.domain == NSURLErrorDomain {
            switch nsErr.code {
            case NSURLErrorNotConnectedToInternet, NSURLErrorTimedOut:
                return "Pas de connexion Internet. Vérifiez votre réseau."
            case NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost, NSURLErrorNetworkConnectionLost:
                return "Impossible de joindre le serveur. Réessayez plus tard."
            default: break
            }
        }
        return (error as? LocalizedError)?.errorDescription ?? "Une erreur est survenue. Réessayez."
    }

    private func isValidEmail(_ value: String) -> Bool {
        let v = value.trimmingCharacters(in: .whitespacesAndNewlines)
        let pattern = #"^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$"#
        return v.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
    }

    private func requestPasswordReset() async {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmed.isEmpty else {
            errorText = "Veuillez saisir votre e-mail de compte."
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
            return
        }
        guard isValidEmail(trimmed) else {
            errorText = "Adresse e-mail invalide."
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
            return
        }

        errorText = nil
        isResetLoading = true
        defer { isResetLoading = false }

        do {
            let url = ServerConfig.shared.baseURL
                .appendingPathComponent("auth")
                .appendingPathComponent("forgot-password")
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            let payload = ["email": trimmed]
            req.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])

            let (data, resp) = try await URLSession.shared.data(for: req)
            if let http = resp as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                _ = (try? JSONSerialization.jsonObject(with: data) as? [String:Any])?["error"] as? String
                throw APIError.http(http.statusCode)
            }

            await MainActor.run {
                errorText = "Si un compte existe pour cet e-mail, un message vient d'être envoyé."
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
        } catch {
            await MainActor.run {
                errorText = "Impossible d'envoyer la demande pour le moment. Réessayez."
                UINotificationFeedbackGenerator().notificationOccurred(.error)
            }
        }
    }

}
