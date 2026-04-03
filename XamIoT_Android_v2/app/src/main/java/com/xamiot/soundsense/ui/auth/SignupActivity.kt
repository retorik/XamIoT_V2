package com.xamiot.soundsense.ui.auth

import android.os.Bundle
import android.view.View
import android.widget.TextView
import android.widget.Toast
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import com.xamiot.soundsense.R

class SignupActivity : AppCompatActivity() {

    private val viewModel: SignupViewModel by viewModels()

    private lateinit var tilEmail: TextInputLayout
    private lateinit var etEmail: TextInputEditText

    private lateinit var tilPassword: TextInputLayout
    private lateinit var etPassword: TextInputEditText

    private lateinit var tilConfirmPassword: TextInputLayout
    private lateinit var etConfirmPassword: TextInputEditText

    private lateinit var tilFirstName: TextInputLayout
    private lateinit var etFirstName: TextInputEditText

    private lateinit var tilLastName: TextInputLayout
    private lateinit var etLastName: TextInputEditText

    private lateinit var tilCountryCode: TextInputLayout
    private lateinit var etCountryCode: TextInputEditText

    private lateinit var tilPhone: TextInputLayout
    private lateinit var etPhone: TextInputEditText

    private lateinit var btnCreate: MaterialButton
    private lateinit var progressBar: View

    // Optionnels (si présents dans le layout)
    private var errorText: TextView? = null
    private var successText: TextView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_signup)

        initViews()
        setupObservers()
        setupListeners()

        // UX: valeur par défaut France
        if (etCountryCode.text.isNullOrBlank()) {
            etCountryCode.setText("+33")
        }
    }

    private fun initViews() {
        tilEmail = findViewById(R.id.emailInputLayout)
        etEmail = findViewById(R.id.emailEditText)

        tilPassword = findViewById(R.id.passwordInputLayout)
        etPassword = findViewById(R.id.passwordEditText)

        tilConfirmPassword = findViewById(R.id.confirmPasswordInputLayout)
        etConfirmPassword = findViewById(R.id.confirmPasswordEditText)

        tilFirstName = findViewById(R.id.firstNameInputLayout)
        etFirstName = findViewById(R.id.firstNameEditText)

        tilLastName = findViewById(R.id.lastNameInputLayout)
        etLastName = findViewById(R.id.lastNameEditText)

        tilCountryCode = findViewById(R.id.countryCodeInputLayout)
        etCountryCode = findViewById(R.id.countryCodeEditText)

        tilPhone = findViewById(R.id.phoneInputLayout)
        etPhone = findViewById(R.id.phoneEditText)

        btnCreate = findViewById(R.id.createAccountButton)
        progressBar = findViewById(R.id.progressBar)

        // Optionnels
        errorText = findViewById(R.id.errorTextView)
        successText = findViewById(R.id.successTextView)
    }

    private fun setupObservers() {
        // Etat global (idle/loading/success/error)
        viewModel.uiState.observe(this) { state ->
            when (state) {
                is SignupUiState.Idle -> {
                    showLoading(false)
                    errorText?.visibility = View.GONE
                    successText?.visibility = View.GONE
                }

                is SignupUiState.Loading -> {
                    showLoading(true)
                    errorText?.visibility = View.GONE
                    successText?.visibility = View.GONE
                }

                is SignupUiState.Success -> {
                    showLoading(false)
                    successText?.visibility = View.VISIBLE
                    errorText?.visibility = View.GONE

                    val msg = if (state.emailSent) {
                        "Compte créé. Un e-mail d’activation vous a été envoyé."
                    } else {
                        "Compte créé."
                    }

                    Toast.makeText(this, msg, Toast.LENGTH_LONG).show()

                    // Retour au login
                    finish()
                }

                is SignupUiState.Error -> {
                    showLoading(false)
                    successText?.visibility = View.GONE
                    errorText?.visibility = View.VISIBLE
                    Toast.makeText(this, state.message, Toast.LENGTH_LONG).show()
                }
            }
        }

        // Erreurs de champs (validation)
        viewModel.emailError.observe(this) { tilEmail.error = it }
        viewModel.passwordError.observe(this) { tilPassword.error = it }
        viewModel.confirmPasswordError.observe(this) { tilConfirmPassword.error = it }
        viewModel.firstNameError.observe(this) { tilFirstName.error = it }
        viewModel.lastNameError.observe(this) { tilLastName.error = it }
        viewModel.countryCodeError.observe(this) { tilCountryCode.error = it }
        viewModel.phoneError.observe(this) { tilPhone.error = it }
    }

    private fun setupListeners() {
        btnCreate.setOnClickListener {
            val form = SignupForm(
                email = etEmail.text?.toString().orEmpty(),
                password = etPassword.text?.toString().orEmpty(),
                confirmPassword = etConfirmPassword.text?.toString().orEmpty(),
                firstName = etFirstName.text?.toString().orEmpty(),
                lastName = etLastName.text?.toString().orEmpty(),
                countryCode = etCountryCode.text?.toString().orEmpty(),
                localPhone = etPhone.text?.toString().orEmpty()
            )
            viewModel.signup(form)
        }

        // Clear erreurs au focus
        etEmail.setOnFocusChangeListener { _, hasFocus -> if (hasFocus) tilEmail.error = null }
        etPassword.setOnFocusChangeListener { _, hasFocus -> if (hasFocus) tilPassword.error = null }
        etConfirmPassword.setOnFocusChangeListener { _, hasFocus -> if (hasFocus) tilConfirmPassword.error = null }
        etFirstName.setOnFocusChangeListener { _, hasFocus -> if (hasFocus) tilFirstName.error = null }
        etLastName.setOnFocusChangeListener { _, hasFocus -> if (hasFocus) tilLastName.error = null }
        etCountryCode.setOnFocusChangeListener { _, hasFocus -> if (hasFocus) tilCountryCode.error = null }
        etPhone.setOnFocusChangeListener { _, hasFocus -> if (hasFocus) tilPhone.error = null }
    }

    private fun showLoading(isLoading: Boolean) {
        progressBar.visibility = if (isLoading) View.VISIBLE else View.GONE
        btnCreate.isEnabled = !isLoading

        etEmail.isEnabled = !isLoading
        etPassword.isEnabled = !isLoading
        etConfirmPassword.isEnabled = !isLoading
        etFirstName.isEnabled = !isLoading
        etLastName.isEnabled = !isLoading
        etCountryCode.isEnabled = !isLoading
        etPhone.isEnabled = !isLoading
    }
}
