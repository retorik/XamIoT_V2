XamIoT SoundSense – iOS Skeleton (Splash, Login, Devices, Rules, Push logs)
===========================================================================

Contenu:
- Info.plist
- XamIoT_SoundSenseApp.swift
- Models.swift
- APIClient.swift
- SessionStore.swift
- KeychainHelper.swift
- NotificationManager.swift (inclut AppDelegate + LogStore)
- SplashView.swift
- LoginView.swift
- DevicesListView.swift
- DeviceRowView.swift
- DeviceDetailView.swift
- Utils.swift

Intégration dans Xcode:
1) Glissez tous les .swift dans votre groupe d'app et cochez la target.
2) Remplacez le contenu de votre XamIoT_SoundSenseApp.swift par celui fourni.
3) Ajoutez/mergez le Info.plist (ou copiez les clés nécessaires dans votre plist existant).
4) Activez les capabilities: Push Notifications (APNS) et Background Modes: Remote notifications + Bluetooth LE.
5) Build & run (iOS 17+ recommandé).

Backend:
- Auth: POST https://api.xamiot.com/auth/login (email/password) -> token
- Devices: GET  https://api.xamiot.com/esp-devices (Authorization: Bearer <token>)
- Rules:   GET  https://api.xamiot.com/esp-rules?esp_id=<id> (Authorization: Bearer <token>)

Notes:
- Les notifications reçues (APNS) sont journalisées (dernier message par device affiché dans la liste).
- SwiftData @Model nécessite iOS 17+ / Xcode 15+.
