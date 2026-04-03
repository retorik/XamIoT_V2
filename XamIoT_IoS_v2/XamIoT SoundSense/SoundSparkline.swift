import SwiftUI

/// Bar chart compact affichant jusqu'à 30 mesures soundPct (0–100).
/// - Rendu via Canvas (performant, pas de sous-vues).
/// - Chaque barre est colorée avec un dégradé vert (0 %) → rouge (100 %).
/// - Placeholder en pointillés si aucune donnée.
struct SoundSparkline: View {
    let values: [Double]

    private var recent: [Double] { Array(values.suffix(30)) }

    var body: some View {
        Group {
            if recent.isEmpty {
                placeholderView
            } else {
                barCanvas
            }
        }
        .frame(height: 28)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Historique sonore, \(recent.count) mesure\(recent.count > 1 ? "s" : "")")
    }

    // MARK: - Placeholder
    private var placeholderView: some View {
        RoundedRectangle(cornerRadius: 2)
            .stroke(
                Color.secondary.opacity(0.25),
                style: StrokeStyle(lineWidth: 1, dash: [3, 3])
            )
    }

    // MARK: - Bar chart
    private var barCanvas: some View {
        Canvas { ctx, size in
            let n      = recent.count
            let gap    = CGFloat(n > 1 ? 1 : 0)
            let barW   = (size.width - gap * CGFloat(n - 1)) / CGFloat(n)

            for (i, v) in recent.enumerated() {
                let pct    = min(max(v / 100.0, 0), 1)
                let barH   = CGFloat(pct) * size.height
                let x      = CGFloat(i) * (barW + gap)
                let y      = size.height - barH
                let rect   = CGRect(x: x, y: y, width: max(barW, 1), height: barH)

                // Dégradé vert → rouge selon la valeur de la barre
                let color  = barColor(for: pct)
                let dark   = color.opacity(0.85)
                let light  = color.opacity(0.45)

                ctx.fill(
                    Path(roundedRect: rect, cornerRadius: 1.5),
                    with: .linearGradient(
                        Gradient(colors: [dark, light]),
                        startPoint: CGPoint(x: x + barW / 2, y: y),
                        endPoint:   CGPoint(x: x + barW / 2, y: size.height)
                    )
                )
            }
        }
    }

    // MARK: - Couleur par valeur (0…1)
    /// Interpolation linéaire HSB : vert (120°) → jaune (60°) → rouge (0°)
    private func barColor(for pct: Double) -> Color {
        // hue : 0.333 (vert) → 0.0 (rouge)
        let hue = 0.333 * (1.0 - pct)
        return Color(hue: hue, saturation: 0.82, brightness: 0.88)
    }
}

// MARK: - Previews
#Preview("Données variées") {
    SoundSparkline(values: [10, 25, 40, 60, 80, 55, 30, 15, 70, 90, 45, 20, 95, 5, 50])
        .padding()
}

#Preview("Une seule mesure") {
    SoundSparkline(values: [42])
        .padding()
}

#Preview("Vide") {
    SoundSparkline(values: [])
        .padding()
}

#Preview("30 mesures") {
    SoundSparkline(values: (0..<30).map { Double($0) / 29.0 * 100.0 })
        .padding()
}
