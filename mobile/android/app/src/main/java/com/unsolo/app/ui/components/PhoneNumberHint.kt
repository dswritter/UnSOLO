package com.unsolo.app.ui.components

import android.app.Activity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import com.google.android.gms.auth.api.identity.GetPhoneNumberHintIntentRequest
import com.google.android.gms.auth.api.identity.Identity
import com.unsolo.app.core.demo.DemoMode

/**
 * Google Play services Phone Number Hint: offers the SIM's number in a sheet, so signing in with a
 * phone is one tap instead of typing. Shown once per screen; dismissing it leaves the field to type in.
 * No permission needed. Degrades quietly without Play services or a SIM number.
 */
@Composable
fun PhoneNumberHint(enabled: Boolean, onNumber: (String) -> Unit) {
    val ctx = LocalContext.current
    val onNumberNow by rememberUpdatedState(onNumber)
    var asked by rememberSaveable { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { res ->
        if (res.resultCode == Activity.RESULT_OK) {
            runCatching { Identity.getSignInClient(ctx).getPhoneNumberFromIntent(res.data) }.getOrNull()?.let { onNumberNow(it) }
        }
    }
    LaunchedEffect(enabled) {
        if (!enabled || asked || DemoMode.enabled) return@LaunchedEffect
        asked = true
        runCatching {
            Identity.getSignInClient(ctx).getPhoneNumberHintIntent(GetPhoneNumberHintIntentRequest.builder().build())
                .addOnSuccessListener { pi -> runCatching { launcher.launch(IntentSenderRequest.Builder(pi.intentSender).build()) } }
        }
    }
}
