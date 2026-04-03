package com.xamiot.soundsense.data.api

import com.xamiot.soundsense.MyApplication
import com.xamiot.soundsense.utils.ServerConfig
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * Singleton pour gérer l'instance Retrofit
 */
object ApiClient {

    /**
     * Configuration du client HTTP avec intercepteurs
     */
    private val okHttpClient: OkHttpClient by lazy {
        val loggingInterceptor = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }

        OkHttpClient.Builder()
            .addInterceptor(loggingInterceptor)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    /**
     * Instance Retrofit configurée — URL lue depuis ServerConfig au démarrage.
     * Le changement de serveur nécessite un redémarrage de l'app (géré dans LoginActivity).
     */
    private val retrofit: Retrofit by lazy {
        Retrofit.Builder()
            .baseUrl(ServerConfig.getBaseUrl(MyApplication.instance))
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }

    /**
     * Instance du service API
     */
    val apiService: ApiService by lazy {
        retrofit.create(ApiService::class.java)
    }
}
