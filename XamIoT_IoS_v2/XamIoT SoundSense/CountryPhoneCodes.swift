//
//  CountryPhoneCodes.swift
//  XamIoT SoundSense
//

import Foundation

public struct Country: Identifiable, Hashable, Codable {
    public let id: String        // iso2 comme id stable
    public let name: String
    public let iso2: String      // "FR"
    public let dialCode: String  // "+33"

    public init(name: String, iso2: String, dialCode: String) {
        self.id = iso2.uppercased()
        self.name = name
        self.iso2 = iso2.uppercased()
        self.dialCode = dialCode
    }

    public var flag: String {
        Country.flagEmoji(iso2)
    }

    public static func flagEmoji(_ iso2: String) -> String {
        let base: UInt32 = 127397
        var scalars = String.UnicodeScalarView()
        for u in iso2.uppercased().unicodeScalars {
            if let scalar = UnicodeScalar(base + u.value) {
                scalars.append(scalar)
            }
        }
        return String(scalars)
    }
}

public enum CountryPhoneCodes {
    /// Liste de pays courants (à étendre si besoin)
    public static let all: [Country] = [
        // Europe
        .init(name: "France", iso2: "FR", dialCode: "+33"),
        .init(name: "Belgique", iso2: "BE", dialCode: "+32"),
        .init(name: "Suisse", iso2: "CH", dialCode: "+41"),
        .init(name: "Luxembourg", iso2: "LU", dialCode: "+352"),
        .init(name: "Monaco", iso2: "MC", dialCode: "+377"),
        .init(name: "Andorre", iso2: "AD", dialCode: "+376"),
        .init(name: "Allemagne", iso2: "DE", dialCode: "+49"),
        .init(name: "Espagne", iso2: "ES", dialCode: "+34"),
        .init(name: "Italie", iso2: "IT", dialCode: "+39"),
        .init(name: "Portugal", iso2: "PT", dialCode: "+351"),
        .init(name: "Pays-Bas", iso2: "NL", dialCode: "+31"),
        .init(name: "Royaume-Uni", iso2: "GB", dialCode: "+44"),
        .init(name: "Irlande", iso2: "IE", dialCode: "+353"),
        .init(name: "Suède", iso2: "SE", dialCode: "+46"),
        .init(name: "Norvège", iso2: "NO", dialCode: "+47"),
        .init(name: "Danemark", iso2: "DK", dialCode: "+45"),
        .init(name: "Finlande", iso2: "FI", dialCode: "+358"),
        .init(name: "Islande", iso2: "IS", dialCode: "+354"),
        .init(name: "Autriche", iso2: "AT", dialCode: "+43"),
        .init(name: "Pologne", iso2: "PL", dialCode: "+48"),
        .init(name: "Tchéquie", iso2: "CZ", dialCode: "+420"),
        .init(name: "Slovaquie", iso2: "SK", dialCode: "+421"),
        .init(name: "Hongrie", iso2: "HU", dialCode: "+36"),
        .init(name: "Roumanie", iso2: "RO", dialCode: "+40"),
        .init(name: "Bulgarie", iso2: "BG", dialCode: "+359"),
        .init(name: "Grèce", iso2: "GR", dialCode: "+30"),
        .init(name: "Croatie", iso2: "HR", dialCode: "+385"),
        .init(name: "Slovénie", iso2: "SI", dialCode: "+386"),
        .init(name: "Serbie", iso2: "RS", dialCode: "+381"),
        .init(name: "Bosnie-Herzégovine", iso2: "BA", dialCode: "+387"),
        .init(name: "Monténégro", iso2: "ME", dialCode: "+382"),
        .init(name: "Macédoine du Nord", iso2: "MK", dialCode: "+389"),
        .init(name: "Albanie", iso2: "AL", dialCode: "+355"),
        .init(name: "Turquie", iso2: "TR", dialCode: "+90"),
        // Amériques
        .init(name: "États-Unis", iso2: "US", dialCode: "+1"),
        .init(name: "Canada", iso2: "CA", dialCode: "+1"),
        .init(name: "Mexique", iso2: "MX", dialCode: "+52"),
        .init(name: "Brésil", iso2: "BR", dialCode: "+55"),
        .init(name: "Argentine", iso2: "AR", dialCode: "+54"),
        .init(name: "Chili", iso2: "CL", dialCode: "+56"),
        .init(name: "Colombie", iso2: "CO", dialCode: "+57"),
        .init(name: "Pérou", iso2: "PE", dialCode: "+51"),
        .init(name: "Uruguay", iso2: "UY", dialCode: "+598"),
        .init(name: "Venezuela", iso2: "VE", dialCode: "+58"),
        .init(name: "République dominicaine", iso2: "DO", dialCode: "+1"),
        .init(name: "Guadeloupe", iso2: "GP", dialCode: "+590"),
        .init(name: "Martinique", iso2: "MQ", dialCode: "+596"),
        .init(name: "Guyane", iso2: "GF", dialCode: "+594"),
        // Afrique
        .init(name: "Maroc", iso2: "MA", dialCode: "+212"),
        .init(name: "Algérie", iso2: "DZ", dialCode: "+213"),
        .init(name: "Tunisie", iso2: "TN", dialCode: "+216"),
        .init(name: "Sénégal", iso2: "SN", dialCode: "+221"),
        .init(name: "Côte d’Ivoire", iso2: "CI", dialCode: "+225"),
        .init(name: "Cameroun", iso2: "CM", dialCode: "+237"),
        .init(name: "Bénin", iso2: "BJ", dialCode: "+229"),
        .init(name: "Mali", iso2: "ML", dialCode: "+223"),
        .init(name: "Burkina Faso", iso2: "BF", dialCode: "+226"),
        .init(name: "Togo", iso2: "TG", dialCode: "+228"),
        .init(name: "Gabon", iso2: "GA", dialCode: "+241"),
        .init(name: "RD Congo", iso2: "CD", dialCode: "+243"),
        .init(name: "Congo", iso2: "CG", dialCode: "+242"),
        .init(name: "Madagascar", iso2: "MG", dialCode: "+261"),
        .init(name: "Maurice", iso2: "MU", dialCode: "+230"),
        .init(name: "Seychelles", iso2: "SC", dialCode: "+248"),
        .init(name: "Afrique du Sud", iso2: "ZA", dialCode: "+27"),
        // Asie / Océanie
        .init(name: "Chine", iso2: "CN", dialCode: "+86"),
        .init(name: "Japon", iso2: "JP", dialCode: "+81"),
        .init(name: "Corée du Sud", iso2: "KR", dialCode: "+82"),
        .init(name: "Inde", iso2: "IN", dialCode: "+91"),
        .init(name: "Indonésie", iso2: "ID", dialCode: "+62"),
        .init(name: "Malaisie", iso2: "MY", dialCode: "+60"),
        .init(name: "Singapour", iso2: "SG", dialCode: "+65"),
        .init(name: "Thaïlande", iso2: "TH", dialCode: "+66"),
        .init(name: "Viêt Nam", iso2: "VN", dialCode: "+84"),
        .init(name: "Philippines", iso2: "PH", dialCode: "+63"),
        .init(name: "Hong Kong", iso2: "HK", dialCode: "+852"),
        .init(name: "Taïwan", iso2: "TW", dialCode: "+886"),
        .init(name: "Émirats arabes unis", iso2: "AE", dialCode: "+971"),
        .init(name: "Arabie saoudite", iso2: "SA", dialCode: "+966"),
        .init(name: "Qatar", iso2: "QA", dialCode: "+974"),
        .init(name: "Koweït", iso2: "KW", dialCode: "+965"),
        .init(name: "Australie", iso2: "AU", dialCode: "+61"),
        .init(name: "Nouvelle-Zélande", iso2: "NZ", dialCode: "+64")
    ]

    /// FR par défaut si présent, sinon premier élément.
    public static var defaultCountry: Country {
        all.first(where: { $0.iso2 == "FR" }) ?? all[0]
    }
}

