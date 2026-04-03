//
//  SignupView.swift
//  XamIoT SoundSense
//
//  Created by Jérémy FAUVET on 28/09/2025.
//

import SwiftUI

struct SignupView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var showPassword = false

    @State private var firstName = ""
    @State private var lastName = ""

    // Téléphone
    @State private var selectedCountry: Country = CountryPhoneCodes.defaultCountry
    @State private var localPhone = "" // chiffres, sans le 0 de tête

    @State private var isLoading = false
    @State private var errorText: String?
    @State private var successText: String?

    var body: some View {
        Form {
            Section(header: Text("signup.informations")) {
                TextField("login.email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)

                passwordField(title: "Mot de passe", text: $password, show: $showPassword)
                    .textContentType(.newPassword)

                passwordField(title: "Confirmer le mot de passe", text: $confirmPassword, show: $showPassword)
                    .textContentType(.newPassword)

                if !confirmPassword.isEmpty && password != confirmPassword {
                    Text("signup.passdonotmatch")
                        .foregroundStyle(.red)
                        .font(.footnote)
                } else if !password.isEmpty && password.count < 6 {
                    Text("signup.atleast6chars")
                        .foregroundStyle(.secondary)
                        .font(.footnote)
                }

                TextField("signup.firstname", text: $firstName)
                TextField("signup.name", text: $lastName)

                // Téléphone — sélecteur indicatif (drapeau + +XX) + saisie
                HStack(spacing: 8) {
                    PhoneCountryMenu(selected: $selectedCountry)

                    TextField("signup.phone", text: $localPhone)
                        .keyboardType(.phonePad)
                        .textContentType(.telephoneNumber)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .onChange(of: localPhone) { oldValue, newValue in
                            var digits = newValue.replacingOccurrences(of: "[^0-9]", with: "", options: .regularExpression)
                            if digits.hasPrefix("0") { digits.removeFirst() }
                            if digits != newValue { localPhone = digits } // évite une boucle de changements
                        }
                }
            }

            if let err = errorText {
                Section { Text(err).foregroundStyle(.red) }
            }
            if let ok = successText {
                Section { Text(ok).foregroundStyle(.green) }
            }

            Section {
                Button {
                    Task { await createAccount() }
                } label: {
                    if isLoading {
                        ProgressView()
                            .frame(maxWidth: .infinity, alignment: .center)
                    } else {
                        Text("login.createaccount")
                            .frame(maxWidth: .infinity, alignment: .center)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(isLoading || !isValid)
            }
        }
        .navigationTitle("login.createaccount")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("signup.close") { dismiss() }
            }
        }
    }

    // MARK: - Validation (tous les champs requis)
    private var isValid: Bool {
        let emailTrim = email.trimmingCharacters(in: .whitespacesAndNewlines)
        return !emailTrim.isEmpty
            && emailTrim.contains("@")
            && !firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !lastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && password.count >= 6
            && password == confirmPassword
            //&& !localPhone.isEmpty
    }

    // MARK: - Actions
    private func createAccount() async {
        errorText = nil
        successText = nil
        isLoading = true
        defer { isLoading = false }
        do {
            let res = try await APIClient.shared.signup(
                email: email,
                password: password,
                firstName: nilIfEmpty(firstName),
                lastName: nilIfEmpty(lastName),
                phone: normalizedInternational // +indicatif + numéro sans 0
            )
            successText = "Compte créé. Un e-mail d’activation vous a été envoyé."
            if let devURL = res.activation_url {
                successText = "Compte créé. Activez via :\n\(devURL)"
            }
        } catch {
            if case APIError.http(let code) = error, code == 409 {
                errorText = "Cet e-mail est déjà utilisé."
            } else {
                errorText = (error as? LocalizedError)?.errorDescription ?? "Échec de l’inscription."
            }
        }
    }

    // MARK: - Helpers
    private var normalizedInternational: String {
        selectedCountry.dialCode + localPhone
    }

    private func nilIfEmpty(_ s: String) -> String? {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }

    // MARK: - UI helpers
    @ViewBuilder
    private func passwordField(title: String,
                               text: Binding<String>,
                               show: Binding<Bool>) -> some View {
        HStack(spacing: 8) {
            Group {
                if show.wrappedValue {
                    TextField(title, text: text)
                } else {
                    SecureField(title, text: text)
                }
            }
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled(true)

            Button(action: { show.wrappedValue.toggle() }) {
                Image(systemName: show.wrappedValue ? "eye.slash" : "eye")
                    .imageScale(.medium)
                    .accessibilityLabel(show.wrappedValue ? .signupMaskpass : .signupShowpass)
            }
        }
    }
    
    private struct PhoneCountryMenu: View {
        @Binding var selected: Country

        var body: some View {
            Menu {
                // Le Picker à l'intérieur du Menu => la liste affiche correctement le libellé
                Picker("signup.country", selection: $selected) {
                    ForEach(CountryPhoneCodes.all) { c in
                        Text("\(c.flag)  \(c.dialCode)  \(c.name)")
                            .tag(c)
                    }
                }
                .labelsHidden()
            } label: {
                // Bouton compact (aucune valeur répétée à droite dans le Form)
                HStack(spacing: 6) {
                    Text(selected.flag)
                    Text(selected.dialCode).font(.body.monospacedDigit())
                    Image(systemName: "chevron.up.chevron.down")
                        .imageScale(.small)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(.thinMaterial, in: Capsule())
            }
        }
    }
}

