package com.unsolo.app.ui.profile

import android.annotation.SuppressLint
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.unsolo.app.ui.components.DetailTopBar
import com.unsolo.app.ui.nav.AppNav
import com.unsolo.app.ui.theme.Pc

/**
 * Privacy, Terms and Refund policy inside the app: the unsolo.in page in a plain view (no browser
 * chrome). Links to other unsolo.in pages stay here; anything else opens outside.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun LegalScreen(page: String, nav: AppNav) {
    val c = Pc.colors
    var loading by remember { mutableStateOf(true) }
    val title = when (page) { "privacy" -> "Privacy policy"; "terms" -> "Terms"; else -> "Refund policy" }
    Column(Modifier.fillMaxSize().background(c.paper)) {
        DetailTopBar(title, onBack = { nav.back() }, headerActions = false)
        if (loading) LinearProgressIndicator(Modifier.fillMaxWidth().height(2.dp), color = c.gold, trackColor = c.tonal)
        AndroidView(factory = { ctx ->
            WebView(ctx).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                        val host = request.url.host
                        if (host == "unsolo.in" || host == "www.unsolo.in") return false
                        nav.openUrl(request.url.toString()); return true
                    }
                    override fun onPageFinished(view: WebView?, url: String?) { loading = false }
                }
                loadUrl("https://unsolo.in/$page")
            }
        }, modifier = Modifier.fillMaxSize())
    }
}
