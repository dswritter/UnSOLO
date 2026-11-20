package com.unsolo.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.lifecycleScope
import com.unsolo.app.core.push.UnsoloMessagingService
import com.unsolo.app.core.prefs.Tab
import com.unsolo.app.ui.nav.AppRoot
import com.unsolo.app.ui.nav.Routes
import com.unsolo.app.ui.theme.PassengerChartTheme
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch

/** Single activity. Start destination = the saved landing tab (local, so cold start never waits on network). */
class MainActivity : ComponentActivity() {
    private val newIntents = MutableSharedFlow<Intent>(extraBufferCapacity = 4)
    private var startRoute by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as UnsoloApp
        splash.setKeepOnScreenCondition { startRoute == null }
        lifecycleScope.launch {
            val prefs = app.graph.settings.current() // DataStore reads on its own IO dispatcher
            startRoute = when (prefs.landingTab) { Tab.TRIBE -> Routes.TRIBE; Tab.TRIPS -> Routes.TRIPS; else -> Routes.EXPLORE }
            app.graph.analytics.track("app.open", props = mapOf("coldStart" to app.coldStart, "landingTab" to prefs.landingTab))
            app.coldStart = false
        }
        handlePushOpen(intent)
        handleAuthCallback(intent)
        setContent {
            val start = startRoute
            if (start != null) PassengerChartTheme { AppRoot(app.graph, start, newIntents) }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handlePushOpen(intent)
        if (handleAuthCallback(intent)) return
        newIntents.tryEmit(intent)
    }

    /** unsolo://auth-callback?code=… from the Supabase OAuth (PKCE) fallback. */
    private fun handleAuthCallback(intent: Intent?): Boolean {
        val uri = intent?.data ?: return false
        if (uri.scheme != "unsolo" || uri.host != "auth-callback") return false
        val g = (application as UnsoloApp).graph
        val code = uri.getQueryParameter("code")
        val error = uri.getQueryParameter("error_description") ?: uri.getQueryParameter("error")
        intent.data = null
        g.appScope.launch {
            g.oauthResult.value = if (code != null) g.account.completeOAuth(code, g.pkce)
                else com.unsolo.app.core.net.ApiResult.Err(400, "auth_failed", error?.take(200) ?: "Google sign-in was cancelled.")
        }
        return true
    }

    private fun handlePushOpen(intent: Intent?) {
        val type = intent?.getStringExtra(UnsoloMessagingService.EXTRA_PUSH_TYPE) ?: return
        val g = (application as UnsoloApp).graph
        g.analytics.track("push.open", props = mapOf("type" to type))
        intent.getStringExtra(UnsoloMessagingService.EXTRA_NOTIFICATION_ID)?.let { id ->
            g.appScope.launch { g.activity.markRead(listOf(id)) }
        }
        intent.removeExtra(UnsoloMessagingService.EXTRA_PUSH_TYPE)
    }
}
