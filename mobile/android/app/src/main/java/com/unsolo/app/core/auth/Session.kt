package com.unsolo.app.core.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.unsolo.app.core.model.SupaSession
import com.unsolo.app.core.net.AppJson
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@Serializable
data class StoredSession(
    val accessToken: String,
    val refreshToken: String,
    /** Epoch seconds. */
    val expiresAt: Long,
    val userId: String? = null,
) {
    fun isExpiring(nowSec: Long = System.currentTimeMillis() / 1000) = nowSec >= expiresAt - 60
}

fun SupaSession.toStored(nowSec: Long = System.currentTimeMillis() / 1000) = StoredSession(
    accessToken = accessToken,
    refreshToken = refreshToken,
    expiresAt = expiresAt ?: (nowSec + expiresIn),
    userId = user?.id,
)

/**
 * Tokens are encrypted with an AES-256-GCM key that never leaves the Android Keystore and the
 * ciphertext is kept in a private prefs file that is excluded from backup and device transfer
 * (res/xml/data_extraction_rules.xml). Never logs or exposes token values.
 */
class TokenStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return gen.generateKey()
    }

    @Synchronized
    fun save(session: StoredSession) {
        val plain = AppJson.encodeToString(StoredSession.serializer(), session).toByteArray()
        val cipher = Cipher.getInstance(TRANSFORM).apply { init(Cipher.ENCRYPT_MODE, key()) }
        val out = cipher.iv + cipher.doFinal(plain)
        prefs.edit().putString(K_SESSION, Base64.encodeToString(out, Base64.NO_WRAP)).apply()
    }

    @Synchronized
    fun load(): StoredSession? {
        val raw = prefs.getString(K_SESSION, null) ?: return null
        return try {
            val bytes = Base64.decode(raw, Base64.NO_WRAP)
            val iv = bytes.copyOfRange(0, 12)
            val cipher = Cipher.getInstance(TRANSFORM).apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv)) }
            val plain = cipher.doFinal(bytes, 12, bytes.size - 12)
            AppJson.decodeFromString(StoredSession.serializer(), String(plain))
        } catch (e: Exception) {
            // Key invalidated (e.g. restore on a new device): drop the session, the user signs in again.
            clear(); null
        }
    }

    @Synchronized
    fun clear() { prefs.edit().remove(K_SESSION).apply() }

    private companion object {
        const val FILE = "unsolo_secure"
        const val K_SESSION = "session"
        const val KEYSTORE = "AndroidKeyStore"
        const val ALIAS = "unsolo_session_v1"
        const val TRANSFORM = "AES/GCM/NoPadding"
    }
}

/** In-memory view of the signed-in session, loaded lazily off the main thread. */
class SessionManager(private val store: TokenStore) {
    private val _session = MutableStateFlow<StoredSession?>(null)
    val session: StoredSession? get() { ensureLoaded(); return _session.value }
    val flow: StateFlow<StoredSession?> get() = _session.asStateFlow()
    @Volatile private var loaded = false

    /** Blocking disk read; call from a background thread (OkHttp thread, IO dispatcher). */
    fun ensureLoaded() {
        if (loaded) return
        synchronized(this) {
            if (!loaded) { _session.value = store.load(); loaded = true }
        }
    }

    val isSignedIn: Boolean get() = session != null

    @Synchronized
    fun update(s: StoredSession) { store.save(s); _session.value = s; loaded = true }

    @Synchronized
    fun clear() { store.clear(); _session.value = null; loaded = true }
}
