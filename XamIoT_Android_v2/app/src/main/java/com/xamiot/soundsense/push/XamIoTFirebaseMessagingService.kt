package com.xamiot.soundsense.push

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.xamiot.soundsense.data.local.TokenManager
import com.xamiot.soundsense.data.repository.AuthRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class XamIoTFirebaseMessagingService : FirebaseMessagingService() {

    private val job = SupervisorJob()
    private val scope = CoroutineScope(job + Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)

        val tokenManager = TokenManager(applicationContext)
        val authRepo = AuthRepository(applicationContext)

        tokenManager.saveFcmToken(token)
        Log.i(TAG, "FCM token refreshed: ${token.take(20)}...")

        if (tokenManager.isLoggedIn()) {
            scope.launch {
                val ok = authRepo.registerSmartphoneIfNeeded(token)
                Log.i(TAG, "registerSmartphoneIfNeeded(onNewToken) => $ok")
            }
        } else {
            Log.i(TAG, "Utilisateur non connecté, register au prochain login.")
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        // 1) Récupérer title/body (support "notification" + "data")
        val title = message.notification?.title
            ?: message.data["title"]
            ?: "XamIoT SoundSense !"

        val body = message.notification?.body
            ?: message.data["body"]
            ?: "Nouvelle alerte."

        Log.i(TAG, "FCM message received. title=$title body=$body data=${message.data}")

        // 2) Afficher une notification Android
        NotificationHelper.showAlertNotification(
            context = applicationContext,
            title = title,
            body = body
        )
    }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }

    companion object {
        private const val TAG = "XamIoTFcmService"
    }
}
