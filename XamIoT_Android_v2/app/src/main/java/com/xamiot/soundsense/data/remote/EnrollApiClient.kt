package com.xamiot.soundsense.data.remote

import com.xamiot.soundsense.MyApplication
import com.xamiot.soundsense.utils.ServerConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class EnrollApiClient {

    data class CreatedDevice(
        val id: String,
        val espUid: String,
        val name: String,
        val topicPrefix: String
    )

    private val base get() = ServerConfig.getBaseUrl(MyApplication.instance).trimEnd('/')

    /**
     * POST /esp-devices
     * Body: esp_uid, name, topic_prefix, mqtt_password
     * (comme ton iOS) :contentReference[oaicite:6]{index=6}
     */
    suspend fun createEspDevice(
        token: String,
        espUid: String,
        name: String,
        topicPrefix: String,
        mqttPassword: String
    ): CreatedDevice = withContext(Dispatchers.IO) {

        val url = URL("$base/esp-devices")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Authorization", "Bearer $token")
            doOutput = true
            connectTimeout = 12_000
            readTimeout = 12_000
        }

        val body = JSONObject()
            .put("esp_uid", espUid)
            .put("name", name)
            .put("topic_prefix", topicPrefix)
            .put("mqtt_password", mqttPassword)

        OutputStreamWriter(conn.outputStream).use { it.write(body.toString()) }

        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val txt = stream.bufferedReader().use { it.readText() }

        if (code !in 200..299) {
            throw IllegalStateException("API error $code: $txt")
        }

        val json = JSONObject(txt)
        // l’API renvoie id (string ou int parfois) côté iOS tu gères les 2 :contentReference[oaicite:7]{index=7}
        val idAny = json.get("id")
        val id = idAny.toString()

        CreatedDevice(
            id = id,
            espUid = json.optString("esp_uid", espUid),
            name = json.optString("name", name),
            topicPrefix = json.optString("topic_prefix", topicPrefix)
        )
    }
}
