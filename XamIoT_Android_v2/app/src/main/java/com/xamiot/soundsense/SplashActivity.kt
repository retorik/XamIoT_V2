package com.xamiot.soundsense

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.animation.AnimationUtils
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.xamiot.soundsense.data.repository.AuthRepository
import com.xamiot.soundsense.ui.auth.LoginActivity

import android.os.Build
import android.app.Activity


/**
 * SplashActivity - Écran de démarrage de l'application
 * Affiche le logo avec animation pendant 3 secondes puis redirige vers :
 * - MainActivity si l'utilisateur est déjà connecté
 * - LoginActivity si l'utilisateur n'est pas connecté
 */
class SplashActivity : AppCompatActivity() {

    companion object {
        // Durée d'affichage du splash screen en millisecondes
        private const val SPLASH_DURATION = 3000L
    }

    private lateinit var authRepository: AuthRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_splash)

        // Masquer la barre d'action
        supportActionBar?.hide()

        // Initialiser le repository d'authentification
        authRepository = AuthRepository(this)

        // Récupérer les vues
        val logo = findViewById<ImageView>(R.id.splashLogo)
        val appName = findViewById<TextView>(R.id.appName)
        val slogan = findViewById<TextView>(R.id.appSlogan)

        // Charger et appliquer l'animation fade in
        val fadeIn = AnimationUtils.loadAnimation(this, R.anim.fade_in)
        logo.startAnimation(fadeIn)
        appName.startAnimation(fadeIn)
        slogan.startAnimation(fadeIn)

        // Naviguer vers l'écran approprié après le délai
        Handler(Looper.getMainLooper()).postDelayed({
            navigateToNextScreen()
        }, SPLASH_DURATION)
    }

    /**
     * Navigue vers l'écran approprié en fonction de l'état de connexion
     */
    private fun navigateToNextScreen() {
        val intent = if (authRepository.isLoggedIn()) {
            // L'utilisateur est connecté → aller vers MainActivity
            Intent(this, MainActivity::class.java)
        } else {
            // L'utilisateur n'est pas connecté → aller vers LoginActivity
            Intent(this, LoginActivity::class.java)
        }

        // Démarrer l'activité suivante
        startActivity(intent)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            overrideActivityTransition(
                Activity.OVERRIDE_TRANSITION_OPEN,
                android.R.anim.fade_in,
                android.R.anim.fade_out
            )
        } else {
            @Suppress("DEPRECATION")
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
        }
        finish()
    }

    /**
     * Désactiver le bouton retour sur le splash screen
     * Empêche l'utilisateur de quitter l'app pendant le chargement
     */
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // Ne rien faire - bloque le bouton retour pendant le splash
    }
}
