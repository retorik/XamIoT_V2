package com.xamiot.soundsense.ui.auth

import com.xamiot.soundsense.MyApplication
import com.xamiot.soundsense.utils.ServerConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

data class ForgotPasswordResponse(
    val ok: Boolean? = null
)

class ForgotPasswordService {

    companion object {
        private const val PATH = "auth/forgot-password"
    }

    suspend fun requestReset(email: String): ForgotPasswordResponse = withContext(Dispatchers.IO) {
        val url = URL(ServerConfig.getBaseUrl(MyApplication.instance) + PATH)
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15000
            readTimeout = 15000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Accept", "application/json")
        }

        val payload = JSONObject().apply {
            put("email", email.trim())
        }

        conn.outputStream.use { os ->
            os.write(payload.toString().toByteArray(Charsets.UTF_8))
        }

        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val body = stream?.use { s ->
            BufferedReader(InputStreamReader(s)).use { it.readText() }
        }

        // ⚠️ Comme côté iOS : si HTTP pas OK => erreur
        if (code !in 200..299) {
            throw HttpError(code, body)
        }

        // On parse si jamais le backend renvoie quelque chose
        val json = try { JSONObject(body ?: "{}") } catch (_: Exception) { JSONObject() }
        ForgotPasswordResponse(ok = json.optBoolean("ok"))
    }
}
