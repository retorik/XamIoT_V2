package com.xamiot.soundsense.ui.auth

import android.util.Log
import com.xamiot.soundsense.MyApplication
import com.xamiot.soundsense.utils.ServerConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

data class SignupResponse(
    val ok: Boolean,
    val emailSent: Boolean
)

class HttpError(val code: Int, val body: String?) : Exception()

class XamiotAuthService {

    companion object {
        private const val SIGNUP_PATH = "auth/signup"
    }

    private val baseUrl get() = ServerConfig.getBaseUrl(MyApplication.instance)

    suspend fun signup(
        email: String,
        password: String,
        firstName: String?,
        lastName: String?,
        phone: String?
    ): SignupResponse = withContext(Dispatchers.IO) {

        val url = URL(baseUrl + SIGNUP_PATH)
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15000
            readTimeout = 15000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Accept", "application/json")
        }

        // Body identique à iOS (mêmes clés)
        val payload = JSONObject().apply {
            put("email", email.trim().lowercase())
            put("password", password)
            firstName?.trim()?.takeIf { it.isNotEmpty() }?.let { put("FirstName", it) }
            lastName?.trim()?.takeIf { it.isNotEmpty() }?.let { put("LastName", it) }
            phone?.trim()?.takeIf { it.isNotEmpty() }?.let { put("Phone", it) }
        }

        Log.d("XamiotAuthService", "➡️ POST $url")

        conn.outputStream.use { os ->
            os.write(payload.toString().toByteArray(Charsets.UTF_8))
        }

        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val body = stream?.use { s ->
            BufferedReader(InputStreamReader(s)).use { it.readText() }
        }

        if (code !in 200..299) {
            throw HttpError(code, body)
        }

        // Parse réponse:
        // { "ok": true, "email_sent": true }
        val json = JSONObject(body ?: "{}")
        val ok = json.optBoolean("ok", false)
        val emailSent = json.optBoolean("email_sent", false)

        SignupResponse(ok = ok, emailSent = emailSent)
    }
}
