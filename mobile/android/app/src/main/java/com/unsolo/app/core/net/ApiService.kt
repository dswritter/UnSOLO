package com.unsolo.app.core.net

import com.unsolo.app.core.model.*
import kotlinx.serialization.json.Json
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.*

/** One JSON configuration for network, Room blobs and demo fixtures. */
val AppJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
    encodeDefaults = true
    isLenient = false
}

/** REST /api/v1 (docs/revamp/api-v1.md). Paths are relative to BuildConfig.API_BASE_URL. */
interface ApiService {
    // Config and session
    @GET("config") suspend fun config(): AppConfig
    /** First-launch reachability probe; bypasses the demo gate (see DemoMode). */
    @GET("config") suspend fun configProbe(@Header("X-UnSOLO-Probe") probe: String = "1"): AppConfig
    @GET("me") suspend fun me(): MeResponse
    @PATCH("me") suspend fun patchMe(@Body body: PatchMeRequest): MeResponse
    @HTTP(method = "DELETE", path = "me", hasBody = true) suspend fun deleteMe(@Body body: DeleteAccountRequest): DeleteAccountResponse
    @GET("me/referrals") suspend fun referrals(): ReferralsResponse
    @GET("offers") suspend fun offers(): OffersResponse
    @GET("me/preferences") suspend fun preferences(): Preferences
    @PUT("me/preferences") suspend fun putPreferences(@Body partial: kotlinx.serialization.json.JsonObject): Preferences
    @GET("me/landing-suggestion") suspend fun landingSuggestion(): LandingSuggestion
    @POST("me/landing-suggestion/dismiss") suspend fun dismissLandingSuggestion(): Response<Unit>
    // Phone sign-in (no auth needed): our own endpoints, not Supabase /auth/v1/otp.
    @POST("auth/phone/start") suspend fun authPhoneStart(@Body body: PhoneAuthStartRequest): PhoneAuthStartResponse
    @POST("auth/phone/verify") suspend fun authPhoneVerify(@Body body: PhoneAuthVerifyRequest): SupaSession
    @POST("me/phone/start") suspend fun phoneStart(@Body body: PhoneStartRequest): PhoneStartResponse
    @POST("me/phone/verify") suspend fun phoneVerify(@Body body: PhoneVerifyRequest): PhoneVerifyResponse
    @POST("devices") suspend fun registerDevice(@Body body: DeviceRequest): Response<Unit>
    @HTTP(method = "DELETE", path = "devices", hasBody = true) suspend fun deleteDevice(@Body body: DeviceDeleteRequest): Response<Unit>

    // Explore
    @GET("statuses") suspend fun statuses(@Query("user") user: String? = null): StatusesResponse
    @POST("statuses") suspend fun createStatus(@Body body: CreateStatusRequest): StatusesResponse
    @DELETE("statuses/{id}") suspend fun deleteStatus(@Path("id") id: String): Response<Unit>
    @POST("statuses/seen") suspend fun seenStatuses(@Body body: SeenStatusesRequest): Response<Unit>
    @PUT("statuses/{id}/reaction") suspend fun reactStatus(@Path("id") id: String, @Body body: StatusReactionRequest): StatusReactionResponse
    @GET("statuses/{id}/comments") suspend fun statusComments(@Path("id") id: String): StatusCommentsResponse
    @POST("statuses/{id}/comments") suspend fun commentStatus(@Path("id") id: String, @Body body: StatusCommentRequest): StatusComment
    @GET("leaderboard") suspend fun leaderboard(): LeaderboardResponse
    @GET("users/{username}/followers") suspend fun followers(@Path("username") username: String): UserListResponse
    @GET("users/{username}/following") suspend fun following(@Path("username") username: String): UserListResponse
    @GET("people") suspend fun people(@Query("q") q: String, @Query("limit") limit: Int = 8): PeopleResponse
    @GET("places") suspend fun places(@Query("q") q: String, @Query("limit") limit: Int = 6): PlacesResponse
    @GET("explore") suspend fun explore(
        @Query("q") q: String? = null,
        @Query("category") category: String? = null,
        @Query("month") month: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 20,
    ): Page<TripLite>
    @GET("trips/{slug}") suspend fun trip(@Path("slug") slug: String): TripDetail
    @GET("my/trips") suspend fun myTrips(): MyTripsResponse

