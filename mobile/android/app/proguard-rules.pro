# kotlinx.serialization: keep generated serializers and companion lookups.
-keepattributes *Annotation*, InnerClasses, Signature, Exceptions
-dontnote kotlinx.serialization.**
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.unsolo.app.**$$serializer { *; }
-keepclassmembers class com.unsolo.app.** { *** Companion; }
-keepclasseswithmembers class com.unsolo.app.** { kotlinx.serialization.KSerializer serializer(...); }
-keep @kotlinx.serialization.Serializable class com.unsolo.app.core.model.** { *; }

# Retrofit: keep service interface method signatures (suspend + generics).
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation
-keep interface com.unsolo.app.core.net.ApiService { *; }
-if interface * { @retrofit2.http.* <methods>; }
-keep,allowobfuscation interface <1>

# WorkManager instantiates workers reflectively.
-keep class * extends androidx.work.ListenableWorker { public <init>(android.content.Context, androidx.work.WorkerParameters); }

# OkHttp / Okio optional platform classes.
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# Credential Manager / Sign in with Google.
-if class androidx.credentials.CredentialManager
-keep class androidx.credentials.playservices.** { *; }
