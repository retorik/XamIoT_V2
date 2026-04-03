import SwiftUI

struct DeviceRowView: View {
    let device: ESPDevice

    var body: some View {
        // Réévalue la vue toutes les 1 s sans appel réseau
        TimelineView(.periodic(from: .now, by: 1)) { context in
            content(now: context.date)
        }
    }

    @ViewBuilder
    private func content(now: Date) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "dot.radiowaves.left.and.right")
                .imageScale(.large)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(device.name).font(.headline)
                    Spacer()

                    // 🕒 Délai "depuis la dernière donnée" en s (<60) puis en m (≥60)
                    if let lastSeen = device.lastSeen {
                        Text(elapsedString(since: lastSeen, now: now))
                            .font(.footnote.monospacedDigit())
                            .foregroundStyle(.secondary)
                            .accessibilityLabel(elapsedA11yString(since: lastSeen, now: now))
                    }
                }

                Text("UID: \(device.espUID)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                // 📈 Sparkline des 30 dernières mesures sonores
                SoundSparkline(values: device.soundHistory)
                    .padding(.top, 2)

                // 🔔 Dernière notification
                if device.lastNotificationText != nil || device.lastNotificationAt != nil {
                    HStack(spacing: 6) {
                        Image(systemName: "bell.badge.waveform")
                        Text(device.lastNotificationText ?? "—")
                            .lineLimit(1)
                        Spacer()
                        if let at = device.lastNotificationAt {
                            Text(elapsedString(since: at, now: now))
                                .font(.footnote.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                    }
                    .font(.footnote)
                }
            }
        }
        .padding(.vertical, 6)
    }

    // MARK: - Formatage
    private func elapsedString(since date: Date, now: Date) -> String {
        let s = max(0, Int(now.timeIntervalSince(date)))
        if s < 60 { return "\(s)s" }
        return "\(s / 60)m"
    }

    private func elapsedA11yString(since date: Date, now: Date) -> String {
        let s = max(0, Int(now.timeIntervalSince(date)))
        if s < 60 { return "il y a \(s) secondes" }
        let m = s / 60
        return "il y a \(m) minute\(m > 1 ? "s" : "")"
    }
}
