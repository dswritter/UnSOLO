package com.unsolo.app.ui.components

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import com.google.android.gms.auth.api.phone.SmsRetriever
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Status
import com.unsolo.app.core.auth.SmsOtp
import com.unsolo.app.core.demo.DemoMode

/**
 * Auto-fills the SMS code using the Google Play services SMS User Consent API: no READ_SMS permission
 * and no app hash (the DLT template text is fixed). While [active], it listens for one incoming SMS;
 * the user taps Allow, and [onCode] gets the 4-digit code. Change [restartKey] (e.g. the challenge, or a
 * resend counter) to listen again: the listener times out after 5 minutes.
 *
 * Degrades quietly: demo mode, no Play services or a declined consent dialog leave manual entry working.
 */
@Composable
fun SmsCodeAutofill(active: Boolean, restartKey: Any?, onCode: (String) -> Unit) {
    val ctx = LocalContext.current
    val onCodeNow by rememberUpdatedState(onCode)
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        if (res.resultCode == Activity.RESULT_OK) {
            SmsOtp.extract(res.data?.getStringExtra(SmsRetriever.EXTRA_SMS_MESSAGE))?.let { onCodeNow(it) }
        }
    }
    val launcherNow by rememberUpdatedState(launcher)
    DisposableEffect(active, restartKey) {
        if (!active || DemoMode.enabled) return@DisposableEffect onDispose { }
        var receiver: BroadcastReceiver? = null
        runCatching {
            val r = object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) {
                    if (intent.action != SmsRetriever.SMS_RETRIEVED_ACTION) return
                    val status = intent.extras?.get(SmsRetriever.EXTRA_STATUS) as? Status ?: return
                    if (status.statusCode != CommonStatusCodes.SUCCESS) return
                    @Suppress("DEPRECATION")
                    val consent: Intent? = intent.extras?.getParcelable(SmsRetriever.EXTRA_CONSENT_INTENT)
                    if (consent != null) runCatching { launcherNow.launch(consent) }
                }
            }
            // The Play services broadcast comes from another app, so on Android 13+ this must be exported.
            ContextCompat.registerReceiver(ctx, r, IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION), SmsRetriever.SEND_PERMISSION, null, ContextCompat.RECEIVER_EXPORTED)
            receiver = r
            SmsRetriever.getClient(ctx).startSmsUserConsent(null).addOnFailureListener { }
        }
        onDispose { receiver?.let { runCatching { ctx.unregisterReceiver(it) } } }
    }
}

/**
 * Compose's `ContentType.SmsOtpCode` is internal in the Compose version we ship (BOM 2024.12), so there is
 * no autofill semantics yet: the SMS User Consent flow above does the filling. Kept as a no-op so call
 * sites switch on automatically once the API is public.
 */
fun androidx.compose.ui.Modifier.smsOtpContentType(): androidx.compose.ui.Modifier = this
