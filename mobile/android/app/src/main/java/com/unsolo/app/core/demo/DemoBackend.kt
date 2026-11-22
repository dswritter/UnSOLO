package com.unsolo.app.core.demo

import android.content.Context
import com.unsolo.app.BuildConfig
import com.unsolo.app.core.model.*
import com.unsolo.app.core.net.AppJson
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.*
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import java.io.File
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/** Demo switch: on in debug builds, or when the server is unreachable on first launch. */
object DemoMode {
    @Volatile var enabled: Boolean = BuildConfig.DEMO_MODE
    private val _fallback = kotlinx.coroutines.flow.MutableStateFlow(false)
    /** True when demo was switched on because the real server could not be reached. */
    val fallback: kotlinx.coroutines.flow.StateFlow<Boolean> = _fallback
    /** API calls wait (briefly) until the first-launch probe has decided between server and demo. */
    val decided = java.util.concurrent.CountDownLatch(if (BuildConfig.DEMO_MODE) 0 else 1)
    const val PROBE_HEADER = "X-UnSOLO-Probe"

    fun decide(useDemo: Boolean) {
        if (useDemo) { enabled = true; _fallback.value = true }
        decided.countDown()
    }
}

class DemoRequest(
    val method: String,
    val path: List<String>,
    val query: Map<String, String>,
    val body: String?,
    val multipart: MultipartBody?,
    val token: String?,
    val auth: Boolean,
)

class DemoResponse(val code: Int, val json: String?)

/**
 * Short-circuits /api/v1 and Supabase Auth calls with [DemoBackend] while [DemoMode.enabled].
 * Image requests and everything else pass through.
 */
class DemoApiInterceptor(private val backend: Lazy<DemoBackend>) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        var req = chain.request()
        if (req.header(DemoMode.PROBE_HEADER) != null) return chain.proceed(req.newBuilder().removeHeader(DemoMode.PROBE_HEADER).build())
        DemoMode.decided.await(8, java.util.concurrent.TimeUnit.SECONDS)
        if (!DemoMode.enabled) return chain.proceed(req)
        val full = req.url.toString()
        val isApi = full.startsWith(BuildConfig.API_BASE_URL)
        val isAuth = req.url.encodedPath.startsWith("/auth/v1/")
        if (!isApi && !isAuth) return chain.proceed(req)
        val rawPath = if (isApi) full.removePrefix(BuildConfig.API_BASE_URL).substringBefore('?') else req.url.encodedPath.removePrefix("/auth/v1/")
        val segments = rawPath.split('/').filter { it.isNotEmpty() }
        val query = (0 until req.url.querySize).associate { req.url.queryParameterName(it) to (req.url.queryParameterValue(it) ?: "") }
        val multipart = req.body as? MultipartBody
        val body = if (multipart == null) req.body?.let { b -> Buffer().also { b.writeTo(it) }.readUtf8() } else null
        val token = req.header("Authorization")?.removePrefix("Bearer ")?.takeIf { it.startsWith("demo-") }
        // A little latency so optimistic states are visible, like on a real network.
        Thread.sleep(if (req.method == "GET") 120 else 350)
        val res = backend.value.handle(DemoRequest(req.method, segments, query, body, multipart, token, isAuth))
        val builder = Response.Builder().request(req).protocol(Protocol.HTTP_1_1).code(res.code)
            .message(if (res.code < 300) "OK" else "Error")
            .header("Cache-Control", "private, no-store")
        val media = "application/json".toMediaType()
        builder.body((res.json ?: "").toResponseBody(media))
        return builder.build()
    }
}

/** In-memory fake of the contract, seeded from the JSON fixtures in assets/demo. Behaviour mirrors api-v1.md. */
class DemoBackend(private val context: Context) {
    private val json = AppJson
    private val prefs = context.getSharedPreferences("demo_backend", Context.MODE_PRIVATE)
    private val lock = Any()

    private fun <T> asset(name: String, s: KSerializer<T>): T =
        json.decodeFromString(s, context.assets.open("demo/$name").bufferedReader().use { it.readText() })

