package com.xamiot.soundsense.ui.auth

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import com.xamiot.soundsense.MainActivity
import com.xamiot.soundsense.R
import com.xamiot.soundsense.utils.ApiError
import com.xamiot.soundsense.utils.ApiResult
import com.xamiot.soundsense.utils.ServerConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * Activity de connexion
 */
class LoginActivity : AppCompatActivity() {

    companion object {
        private const val FORGOT_PASSWORD_PATH = "auth/forgot-password"
        private const val LOGO_TAP_TARGET = 5
        private const val LOGO_TAP_RESET_MS = 3000L
    }

    // ViewModel
    private val viewModel: LoginViewModel by viewModels()

    // Vues
    private lateinit var tilEmail: TextInputLayout
    private lateinit var etEmail: TextInputEditText
    private lateinit var tilPassword: TextInputLayout
    private lateinit var etPassword: TextInputEditText
    private lateinit var btnLogin: MaterialButton
    private lateinit var progressBar: View
    private lateinit var logoImageView: ImageView
    private lateinit var versionTextView: TextView

    // 5-tap sur le logo
    private var logoTapCount = 0
    private val logoTapHandler = Handler(Looper.getMainLooper())
    private val resetLogoTaps = Runnable { logoTapCount = 0 }

    // Regex simple & robuste côté client (comme iOS)
    private val emailRegex = Regex(
        pattern = "^[A-Z0-9._%+\\-]+@[A-Z0-9.\\-]+\\.[A-Z]{2,}$",
        option = RegexOption.IGNORE_CASE
    )

    private var pendingNavigateToMain = false

    private val notifPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { _ ->
            if (pendingNavigateToMain) {
                pendingNavigateToMain = false
                navigateToMain()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)
        initViews()
        setupObservers()
        setupListeners()
    }

    private fun initViews() {
        tilEmail = findViewById(R.id.emailInputLayout)
        etEmail = findViewById(R.id.emailEditText)
        tilPassword = findViewById(R.id.passwordInputLayout)
        etPassword = findViewById(R.id.passwordEditText)
        btnLogin = findViewById(R.id.loginButton)
        progressBar = findViewById(R.id.progressBar)
        logoImageView = findViewById(R.id.logoImageView)
        versionTextView = findViewById(R.id.versionTextView)
        setupVersionLabel()
    }

