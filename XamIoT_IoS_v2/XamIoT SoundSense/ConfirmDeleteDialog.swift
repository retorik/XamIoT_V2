import SwiftUI

/// Dialogue de confirmation de suppression centré sur l'écran.
/// Usage : `.overlay { if let item = toDelete { ConfirmDeleteDialog(...) } }`
struct ConfirmDeleteDialog: View {
    let title: String
    let message: String
    let onConfirm: () -> Void
    let onCancel: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.45)
                .ignoresSafeArea()
                .onTapGesture { onCancel() }

            VStack(spacing: 20) {
                Image(systemName: "trash.fill")
                    .font(.system(size: 36))
                    .foregroundStyle(.red)

                VStack(spacing: 6) {
                    Text(title)
                        .font(.headline)
                        .multilineTextAlignment(.center)

                    Text(message)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                HStack(spacing: 12) {
                    Button(action: onCancel) {
                        Text(LocalizedStringKey("DDV.cancel"))
                            .fontWeight(.medium)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 11)
                            .background(Color(.systemGray5))
                            .foregroundStyle(.primary)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }

                    Button(action: onConfirm) {
                        Text(LocalizedStringKey("DLV.delele"))
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 11)
                            .background(Color.red)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
            }
            .padding(24)
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .shadow(color: .black.opacity(0.25), radius: 24, x: 0, y: 8)
            .padding(.horizontal, 36)
        }
    }
}
