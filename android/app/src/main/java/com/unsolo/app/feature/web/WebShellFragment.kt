package com.unsolo.app.feature.web

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.Fragment
import com.unsolo.app.MainActivity
import com.unsolo.app.R
import com.unsolo.app.core.net.UnsoloHosts
import com.unsolo.app.core.net.UnsoloUrls
import com.unsolo.app.databinding.FragmentWebShellBinding

class WebShellFragment : Fragment(R.layout.fragment_web_shell) {

    private var binding: FragmentWebShellBinding? = null
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    // True until the very first page finishes loading. During this window we
    // show the shimmer skeleton instead of the gold progress bar so the user
    // sees structure rather than a blank screen.
    private var firstPageLoaded = false

    private val pickFilesLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val cb = filePathCallback ?: return@registerForActivityResult
            filePathCallback = null
            if (result.resultCode == Activity.RESULT_OK) {
                val data = result.data
                val clip = data?.clipData
                val uris: Array<Uri>? = when {
                    clip != null && clip.itemCount > 0 ->
                        (0 until clip.itemCount).map { clip.getItemAt(it).uri }.toTypedArray()

                    data?.data != null -> arrayOf(data.data!!)
                    else -> null
                }
                cb.onReceiveValue(uris)
            } else {
                cb.onReceiveValue(null)
            }
        }

    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onViewCreated(view: android.view.View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val b = FragmentWebShellBinding.bind(view)
        binding = b

        // ColorHighlightBuilder paints skeleton blocks in shimmer_base (zinc-700)
        // and sweeps a zinc-500 highlight — clearly visible blocks on the dark
        // zinc-950 background, matching the Facebook/Instagram skeleton pattern.
        val shimmer = com.facebook.shimmer.Shimmer.ColorHighlightBuilder()
            .setBaseColor(androidx.core.content.ContextCompat.getColor(requireContext(), R.color.shimmer_base))
            .setHighlightColor(androidx.core.content.ContextCompat.getColor(requireContext(), R.color.shimmer_highlight))
            .setDuration(1400)
            .setBaseAlpha(1f)
            .setHighlightAlpha(1f)
            .setDirection(com.facebook.shimmer.Shimmer.Direction.LEFT_TO_RIGHT)
            .setAutoStart(true)
            .build()
        b.shimmerLayout.setShimmer(shimmer)
        b.shimmerLayout.startShimmer()

        b.btnRetry.setOnClickListener {
            b.errorView.visibility = android.view.View.GONE
            firstPageLoaded = false
            b.shimmerLayout.visibility = android.view.View.VISIBLE
            b.shimmerLayout.startShimmer()
            b.webview.reload()
        }

        @SuppressLint("SetJavaScriptEnabled")
        b.webview.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            setSupportZoom(true)
            builtInZoomControls = true
            displayZoomControls = false
            loadWithOverviewMode = true
            useWideViewPort = true
            // Serve static assets (JS/CSS/images) from the HTTP disk cache when
            // available. Next.js immutable chunks carry max-age headers so they
            // are cached safely; dynamic RSC responses carry no-store so they
            // always hit the network. Net effect: faster cold starts, no stale
            // user-facing content, zero extra load on Supabase.
            cacheMode = android.webkit.WebSettings.LOAD_CACHE_ELSE_NETWORK
        }

        val pkg = requireContext().packageName
        // Strip "; wv)" and "Version/x.x" — these tokens are what Google's OAuth server
        // detects as an embedded WebView and blocks with 403 disallowed_useragent.
        // Without them the UA looks like Chrome mobile. We keep "UnsoloAndroid" so the
        // web can suppress its own bottom nav.
        val cleanedUa = b.webview.settings.userAgentString
            .replace("; wv)", ")")
            .replace(Regex(""" Version/\d+\.\d+"""), "")
        b.webview.settings.userAgentString = "$cleanedUa UnsoloAndroid/$pkg"

        // Enable Android autofill (password managers, email autocomplete).
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            b.webview.importantForAutofill = android.view.View.IMPORTANT_FOR_AUTOFILL_YES
        }

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(b.webview, true)

        b.webview.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (UnsoloHosts.shouldLaunchExternally(uri)) {
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                    return true
                }
                if (!UnsoloHosts.isNavigableInsideWebView(uri)) {
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                    Toast.makeText(requireContext(), R.string.blocked_navigation, Toast.LENGTH_SHORT).show()
                    return true
                }
                return false
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                b.errorView.visibility = android.view.View.GONE
                // First load: skeleton is already showing — no progress bar needed.
                // Subsequent navigations: skeleton is gone, show gold progress bar.
                if (firstPageLoaded) {
                    b.pageLoadProgress.visibility = android.view.View.VISIBLE
                }
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                b.pageLoadProgress.visibility = android.view.View.GONE
                if (!firstPageLoaded) {
                    b.shimmerLayout.stopShimmer()
                    b.shimmerLayout.visibility = android.view.View.GONE
                    firstPageLoaded = true
                    // Tell the activity this tab has finished its first paint so
                    // it can schedule background preloading of the other tabs.
                    (activity as? MainActivity)?.scheduleBackgroundPreload()
                }
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError,
            ) {
                super.onReceivedError(view, request, error)
                if (request.isForMainFrame) {
                    // Load a blank page immediately so the browser's built-in
                    // error page never renders — our native error view takes over.
                    view.loadUrl("about:blank")
                    b.pageLoadProgress.visibility = android.view.View.GONE
                    b.shimmerLayout.stopShimmer()
                    b.shimmerLayout.visibility = android.view.View.GONE
                    b.errorView.visibility = android.view.View.VISIBLE
                    firstPageLoaded = true
                }
            }

            @SuppressLint("WebViewClientOnReceivedSslError")
            override fun onReceivedSslError(view: WebView?, handler: SslErrorHandler?, error: SslError?) {
                handler?.cancel()
                Toast.makeText(requireContext(), R.string.ssl_error, Toast.LENGTH_LONG).show()
            }
        }

        b.webview.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?,
            ): Boolean {
                this@WebShellFragment.filePathCallback?.onReceiveValue(null)
                this@WebShellFragment.filePathCallback = filePathCallback
                val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                }
                val chooser = Intent.createChooser(intent, getString(R.string.file_chooser_title))
                pickFilesLauncher.launch(chooser)
                return true
            }
        }

        b.webview.setDownloadListener { url, _, _, mimeType, _ ->
            try {
                val request = android.app.DownloadManager.Request(Uri.parse(url)).apply {
                    setMimeType(mimeType)
                    addRequestHeader("User-Agent", b.webview.settings.userAgentString)
                    setDescription(getString(R.string.download_started))
                    setTitle(url)
                    setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                }
                val dm = requireContext().getSystemService(android.content.Context.DOWNLOAD_SERVICE) as android.app.DownloadManager
                dm.enqueue(request)
                Toast.makeText(requireContext(), R.string.download_started, Toast.LENGTH_SHORT).show()
            } catch (_: Exception) {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            }
        }

        b.webview.addJavascriptInterface(
            UnsoloJavascriptBridge(this),
            UnsoloJavascriptBridge.NAME,
        )

        requireActivity().onBackPressedDispatcher.addCallback(
            viewLifecycleOwner,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (b.webview.canGoBack()) {
                        b.webview.goBack()
                    } else {
                        isEnabled = false
                        requireActivity().onBackPressedDispatcher.onBackPressed()
                        isEnabled = true
                    }
                }
            },
        )

        if (savedInstanceState != null) {
            b.webview.restoreState(savedInstanceState)
        } else {
            val start = requireArguments().getString(ARG_START_URL) ?: return
            b.webview.loadUrl(start)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        binding?.webview?.saveState(outState)
    }

    fun currentUrl(): String? = binding?.webview?.url

    fun webViewCanGoBack(): Boolean = binding?.webview?.canGoBack() == true

    fun goBack() {
        binding?.webview?.goBack()
    }

    fun reload() {
        binding?.webview?.reload()
    }

    fun loadUrlIfAllowed(url: String) {
        val uri = Uri.parse(url)
        mainHandler.post {
            if (UnsoloHosts.shouldLaunchExternally(uri)) {
                startActivity(Intent(Intent.ACTION_VIEW, uri))
                return@post
            }
            if (!UnsoloHosts.isNavigableInsideWebView(uri)) {
                startActivity(Intent(Intent.ACTION_VIEW, uri))
                return@post
            }
            binding?.webview?.loadUrl(url)
        }
    }

    fun hardReload(url: String) {
        mainHandler.post {
            binding?.webview?.loadUrl(url)
        }
    }

    /** Clears persisted web storage + cookies (Supabase session lives in cookies for Path A). */
    fun clearSessionFromJs() {
        mainHandler.post {
            CookieManager.getInstance().removeAllCookies(null)
            WebStorage.getInstance().deleteAllData()
            CookieManager.getInstance().flush()
            binding?.webview?.clearCache(true)
            binding?.webview?.clearHistory()
        }
    }

    fun clearSessionAndShowLogin() {
        clearSessionFromJs()
        hardReload(UnsoloUrls.login())
    }

    override fun onDestroyView() {
        binding?.webview?.apply {
            stopLoading()
            loadUrl("about:blank")
            removeAllViews()
            destroy()
        }
        binding = null
        super.onDestroyView()
    }

    companion object {
        private const val ARG_START_URL = "start_url"

        fun newInstance(startUrl: String): WebShellFragment {
            return WebShellFragment().apply {
                arguments = Bundle().apply { putString(ARG_START_URL, startUrl) }
            }
        }
    }
}