    private val config = asset("config.json", AppConfig.serializer())
    private var me = asset("me.json", MeResponse.serializer())
    private val explore: Map<String, MutableList<TripLite>> = listOf("trips", "stays", "activities", "rentals")
        .associateWith { asset("explore_$it.json", Page.serializer(TripLite.serializer())).items.toMutableList() }
    private val trips: Map<String, TripDetail> = asset("trip_details.json", ListSerializer(TripDetail.serializer())).associateBy { it.slug }
    private val feedSeed = asset("feed.json", FeedResponse.serializer())
    private val posts = LinkedHashMap<String, Post>()
    private val feedOrder = mutableListOf<JsonObject>() // post refs {"ref": id} or placed trip items
    private val comments: MutableMap<String, MutableList<Comment>> =
        asset("comments.json", MapSerializer(String.serializer(), ListSerializer(Comment.serializer()))).mapValues { it.value.toMutableList() }.toMutableMap()
    private val offers: MutableMap<String, MutableList<HostOffer>> =
        asset("offers.json", MapSerializer(String.serializer(), ListSerializer(HostOffer.serializer()))).mapValues { it.value.toMutableList() }.toMutableMap()
    private val requests: MutableMap<String, MutableList<JoinRequestItem>> =
        asset("requests.json", MapSerializer(String.serializer(), ListSerializer(JoinRequestItem.serializer()))).mapValues { it.value.toMutableList() }.toMutableMap()
    private var myTrips = asset("my_trips.json", MyTripsResponse.serializer())
    private val notifications = asset("notifications.json", NotificationsResponse.serializer()).items.toMutableList()
    private val chats = asset("chats.json", Page.serializer(ChatSummary.serializer())).items.toMutableList()
    private val messages: MutableMap<String, MutableList<ChatMessage>> =
        asset("messages.json", MapSerializer(String.serializer(), ListSerializer(ChatMessage.serializer()))).mapValues { it.value.toMutableList() }.toMutableMap()
    private val users: MutableMap<String, ProfileResponse> = asset("users.json", MapSerializer(String.serializer(), ProfileResponse.serializer())).toMutableMap()
    private val suggestions = asset("suggestions.json", SuggestionsResponse.serializer())
    private val postClientIds = mutableMapOf<String, String>()
    private val commentClientIds = mutableMapOf<String, Comment>()
    private val messageClientIds = mutableMapOf<String, ChatMessage>()
    private var phoneVerified = prefs.getBoolean("phone_verified", true)
    private var preferences: Preferences = me.preferences

    init {
        feedSeed.items.forEach { item ->
            val kind = item["kind"]?.jsonPrimitive?.contentOrNull
            if (kind == PostKind.PLACED_TRIP) feedOrder += item
            else {
                val p = json.decodeFromJsonElement(Post.serializer(), item)
                posts[p.id] = p
                feedOrder += buildJsonObject { put("ref", p.id) }
            }
        }
        (myTrips.plans + myTrips.requested).forEach { posts.putIfAbsent(it.id, it) }
        trips.values.flatMap { it.stories }.forEach { posts.putIfAbsent(it.id, it) }
        users.values.flatMap { it.posts }.forEach { posts.putIfAbsent(it.id, it) }
        preferences = preferences.copy(landingTab = prefs.getString("landing", preferences.landingTab) ?: "explore")
    }

    fun handle(r: DemoRequest): DemoResponse = synchronized(lock) {
        try {
            if (r.auth) auth(r) else api(r)
        } catch (e: Exception) {
            err(500, "server_error", "Demo backend error: ${e.message}")
        }
    }

    // ---- helpers ----
    private fun <T> ok(s: KSerializer<T>, v: T, code: Int = 200) = DemoResponse(code, json.encodeToString(s, v))
    private fun okRaw(v: JsonElement, code: Int = 200) = DemoResponse(code, v.toString())
    private fun noContent() = DemoResponse(204, null)
    private fun err(code: Int, c: String, msg: String? = null) =
        DemoResponse(code, json.encodeToString(ApiErrorBody.serializer(), ApiErrorBody(ApiErrorDetail(c, msg))))
    private fun now() = Instant.now().truncatedTo(ChronoUnit.SECONDS).toString()
    private val meLite: UserLite get() = me.user.copy(isPhoneVerified = phoneVerified, email = null, phone = null, dateOfBirth = null, gender = null)
    private inline fun <reified T> body(s: KSerializer<T>, r: DemoRequest): T = json.decodeFromString(s, r.body ?: "{}")

    private fun session(): JsonObject = buildJsonObject {
        put("access_token", "demo-access-" + UUID.randomUUID())
        put("refresh_token", "demo-refresh-" + UUID.randomUUID())
        put("expires_in", 3600)
        put("expires_at", Instant.now().epochSecond + 3600)
        put("token_type", "bearer")
        putJsonObject("user") { put("id", me.user.id); put("email", me.user.email); put("phone", me.user.phone) }
    }

    private fun setPhoneVerified(v: Boolean) { phoneVerified = v; prefs.edit().putBoolean("phone_verified", v).apply() }

    private fun auth(r: DemoRequest): DemoResponse {
        val b = r.body?.let { runCatching { json.parseToJsonElement(it).jsonObject }.getOrNull() } ?: JsonObject(emptyMap())
        return when (r.path.firstOrNull()) {
            "otp", "recover" -> okRaw(JsonObject(emptyMap()))
            "verify" -> {
                val token = b["token"]?.jsonPrimitive?.contentOrNull.orEmpty()
                if (!token.matches(Regex("\\d{6}"))) return DemoResponse(400, """{"error_description":"Token has expired or is invalid"}""")
                setPhoneVerified(b["type"]?.jsonPrimitive?.contentOrNull == "sms")
                okRaw(session())
            }
            "token" -> {
                if (r.query["grant_type"] == "id_token" || r.query["grant_type"] == "pkce") setPhoneVerified(true)
                if (r.query["grant_type"] == "password") {
                    val pw = b["password"]?.jsonPrimitive?.contentOrNull.orEmpty()
                    if (pw.length < 6) return DemoResponse(400, """{"error_description":"Invalid login credentials"}""")
                    setPhoneVerified(false)
                }
                okRaw(session())
            }
            "signup" -> { setPhoneVerified(false); okRaw(session()) }
            "logout" -> noContent()
            else -> DemoResponse(404, """{"msg":"not found"}""")
        }
    }

