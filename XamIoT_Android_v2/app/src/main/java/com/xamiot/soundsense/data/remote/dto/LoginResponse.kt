package com.xamiot.soundsense.data.remote.dto

import com.google.gson.annotations.SerializedName

data class LoginResponse(
    @SerializedName("token")
    val token: String,

    @SerializedName("user")
    val user: User?,

    @SerializedName("userId")
    val userId: String? = null,

    @SerializedName("expiresAt")
    val expiresAt: String?
)

data class User(
    @SerializedName("id")
    val id: String,

    @SerializedName("email")
    val email: String,

    @SerializedName("firstName")
    val firstName: String?,

    @SerializedName("lastName")
    val lastName: String?
)

//Modèle pour la requête de connexion

data class LoginRequest(
    @SerializedName("email")
    val email: String,

    @SerializedName("password")
    val password: String
)
