package com.unsolo.app.ui.profile

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.unsolo.app.ui.theme.Pc
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable private data class MapLocation(val name: String, val id: String, val path: String)
@Serializable private data class MapData(val viewBox: String, val locations: List<MapLocation>)

private class ParsedMap(val width: Float, val height: Float, val states: List<Pair<String, Path>>)
private var cache: ParsedMap? = null

/** Our state names → the map's ("Jammu & Kashmir" → "Jammu and Kashmir"; Ladakh is drawn within J&K). */
private fun mapName(state: String): String = when (state.trim()) {
    "Jammu & Kashmir", "Ladakh" -> "Jammu and Kashmir"
    "Andaman & Nicobar" -> "Andaman and Nicobar Islands"
    else -> state.trim()
}

/**
 * India with the states you've been to filled in (same outlines as the web, from @svg-maps/india,
 * CC BY 4.0). Parsed once per process from assets/india_map.json.
 */
@Composable
fun IndiaMap(visited: Set<String>, modifier: Modifier = Modifier) {
    val c = Pc.colors
    val ctx = LocalContext.current
    var map by remember { mutableStateOf(cache) }
    LaunchedEffect(Unit) {
        if (map == null) map = withContext(Dispatchers.Default) {
            runCatching {
                val raw = ctx.assets.open("india_map.json").bufferedReader().use { it.readText() }
                val d = Json { ignoreUnknownKeys = true }.decodeFromString(MapData.serializer(), raw)
                val vb = d.viewBox.split(' ').map { it.toFloat() }
                ParsedMap(vb[2], vb[3], d.locations.map { it.name to PathParser().parsePathString(it.path).toPath() })
            }.getOrNull()?.also { cache = it }
        }
    }
    val on = remember(visited) { visited.map(::mapName).toSet() }
    val m = map
    Column(modifier) {
        Box(Modifier.fillMaxWidth().aspectRatio(if (m != null) m.width / m.height else 612f / 696f)
            .semantics { contentDescription = "Map of India: ${on.size} states visited" }) {
            if (m != null) Canvas(Modifier.fillMaxSize()) {
                val s = minOf(size.width / m.width, size.height / m.height)
                translate((size.width - m.width * s) / 2f, (size.height - m.height * s) / 2f) {
                    scale(s, s, pivot = Offset.Zero) {
                        m.states.forEach { (name, path) ->
                            drawPath(path, if (name in on) c.gold else c.tonal)
                            drawPath(path, c.paper, style = Stroke(width = 1.2f / s.coerceAtLeast(0.3f) * 0.6f))
                        }
                    }
                }
            }
        }
        Text("Map outlines: @svg-maps/india (CC BY 4.0)", style = Pc.type.label, color = c.ink3, modifier = Modifier.padding(top = 4.dp))
    }
}
