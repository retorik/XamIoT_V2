import SwiftUI

struct SplashView: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [Color.black.opacity(0.9), Color.blue.opacity(0.6)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()
            VStack(spacing: 20) {
                Image(systemName: "waveform")
                    .font(.system(size: 72, weight: .bold))
                Text("XamIoT\nSoundSense")
                    .multilineTextAlignment(.center)
                    .font(.system(size: 34, weight: .heavy))
                ProgressView()
                    .progressViewStyle(.circular)
                    .padding(.top, 12)
            }
            .foregroundStyle(.white)
        }
    }
}
