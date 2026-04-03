package com.xamiot.soundsense

import android.app.Application
import com.xamiot.soundsense.push.NotificationHelper
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class MyApplication : Application() {

    companion object {
        lateinit var instance: MyApplication
            private set
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        NotificationHelper.ensureChannels(this)
    }
}