    private fun requireUser(r: DemoRequest): DemoResponse? = if (r.token == null) err(401, "unauthorized") else null
    private fun requirePhone(r: DemoRequest): DemoResponse? = requireUser(r) ?: if (!phoneVerified) err(403, "phone_required", "Verify your phone number first.") else null

    private fun viewerFor(p: Post, signedIn: Boolean): Post {
        if (!signedIn) return p.copy(viewer = p.viewer.copy(isAuthor = false, membership = null, saved = false), meetingPoint = null,
            seats = p.seats.map { if (it.state == SeatState.YOU) it.copy(state = SeatState.MEMBER) else it })
        return p
    }

    private fun feedItems(kind: String?, signedIn: Boolean): List<JsonObject> = feedOrder.mapNotNull { o ->
        val ref = o["ref"]?.jsonPrimitive?.contentOrNull
        if (ref == null) { if (kind == null) o else null }
        else posts[ref]?.takeIf { (kind == null || it.kind == kind) && it.status == "live" }
            ?.let { json.encodeToJsonElement(Post.serializer(), viewerFor(it, signedIn)).jsonObject }
    }

    private fun updatePost(id: String, f: (Post) -> Post): Post? = posts[id]?.let { f(it).also { n -> posts[id] = n } }

    private val moneyRegex = Regex("(₹|rs\\.?|inr)\\s*\\d[\\d,]*\\s*(/|per)\\s*(person|head|pax)|\\badvance\\b|pay me|\\bupi\\b|@ok(axis|hdfc|sbi|icici)|@ybl|@paytm", RegexOption.IGNORE_CASE)
    private val phoneRegex = Regex("(\\+?91[\\s-]?)?[6-9]\\d{4}[\\s-]?\\d{5}")
    private val emailRegex = Regex("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}")
    private val linkRegex = Regex("https?://(?!([a-z0-9-]+\\.)?unsolo\\.in)[^\\s]+", RegexOption.IGNORE_CASE)