    // Tribe
    @GET("feed") suspend fun feed(
        @Query("kind") kind: String? = null,
        @Query("place") place: String? = null,
        @Query("lat") lat: Double? = null,
        @Query("lng") lng: Double? = null,
        @Query("cursor") cursor: String? = null,
    ): FeedResponse
    @POST("posts") suspend fun createPost(@Body body: CreatePostRequest): Response<CreatePostResponse>
    @GET("posts/{id}") suspend fun post(@Path("id") id: String): PostDetailResponse
    @PATCH("posts/{id}") suspend fun patchPost(@Path("id") id: String, @Body body: PatchPostRequest): Response<CreatePostResponse>
    @DELETE("posts/{id}") suspend fun deletePost(@Path("id") id: String): Response<Unit>
    @PUT("posts/{id}/reactions/{kind}") suspend fun react(@Path("id") id: String, @Path("kind") kind: String): ReactionsResponse
    @DELETE("posts/{id}/reactions/{kind}") suspend fun unreact(@Path("id") id: String, @Path("kind") kind: String): ReactionsResponse
    @PUT("posts/{id}/save") suspend fun save(@Path("id") id: String): Response<Unit>
    @DELETE("posts/{id}/save") suspend fun unsave(@Path("id") id: String): Response<Unit>
    @GET("posts/{id}/comments") suspend fun comments(@Path("id") id: String, @Query("cursor") cursor: String? = null): Page<Comment>
    @POST("posts/{id}/comments") suspend fun comment(@Path("id") id: String, @Body body: CommentRequest): Comment
    @PUT("posts/{id}/vote") suspend fun vote(@Path("id") id: String, @Body body: VoteRequest): VoteResponse
    @DELETE("comments/{id}") suspend fun deleteComment(@Path("id") id: String): Response<Unit>
    @POST("posts/{id}/join") suspend fun join(@Path("id") id: String, @Body body: JoinRequestBody): JoinResponse
    @DELETE("posts/{id}/join") suspend fun withdraw(@Path("id") id: String): Response<Unit>
    @GET("posts/{id}/requests") suspend fun requests(@Path("id") id: String): RequestsResponse
    @POST("posts/{id}/requests/{userId}") suspend fun decide(@Path("id") id: String, @Path("userId") userId: String, @Body body: DecisionRequest): DecisionResponse
    @POST("posts/{id}/offers") suspend fun makeOffer(@Path("id") id: String, @Body body: OfferRequest): HostOffer
    @POST("offers/{id}/accept") suspend fun acceptOffer(@Path("id") id: String, @Body body: AcceptOfferRequest): AcceptOfferResponse
    @POST("offers/{id}/decline") suspend fun declineOffer(@Path("id") id: String): Response<Unit>
    @GET("users/{username}") suspend fun user(@Path("username") username: String): ProfileResponse
    @PUT("users/{username}/follow") suspend fun follow(@Path("username") username: String): FollowResponse
    @DELETE("users/{username}/follow") suspend fun unfollow(@Path("username") username: String): FollowResponse
    @POST("users/{username}/phone-request") suspend fun requestPhone(@Path("username") username: String): Response<Unit>
    @GET("me/phone-requests") suspend fun phoneRequests(): PhoneRequestsResponse
    @PUT("me/phone-requests/{id}") suspend fun decidePhoneRequest(@Path("id") id: String, @Body body: PhoneRequestDecision): Response<Unit>
    @GET("suggestions") suspend fun suggestions(@Query("lat") lat: Double? = null, @Query("lng") lng: Double? = null): SuggestionsResponse

    // Chat
    @GET("chats") suspend fun chats(@Query("type") type: String? = null, @Query("cursor") cursor: String? = null): Page<ChatSummary>
    @GET("chats/{roomId}/messages") suspend fun messages(
        @Path("roomId") roomId: String,
        @Query("before") before: String? = null,
        @Query("after") after: String? = null,
        @Query("limit") limit: Int = 40,
    ): MessagesResponse
    @POST("chats/{roomId}/messages") suspend fun sendMessage(@Path("roomId") roomId: String, @Body body: SendMessageRequest): ChatMessage
    @POST("chats/{roomId}/read") suspend fun readChat(@Path("roomId") roomId: String): Response<Unit>
    @POST("chats/direct") suspend fun directChat(@Body body: DirectChatRequest): DirectChatResponse

    // Safety
    @POST("reports") suspend fun report(@Body body: ReportRequest): ReportResponse
    @POST("blocks") suspend fun block(@Body body: BlockRequest): Response<Unit>
    @DELETE("blocks/{userId}") suspend fun unblock(@Path("userId") userId: String): Response<Unit>

    // Notifications, sync, uploads, analytics
    @GET("notifications") suspend fun notifications(@Query("cursor") cursor: String? = null): NotificationsResponse
    @POST("notifications/read") suspend fun readNotifications(@Body body: ReadNotificationsRequest): Response<Unit>
    @GET("sync") suspend fun sync(@Query("since") since: String?): SyncResponse
    @Multipart @POST("uploads") suspend fun upload(@Part file: MultipartBody.Part, @Part("purpose") purpose: RequestBody): Media
    @POST("events") suspend fun events(@Body body: EventsRequest): Response<Unit>
}
