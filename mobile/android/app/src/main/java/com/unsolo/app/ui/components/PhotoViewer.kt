package com.unsolo.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.unsolo.app.core.model.Media
import com.unsolo.app.ui.theme.Pc
import com.unsolo.app.ui.theme.PcIcons
import kotlinx.coroutines.launch
import kotlin.math.abs

/**
 * Full-screen photos: whole image (never cropped) on black, swipe between photos, pinch or
 * double-tap to zoom, drag to look around while zoomed, swipe down to close.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun PhotoViewer(images: List<Media>, start: Int, title: String?, onDismiss: () -> Unit) {
    if (images.isEmpty()) return
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        val pager = rememberPagerState(initialPage = start.coerceIn(0, images.lastIndex)) { images.size }
        var zoomed by remember { mutableStateOf(false) }
        val drop = remember { Animatable(0f) }
        val scope = rememberCoroutineScope()
        Box(
            Modifier.fillMaxSize().background(Color.Black.copy(alpha = (1f - abs(drop.value) / 1200f).coerceIn(0.3f, 1f)))
                .pointerInput(zoomed) {
                    if (zoomed) return@pointerInput
                    detectVerticalDragGestures(
                        onDragEnd = { scope.launch { if (abs(drop.value) > 220f) onDismiss() else drop.animateTo(0f, spring()) } },
                        onDragCancel = { scope.launch { drop.animateTo(0f) } },
                    ) { change, dy -> change.consume(); scope.launch { drop.snapTo(drop.value + dy) } }
                },
        ) {
            HorizontalPager(pager, Modifier.fillMaxSize().graphicsLayer { translationY = drop.value }, userScrollEnabled = !zoomed, key = { it }) { i ->
                ZoomableImage(images[i], title, onZoomChanged = { if (pager.currentPage == i) zoomed = it })
            }
            Row(Modifier.statusBarsPadding().padding(horizontal = 8.dp, vertical = 4.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                GlassButton(PcIcons.Close, "Close", onDismiss)
                Spacer(Modifier.weight(1f))
                if (images.size > 1) Text("${pager.currentPage + 1} / ${images.size}", style = Pc.type.label, color = Color.White,
                    modifier = Modifier.clip(CircleShape).background(Color.Black.copy(alpha = 0.45f)).padding(horizontal = 12.dp, vertical = 6.dp))
                Spacer(Modifier.width(8.dp))
            }
        }
    }
}

@Composable
private fun ZoomableImage(media: Media, title: String?, onZoomChanged: (Boolean) -> Unit) {
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    var size by remember { mutableStateOf(androidx.compose.ui.unit.IntSize.Zero) }
    fun clamp(o: Offset, s: Float): Offset {
        val maxX = (size.width * (s - 1f)) / 2f; val maxY = (size.height * (s - 1f)) / 2f
        return Offset(o.x.coerceIn(-maxX, maxX), o.y.coerceIn(-maxY, maxY))
    }
    val state = rememberTransformableState { zoom, pan, _ ->
        scale = (scale * zoom).coerceIn(1f, 5f)
        offset = if (scale <= 1f) Offset.Zero else clamp(offset + pan * scale, scale)
        onZoomChanged(scale > 1.01f)
    }
    Box(
        Modifier.fillMaxSize()
            .onSizeChanged { size = it }
            .pointerInput(Unit) {
                detectTapGestures(onDoubleTap = { tap ->
                    if (scale > 1f) { scale = 1f; offset = Offset.Zero; onZoomChanged(false) }
                    else { scale = 2.5f; offset = clamp(Offset((size.width / 2f - tap.x) * 1.5f, (size.height / 2f - tap.y) * 1.5f), 2.5f); onZoomChanged(true) }
                })
            }
            // Pan only while zoomed, so a plain swipe still turns the page.
            .transformable(state, canPan = { scale > 1.01f }),
        contentAlignment = Alignment.Center,
    ) {
        ProgressiveImage(media, Modifier.fillMaxSize().graphicsLayer { scaleX = scale; scaleY = scale; translationX = offset.x; translationY = offset.y },
            title, contentScale = ContentScale.Fit, placeholder = Color.Transparent)
    }
}