    private fun api(r: DemoRequest): DemoResponse {
        val p = r.path
        val signedIn = r.token != null
        val m = r.method
        return when {
            p == listOf("config") -> ok(AppConfig.serializer(), config)
            p == listOf("me") && m == "GET" -> requireUser(r) ?: ok(MeResponse.serializer(), me.copy(user = me.user.copy(isPhoneVerified = phoneVerified), preferences = preferences,
                counts = Counts(notifications.count { !it.isRead }, chats.filter { !it.isRequest }.sumOf { it.unread })))
            p == listOf("me") && m == "DELETE" -> requireUser(r) ?: ok(DeleteAccountResponse.serializer(), DeleteAccountResponse(deleted = true, mode = "deleted"))
            p == listOf("me") && m == "PATCH" -> requireUser(r) ?: run {
                val b = body(PatchMeRequest.serializer(), r)
                me = me.copy(user = me.user.copy(name = b.name ?: me.user.name, bio = b.bio ?: me.user.bio, gender = b.gender ?: me.user.gender, homeCity = b.homeCity ?: me.user.homeCity))
                ok(MeResponse.serializer(), me.copy(preferences = preferences))
            }
            p == listOf("me", "preferences") && m == "GET" -> requireUser(r) ?: ok(Preferences.serializer(), preferences)
            p == listOf("me", "preferences") && m == "PUT" -> requireUser(r) ?: run {
                val merged = JsonObject(json.encodeToJsonElement(Preferences.serializer(), preferences).jsonObject + json.parseToJsonElement(r.body ?: "{}").jsonObject)
                preferences = json.decodeFromJsonElement(Preferences.serializer(), merged)
                prefs.edit().putString("landing", preferences.landingTab).apply()
                ok(Preferences.serializer(), preferences)
            }
            p == listOf("me", "landing-suggestion") -> requireUser(r) ?: run {
                val visits = Visits(prefs.getInt("v_explore", 0), prefs.getInt("v_tribe", 0), prefs.getInt("v_trips", 0))
                val best = listOf("tribe" to visits.tribe, "trips" to visits.trips, "explore" to visits.explore).maxBy { it.second }
                val suggest = best.first.takeIf { best.second >= 3 && it != "explore" && it != preferences.landingTab && !prefs.getBoolean("landing_dismissed", false) }
                ok(LandingSuggestion.serializer(), LandingSuggestion(suggest, visits))
            }
            p == listOf("me", "landing-suggestion", "dismiss") -> requireUser(r) ?: run { prefs.edit().putBoolean("landing_dismissed", true).apply(); noContent() }
            // Phone sign-in (mirrors src/app/api/v1/auth/phone/*): any 10-digit Indian mobile, any 6-digit code.
            p == listOf("auth", "phone", "start") && m == "POST" -> run {
                val raw = runCatching { json.parseToJsonElement(r.body ?: "{}").jsonObject["phone"]?.jsonPrimitive?.contentOrNull }.getOrNull().orEmpty()
                val digits = raw.filter { it.isDigit() }.let { if (it.length > 10) it.takeLast(10) else it }
                if (digits.length != 10 || digits.first() !in "6789") err(400, "bad_request", "Enter a 10-digit Indian mobile number.")
                else okRaw(buildJsonObject { put("challenge", "demo-challenge-" + UUID.randomUUID()); put("expiresIn", 300); put("devCode", DEMO_SMS_CODE) })
            }
            p == listOf("auth", "phone", "verify") && m == "POST" -> run {
                val o = runCatching { json.parseToJsonElement(r.body ?: "{}").jsonObject }.getOrNull()
                val challenge = o?.get("challenge")?.jsonPrimitive?.contentOrNull.orEmpty()
                val code = o?.get("code")?.jsonPrimitive?.contentOrNull.orEmpty()
                if (!challenge.startsWith("demo-challenge-")) err(400, "bad_request", "Ask for a new code.")
                else if (!code.matches(Regex("\\d{4}"))) err(401, "unauthorized", "That code didn't work. Check it or ask for a new one.")
                else { setPhoneVerified(true); okRaw(JsonObject(session() + ("is_new" to kotlinx.serialization.json.JsonPrimitive(false)))) }
            }
            p == listOf("me", "phone", "start") -> requireUser(r) ?: ok(PhoneStartResponse.serializer(), PhoneStartResponse(true, DEMO_SMS_CODE))
            p == listOf("me", "phone", "verify") -> requireUser(r) ?: run {
                val b = body(PhoneVerifyRequest.serializer(), r)
                if (!b.code.matches(Regex("\\d{4}"))) err(400, "bad_request", "That code didn't match. In demo mode any 4 digits work, e.g. $DEMO_SMS_CODE.")
                else { setPhoneVerified(true); ok(PhoneVerifyResponse.serializer(), PhoneVerifyResponse(true)) }
            }
            p == listOf("devices") -> requireUser(r) ?: noContent()

            p == listOf("explore") -> {
                val cat = r.query["category"]?.takeIf { it in explore } ?: "trips"
                val q = r.query["q"].orEmpty().trim().lowercase()
                val items = explore.getValue(cat).filter { q.isEmpty() || it.title.lowercase().contains(q) || (it.place?.name?.lowercase()?.contains(q) == true) }
                ok(Page.serializer(TripLite.serializer()), Page(items.map { if (signedIn) it else it.copy(goingFaces = emptyList()) }, null))
            }
            p.size == 2 && p[0] == "trips" -> trips[p[1]]?.let { t ->
                val stories = t.stories.map { s -> posts[s.id] ?: s }
                ok(TripDetail.serializer(), if (signedIn) t.copy(stories = stories) else t.copy(stories = stories, goingFaces = emptyList(), seats = t.seats.map { s -> if (s.state == SeatState.MEMBER) s.copy(user = null) else s }))
            } ?: err(404, "not_found")
            p == listOf("my", "trips") -> requireUser(r) ?: run {
                val plans = myTrips.plans.map { posts[it.id] ?: it }
                val requested = posts.values.filter { it.viewer.membership == "requested" && it.author.id != me.user.id }
                ok(MyTripsResponse.serializer(), myTrips.copy(plans = plans, requested = requested))
            }

            p == listOf("feed") -> {
                val kind = r.query["kind"]?.takeIf { it in listOf(PostKind.PLAN, PostKind.STORY, PostKind.ASK) }
                ok(FeedResponse.serializer(), FeedResponse(feedItems(kind, signedIn), null, true, feedSeed.nextDepartures))
            }
            p == listOf("posts") && m == "POST" -> requirePhone(r) ?: createPost(r)
            p.size == 2 && p[0] == "posts" && m == "GET" -> posts[p[1]]?.let { post ->
                val isMember = post.viewer.isAuthor || post.viewer.membership == "approved"
                ok(PostDetailResponse.serializer(), PostDetailResponse(viewerFor(post, signedIn), comments[post.id].orEmpty(), if (signedIn && isMember) offers[post.id].orEmpty() else emptyList()))
            } ?: err(404, "not_found")
            p.size == 2 && p[0] == "posts" && m == "PATCH" -> requireUser(r) ?: run {
                val b = body(PatchPostRequest.serializer(), r)
                val updated = updatePost(p[1]) {
                    val title = b.title ?: it.title; val text = b.body ?: it.body; val cost = b.estCostText ?: it.estCostText
                    // Edits are screened again, like POST /posts.
                    val stillMoney = moneyRegex.containsMatchIn(listOfNotNull(title, text, cost).joinToString(" "))
                    val status = b.status ?: if (it.status == "held" || stillMoney) (if (stillMoney) "held" else "live") else it.status
                    it.copy(title = title?.let(::scrub), body = scrub(text), estCostText = cost, status = status, updatedAt = now())
                } ?: return err(404, "not_found")
                if (updated.status == "live" && feedOrder.none { it["ref"]?.jsonPrimitive?.contentOrNull == updated.id }) feedOrder.add(0, buildJsonObject { put("ref", updated.id) })
                ok(CreatePostResponse.serializer(), CreatePostResponse(updated, Moderation(if (updated.status == "held") "held" else "live", if (updated.status == "held") listOf("money") else emptyList())))
            }
            p.size == 2 && p[0] == "posts" && m == "DELETE" -> requireUser(r) ?: run { posts.remove(p[1]); feedOrder.removeAll { it["ref"]?.jsonPrimitive?.contentOrNull == p[1] }; noContent() }
            p.size == 4 && p[0] == "posts" && p[2] == "reactions" -> requirePhone(r) ?: run {
                val kind = p[3]
                val post = updatePost(p[1]) { post ->
                    val has = kind in post.myReactions
                    val add = m == "PUT"
                    if (has == add) post else {
                        val d = if (add) 1 else -1
                        val rx = when (kind) {
                            ReactionKind.WANT_TO_GO -> post.reactions.copy(wantToGo = post.reactions.wantToGo + d)
                            ReactionKind.HELPFUL -> post.reactions.copy(helpful = post.reactions.helpful + d)
                            else -> post.reactions.copy(love = post.reactions.love + d)
                        }
                        post.copy(reactions = rx, myReactions = if (add) post.myReactions + kind else post.myReactions - kind)
                    }
                } ?: return err(404, "not_found")
                ok(ReactionsResponse.serializer(), ReactionsResponse(post.reactions, post.myReactions))
            }
            p.size == 3 && p[0] == "posts" && p[2] == "save" -> requireUser(r) ?: run { updatePost(p[1]) { it.copy(viewer = it.viewer.copy(saved = m == "PUT")) }; noContent() }
            p.size == 3 && p[0] == "posts" && p[2] == "vote" && m == "PUT" -> requirePhone(r) ?: run {
                val b = body(VoteRequest.serializer(), r)
                val post = updatePost(p[1]) { it.copy(poll = it.poll?.movedTo(b.choice)) } ?: return err(404, "not_found", "This post is no longer available")
                post.poll?.let { ok(VoteResponse.serializer(), VoteResponse(it)) } ?: err(400, "bad_request", "This post has no poll")
            }
            p == listOf("places") -> {
                val q = r.query["q"].orEmpty().trim()
                val all = listOf("Manali" to "Himachal Pradesh", "Kasol" to "Himachal Pradesh", "Spiti Valley" to "Himachal Pradesh", "Rishikesh" to "Uttarakhand",
                    "Leh" to "Ladakh", "Goa" to "Goa", "Jaisalmer" to "Rajasthan", "Alleppey" to "Kerala", "Hampi" to "Karnataka", "Ziro" to "Arunachal Pradesh")
                ok(PlacesResponse.serializer(), PlacesResponse(all.filter { q.isEmpty() || it.first.contains(q, true) }.take(6).map { PlaceHit(it.first, it.first.lowercase().replace(' ', '-'), detail = it.second) }))
            }
            p.size == 3 && p[0] == "posts" && p[2] == "comments" && m == "GET" -> ok(Page.serializer(Comment.serializer()), Page(comments[p[1]].orEmpty(), null))
            p.size == 3 && p[0] == "posts" && p[2] == "comments" && m == "POST" -> requirePhone(r) ?: run {
                val b = body(CommentRequest.serializer(), r)
                commentClientIds[b.clientId]?.let { return ok(Comment.serializer(), it) }
                if (b.body.isBlank()) return err(400, "bad_request", "Write something first.")
                val c = Comment("c-" + UUID.randomUUID().toString().take(8), p[1], b.parentId, meLite, scrub(b.body), b.pollChoice, now())
                val list = comments.getOrPut(p[1]) { mutableListOf() }
                if (b.parentId != null) {
                    val i = list.indexOfFirst { it.id == b.parentId }
                    if (i >= 0) list[i] = list[i].copy(replies = list[i].replies + c) else list += c
                } else list += c
                updatePost(p[1]) { post ->
                    val poll = post.poll?.let { poll -> if (b.pollChoice != null && poll.myChoice == null) poll.copy(myChoice = b.pollChoice, options = poll.options.map { o -> if (o.id == b.pollChoice) o.copy(votes = o.votes + 1) else o }) else poll }
                    post.copy(commentCount = post.commentCount + 1, poll = poll)
                }
                commentClientIds[b.clientId] = c
                ok(Comment.serializer(), c, 201)
            }
            p.size == 2 && p[0] == "comments" && m == "DELETE" -> requireUser(r) ?: run {
                comments.values.forEach { l -> l.removeAll { it.id == p[1] }; l.replaceAll { it.copy(replies = it.replies.filter { x -> x.id != p[1] }) } }
                noContent()
            }
            p.size == 3 && p[0] == "posts" && p[2] == "join" && m == "POST" -> requirePhone(r) ?: run {
                val intro = body(JoinRequestBody.serializer(), r).intro.trim()
                if (intro.length !in 10..500) return DemoResponse(400, json.encodeToString(ApiErrorBody.serializer(), ApiErrorBody(ApiErrorDetail("bad_request", "Say a little about yourself (10–500 characters).", "intro"))))
                val post = posts[p[1]] ?: return err(404, "not_found")
                if (post.viewer.isAuthor) return err(409, "conflict", "This is your plan.")
                if (post.audience == "women" && me.user.gender != "woman") return err(403, "forbidden", "This plan is for women travellers.")
                val expires = Instant.now().plus(72, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS).toString()
                updatePost(p[1]) { pp ->
                    if (pp.viewer.membership == "requested") pp else {
                        val seats = pp.seats.toMutableList()
                        val i = seats.indexOfFirst { it.state == SeatState.OPEN }
                        if (i >= 0) seats[i] = Seat(SeatState.REQUESTED, meLite)
                        pp.copy(seats = seats, viewer = pp.viewer.copy(membership = "requested", canJoin = false))
                    }
                }
                ok(JoinResponse.serializer(), JoinResponse("requested", expires))
            }
            p.size == 3 && p[0] == "posts" && p[2] == "join" && m == "DELETE" -> requireUser(r) ?: run {
                updatePost(p[1]) { pp ->
                    pp.copy(seats = pp.seats.map { if (it.state == SeatState.REQUESTED && it.user?.id == me.user.id) Seat(SeatState.OPEN) else it },
                        viewer = pp.viewer.copy(membership = "withdrawn", canJoin = true))
                }
                noContent()
            }
            p.size == 3 && p[0] == "posts" && p[2] == "requests" -> requireUser(r) ?: ok(RequestsResponse.serializer(), RequestsResponse(requests[p[1]].orEmpty()))
            p.size == 4 && p[0] == "posts" && p[2] == "requests" -> requireUser(r) ?: run {
                val decision = body(DecisionRequest.serializer(), r).decision
                val list = requests[p[1]] ?: return err(404, "not_found")
                val i = list.indexOfFirst { it.user.id == p[3] }
                if (i < 0) return err(404, "not_found")
                val state = if (decision == "approve") "approved" else "declined"
                list[i] = list[i].copy(state = state)
                if (state == "approved") updatePost(p[1]) { pp ->
                    val seats = pp.seats.toMutableList()
                    val j = seats.indexOfFirst { it.state == SeatState.OPEN }
                    if (j >= 0) seats[j] = Seat(SeatState.MEMBER, list[i].user.copy(tripsCount = null, reviewsAvg = null, mutuals = null))
                    pp.copy(seats = seats, memberCount = pp.memberCount + 1)
                }
                ok(DecisionResponse.serializer(), DecisionResponse(state))
            }
            p.size == 3 && p[0] == "posts" && p[2] == "offers" -> requireUser(r) ?: run {
                val b = body(OfferRequest.serializer(), r)
                val o = HostOffer("o-" + UUID.randomUUID().toString().take(8), p[1], meLite.copy(isHost = true), b.pricePaise, b.includes, b.notes, b.extraSeats ?: 0, "pending",
                    Instant.now().plus(7, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS).toString())
                offers.getOrPut(p[1]) { mutableListOf() } += o
                ok(HostOffer.serializer(), o, 201)
            }
            p.size == 3 && p[0] == "offers" && p[2] == "accept" -> requireUser(r) ?: run {
                val (postId, list) = offers.entries.firstOrNull { e -> e.value.any { it.id == p[1] } }?.toPair() ?: return err(404, "not_found")
                val expected = runCatching { body(AcceptOfferRequest.serializer(), r).expectedPricePaise }.getOrNull()
                if (expected == null) return err(400, "bad_request", "expectedPricePaise is required")
                if (list.first { it.id == p[1] }.pricePaise != expected) return err(409, "conflict", "The host changed the price.")
                val payBy = Instant.now().plus(48, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS).toString()
                val slug = (posts[postId]?.title ?: "hosted-plan").lowercase().replace(Regex("[^a-z0-9]+"), "-").trim('-') + "-hosted"
                offers[postId] = list.map { if (it.id == p[1]) it.copy(state = "accepted", packageSlug = slug, payBy = payBy) else if (it.state == "pending") it.copy(state = "declined") else it }.toMutableList()
                ok(AcceptOfferResponse.serializer(), AcceptOfferResponse(slug, payBy))
            }
            p.size == 3 && p[0] == "offers" && p[2] == "decline" -> requireUser(r) ?: run {
                offers.replaceAll { _, l -> l.map { if (it.id == p[1]) it.copy(state = "declined") else it }.toMutableList() }
                noContent()
            }
            p.size == 2 && p[0] == "users" -> users[p[1]]?.let { u ->
                ok(ProfileResponse.serializer(), u.copy(posts = u.posts.map { posts[it.id] ?: it }, openPlan = u.openPlan?.let { posts[it.id] ?: it }))
            } ?: err(404, "not_found")
            p == listOf("suggestions") -> ok(SuggestionsResponse.serializer(), suggestions.copy(items = suggestions.items.map { s -> s.post?.let { s.copy(post = posts[it.id] ?: it) } ?: s }))

            p == listOf("chats") -> requireUser(r) ?: run {
                val type = r.query["type"]
                ok(Page.serializer(ChatSummary.serializer()), Page(chats.filter { type == null || it.type == type }.sortedByDescending { it.lastMessage?.at.orEmpty() }, null))
            }
            p.size == 3 && p[0] == "chats" && p[2] == "messages" && m == "GET" -> requireUser(r) ?: run {
                val all = messages[p[1]].orEmpty().sortedBy { it.createdAt }
                val after = r.query["after"]; val before = r.query["before"]
                val limit = r.query["limit"]?.toIntOrNull() ?: 40
                val filtered = when {
                    after != null -> all.filter { it.createdAt > after }
                    before != null -> all.filter { it.createdAt < before }
                    else -> all
                }
                ok(MessagesResponse.serializer(), MessagesResponse(filtered.takeLast(limit), filtered.size > limit))
            }
            p.size == 3 && p[0] == "chats" && p[2] == "messages" && m == "POST" -> requireUser(r) ?: run {
                val b = body(SendMessageRequest.serializer(), r)
                messageClientIds[b.clientId]?.let { return ok(ChatMessage.serializer(), it) }
                val msg = ChatMessage("m-" + UUID.randomUUID().toString().take(8), b.clientId, meLite, scrub(b.body), "text", now())
                messages.getOrPut(p[1]) { mutableListOf() } += msg
                messageClientIds[b.clientId] = msg
                bumpChat(p[1], msg)
                scheduleReply(p[1])
                ok(ChatMessage.serializer(), msg, 201)
            }
            p.size == 3 && p[0] == "chats" && p[2] == "read" -> requireUser(r) ?: run {
                val i = chats.indexOfFirst { it.id == p[1] }; if (i >= 0) chats[i] = chats[i].copy(unread = 0); noContent()
            }
            p == listOf("chats", "direct") -> requireUser(r) ?: run {
                val uid = body(DirectChatRequest.serializer(), r).userId
                val user = users.values.firstOrNull { it.user.id == uid }?.user
                val id = "dm-" + (user?.username ?: uid)
                if (chats.none { it.id == id }) chats += ChatSummary(id, "direct", user?.name ?: "Traveller", user?.avatarUrl?.let { Media(it) }, null, 0, false)
                ok(DirectChatResponse.serializer(), DirectChatResponse(id))
            }

            p == listOf("reports") -> requireUser(r) ?: ok(ReportResponse.serializer(), ReportResponse("r-" + UUID.randomUUID().toString().take(8)), 201)
            p == listOf("blocks") -> requireUser(r) ?: noContent()
            p.size == 2 && p[0] == "blocks" -> requireUser(r) ?: noContent()

            p == listOf("notifications") -> requireUser(r) ?: ok(NotificationsResponse.serializer(), NotificationsResponse(notifications.sortedByDescending { it.createdAt }, null, notifications.count { !it.isRead }))
            p == listOf("notifications", "read") -> requireUser(r) ?: run {
                val b = body(ReadNotificationsRequest.serializer(), r)
                notifications.replaceAll { if (b.all == true || b.ids.orEmpty().contains(it.id)) it.copy(isRead = true) else it }
                noContent()
            }
            p == listOf("sync") -> requireUser(r) ?: ok(SyncResponse.serializer(), SyncResponse(
                serverTime = now(), posts = emptyList(), removedPosts = emptyList(), notifications = null,
                unreadNotifications = notifications.count { !it.isRead },
                memberships = posts.values.mapNotNull { pp -> pp.viewer.membership?.let { MembershipState(pp.id, it) } },
            ))
            p == listOf("uploads") -> requireUser(r) ?: upload(r)
            p == listOf("events") -> {
                runCatching {
                    json.parseToJsonElement(r.body ?: "{}").jsonObject["events"]?.jsonArray?.forEach { e ->
                        val o = e.jsonObject
                        if (o["name"]?.jsonPrimitive?.contentOrNull == "screen.view") {
                            val s = o["screen"]?.jsonPrimitive?.contentOrNull
                            if (s in listOf("explore", "tribe", "trips")) prefs.edit().putInt("v_$s", prefs.getInt("v_$s", 0) + 1).apply()
                        }
                    }
                }
                DemoResponse(202, "{}")
            }
            else -> err(404, "not_found", "Demo backend has no route for ${r.method} /${p.joinToString("/")}")
        }
    }