    private fun setupVersionLabel() {
        try {
            val info = packageManager.getPackageInfo(packageName, 0)
            val version = info.versionName ?: "?"
            val build = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P)
                info.longVersionCode.toInt()
            else
                @Suppress("DEPRECATION") info.versionCode
            versionTextView.text = "$version ($build)"
        } catch (_: Exception) { }
    }

    private fun setupObservers() {
        viewModel.loginState.observe(this) { result ->
            when (result) {
                is ApiResult.Loading -> showLoading(true)
                is ApiResult.Success<*> -> {
                    showLoading(false)
                    viewModel.resetLoginState()
                    handleLoginSuccess()
                }
                is ApiResult.Error -> {
                    showLoading(false)
                    handleLoginError(result.error)
                }
                null -> showLoading(false)
            }
        }
        viewModel.emailError.observe(this) { error -> tilEmail.error = error }
        viewModel.passwordError.observe(this) { error -> tilPassword.error = error }
    }

    private fun setupListeners() {
        btnLogin.setOnClickListener {
            val email = etEmail.text.toString()
            val password = etPassword.text.toString()
            viewModel.login(email, password)
        }

        // 5 taps sur le logo → sélecteur de serveur
        logoImageView.setOnClickListener {
            logoTapHandler.removeCallbacks(resetLogoTaps)
            logoTapCount++
            if (logoTapCount >= LOGO_TAP_TARGET) {
                logoTapCount = 0
                showServerPickerDialog()
            } else {
                logoTapHandler.postDelayed(resetLogoTaps, LOGO_TAP_RESET_MS)
            }
        }

        // Lien mot de passe oublié
        findViewById<View>(R.id.forgotPasswordTextView).setOnClickListener {
            val trimmed = etEmail.text?.toString()?.trim().orEmpty()
            when {
                trimmed.isEmpty() -> {
                    tilEmail.error = "Veuillez saisir votre e-mail de compte."
                    Toast.makeText(this, "Veuillez saisir votre e-mail de compte.", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
                !isValidEmail(trimmed) -> {
                    tilEmail.error = "Adresse e-mail invalide."
                    Toast.makeText(this, "Adresse e-mail invalide.", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
                else -> tilEmail.error = null
            }
            lifecycleScope.launch {
                showLoading(true)
                try {
                    withContext(Dispatchers.IO) { requestPasswordReset(trimmed) }
                    Toast.makeText(
                        this@LoginActivity,
                        "Si un compte existe pour cet e-mail, un message vient d'être envoyé.",
                        Toast.LENGTH_LONG
                    ).show()
                } catch (_: Exception) {
                    Toast.makeText(
                        this@LoginActivity,
                        "Impossible d'envoyer la demande pour le moment. Réessayez.",
                        Toast.LENGTH_LONG
                    ).show()
                } finally {
                    showLoading(false)
                }
            }
        }

        // Lien création de compte
        findViewById<View>(R.id.signupTextView).setOnClickListener {
            startActivity(Intent(this, SignupActivity::class.java))
        }

        etEmail.setOnFocusChangeListener { _, hasFocus -> if (hasFocus) tilEmail.error = null }
        etPassword.setOnFocusChangeListener { _, hasFocus -> if (hasFocus) tilPassword.error = null }
    }

    // =============================================
    // SÉLECTEUR DE SERVEUR (dev tool)
    // =============================================

    private fun showServerPickerDialog() {
        val options = arrayOf(
            "Production  (api.xamiot.com)",
            "Debug VPS  (apixam.holiceo.com)"
        )
        val checkedItem = if (ServerConfig.isLocal(this)) 1 else 0

        MaterialAlertDialogBuilder(this, R.style.Theme_SoundSense_Dialog)
            .setTitle("Serveur API — actuel : ${if (checkedItem == 1) "DEV" else "PROD"}")
            .setSingleChoiceItems(options, checkedItem) { dialog, which ->
                val selected = if (which == 1) ServerConfig.LOCAL else ServerConfig.PRODUCTION
                if (selected == ServerConfig.getBaseUrl(this)) {
                    dialog.dismiss()
                    return@setSingleChoiceItems
                }
                ServerConfig.setBaseUrl(this, selected)
                dialog.dismiss()
                val label = if (which == 1) "DEV (apixam.holiceo.com)" else "PROD (api.xamiot.com)"
                Toast.makeText(this, "Serveur → $label\nRedémarrage…", Toast.LENGTH_LONG).show()
                Handler(Looper.getMainLooper()).postDelayed({ restartApp() }, 1200)
            }
            .setNegativeButton("Annuler", null)
            .show()
    }

    private fun restartApp() {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: return
        val restartIntent = Intent.makeRestartActivityTask(launchIntent.component)
        startActivity(restartIntent)
        Runtime.getRuntime().exit(0)
    }

    // =============================================

    private fun isValidEmail(value: String): Boolean = emailRegex.matches(value.trim())

    private fun requestPasswordReset(email: String) {
        val baseUrl = ServerConfig.getBaseUrl(this)
        val url = URL(baseUrl + FORGOT_PASSWORD_PATH)
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 10_000
            readTimeout = 10_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
        }
        val payload = JSONObject().apply { put("email", email.trim()) }
        OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(payload.toString()) }
        val code = conn.responseCode
        if (code !in 200..299) throw RuntimeException("HTTP $code")
        conn.inputStream.bufferedReader().use(BufferedReader::readText)
        conn.disconnect()
    }

    private fun showLoading(isLoading: Boolean) {
        progressBar.visibility = if (isLoading) View.VISIBLE else View.GONE
        btnLogin.isEnabled = !isLoading
        etEmail.isEnabled = !isLoading
        etPassword.isEnabled = !isLoading
    }

    private fun handleLoginSuccess() {
        Toast.makeText(this, R.string.login_success, Toast.LENGTH_SHORT).show()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this, Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) {
                pendingNavigateToMain = true
                notifPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                return
            }
        }
        navigateToMain()
    }

    private fun navigateToMain() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }

    private fun handleLoginError(error: ApiError) {
        Toast.makeText(this, error.toUserMessage(), Toast.LENGTH_LONG).show()
    }

    override fun onDestroy() {
        super.onDestroy()
        logoTapHandler.removeCallbacks(resetLogoTaps)
        viewModel.resetLoginState()
    }
}