    private fun scrub(text: String) = text.replace(phoneRegex, "contact hidden").replace(emailRegex, "contact hidden")

    private fun createPost(r: DemoRequest): DemoResponse {
        val b = body(CreatePostRequest.serializer(), r)
        postClientIds[b.clientId]?.let { id -> posts[id]?.let { return ok(CreatePostResponse.serializer(), CreatePostResponse(it, Moderation(if (it.status == "held") "held" else "live")), 200) } }
        if (b.body.isBlank() && b.title.isNullOrBlank()) return err(400, "bad_request", "Add a few words first.")
        if (b.kind == PostKind.ASK && b.poll != null && b.poll.size !in 2..4) return err(400, "bad_request", "Polls need 2 to 4 options.")
        val prompts = mutableListOf<String>()
        val raw = listOfNotNull(b.title, b.body, b.estCostText).joinToString(" ")
        if (moneyRegex.containsMatchIn(raw)) prompts += "money"
        if (phoneRegex.containsMatchIn(raw) || emailRegex.containsMatchIn(raw)) prompts += "contact_hidden"
        if (linkRegex.containsMatchIn(raw)) prompts += "links_disabled"
        val held = "money" in prompts
        val id = "p-" + UUID.randomUUID().toString().take(8)
        val spots = (b.spotsTotal ?: 0).coerceIn(0, 24)
        val seats = if (b.kind == PostKind.PLAN) listOf(Seat(SeatState.YOU, meLite)) + List((spots - 1).coerceAtLeast(0)) { Seat(SeatState.OPEN) } else emptyList()
        val trip = b.tripPackageId?.let { tid -> trips.values.firstOrNull { it.id == tid }?.lite() }
        val post = Post(
            id = id, kind = b.kind, author = meLite, title = b.title?.let(::scrub), body = scrub(b.body), place = b.place,
            startsOn = b.startsOn, endsOn = b.endsOn, spotsTotal = b.spotsTotal, memberCount = if (b.kind == PostKind.PLAN) 1 else 0,
            audience = b.audience ?: "anyone", estCostText = b.estCostText?.let(::scrub), media = b.media.orEmpty(), trip = trip,
            poll = b.poll?.let { opts -> Poll(opts.mapIndexed { i, l -> PollOption("o${i + 1}", l, 0) }, null) },
            status = if (held) "held" else "live", seats = seats, createdAt = now(), updatedAt = now(),
            viewer = Viewer(isAuthor = true, membership = if (b.kind == PostKind.PLAN) "approved" else null, canJoin = false, joinBlockedReason = if (b.kind == PostKind.PLAN) "own_plan" else null),
            meetingPoint = b.meetingPoint,
        )
        posts[id] = post
        postClientIds[b.clientId] = id
        if (!held) feedOrder.add(0, buildJsonObject { put("ref", id) })
        if (b.kind == PostKind.PLAN) myTrips = myTrips.copy(plans = listOf(post) + myTrips.plans)
        return ok(CreatePostResponse.serializer(), CreatePostResponse(post, Moderation(if (held) "held" else "live", prompts)), 201)
    }

    private fun upload(r: DemoRequest): DemoResponse {
        val part = r.multipart?.parts?.firstOrNull { it.headers?.get("Content-Disposition")?.contains("name=\"file\"") == true }
            ?: return err(400, "bad_request", "No file")
        val dir = File(context.filesDir, "demo_uploads").apply { mkdirs() }
        val f = File(dir, UUID.randomUUID().toString() + ".jpg")
        val buf = Buffer(); part.body.writeTo(buf)
        if (buf.size > 5L * 1024 * 1024) return err(400, "bad_request", "File too large")
        val size = buf.size
        f.outputStream().use { buf.writeTo(it) }
        val uri = android.net.Uri.fromFile(f).toString()
        return ok(Media.serializer(), Media(uri, uri, null, null, null, size), 201)
    }

    private fun bumpChat(roomId: String, msg: ChatMessage) {
        val i = chats.indexOfFirst { it.id == roomId }
        if (i >= 0) chats[i] = chats[i].copy(lastMessage = LastMessage(msg.body, msg.createdAt, msg.author.firstName))
    }

    /** Someone answers a few seconds later, so polling has something to pick up. */
    private fun scheduleReply(roomId: String) {
        val room = chats.firstOrNull { it.id == roomId } ?: return
        val other = messages[roomId].orEmpty().lastOrNull { it.author.id != me.user.id && it.type == "text" }?.author ?: return
        Thread {
            Thread.sleep(6_000)
            synchronized(lock) {
                val reply = ChatMessage("m-" + UUID.randomUUID().toString().take(8), null, other,
                    if (room.type == "direct") "Sounds good, see you there!" else "Noted. I'll add it to the plan.", "text", now())
                messages.getOrPut(roomId) { mutableListOf() } += reply
                bumpChat(roomId, reply)
            }
        }.apply { isDaemon = true }.start()
    }
}

/** Demo SMS code (any 4 digits are accepted). */
const val DEMO_SMS_CODE = "1234"
