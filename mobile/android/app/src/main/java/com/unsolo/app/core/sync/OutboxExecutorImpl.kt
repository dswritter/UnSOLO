package com.unsolo.app.core.sync

import android.content.Context
import com.unsolo.app.core.db.AppDatabase
import com.unsolo.app.core.db.LocalState
import com.unsolo.app.core.db.OutboxEntity
import com.unsolo.app.core.db.OutboxType
import com.unsolo.app.core.model.*
import com.unsolo.app.core.net.ApiResult
import com.unsolo.app.core.net.ApiService
import com.unsolo.app.core.net.AppJson
import com.unsolo.app.core.net.apiCall
import com.unsolo.app.core.net.apiUnit
import com.unsolo.app.core.net.toErr
import com.unsolo.app.core.net.userMessage
import com.unsolo.app.data.AccountRepository
import com.unsolo.app.data.AppEvent
import com.unsolo.app.data.AppEvents
import com.unsolo.app.data.ChatRepository
import com.unsolo.app.data.TribeRepository
import com.unsolo.app.data.dec
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class OutboxExecutorImpl(
    private val context: Context,
    private val db: AppDatabase,
    private val api: ApiService,
    private val tribe: TribeRepository,
    private val chat: ChatRepository,
    private val account: AccountRepository,
    private val events: AppEvents,
) : OutboxExecutor {

    override suspend fun execute(item: OutboxEntity): ExecResult {
        val payload = runCatching { AppJson.parseToJsonElement(item.payload).jsonObject }.getOrDefault(JsonObject(emptyMap()))
        val target = item.targetId.orEmpty()
        return when (item.type) {
            OutboxType.CREATE_POST -> createPost(item, payload)
            OutboxType.COMMENT -> run(apiCall { api.comment(target, CommentRequest.serializer().dec(item.payload)) }) { tribe.applyComment(item.clientId, it) }
            OutboxType.REACT, OutboxType.UNREACT -> {
                val (postId, kind) = target.split('/').let { it[0] to it.getOrElse(1) { "" } }
                val r = if (item.type == OutboxType.REACT) apiCall { api.react(postId, kind) } else apiCall { api.unreact(postId, kind) }
                run(r) { tribe.applyReactions(postId, it) }
            }
            OutboxType.SAVE -> run(apiUnit { api.save(target) }) {}
            OutboxType.UNSAVE -> run(apiUnit { api.unsave(target) }) {}
            OutboxType.JOIN -> run(apiCall { api.join(target, JoinRequestBody(payload["intro"]?.jsonPrimitive?.content.orEmpty())) }) { tribe.applyJoin(target, it) }
            OutboxType.WITHDRAW -> run(apiUnit { api.withdraw(target) }) {}
            OutboxType.DECIDE -> {
                val userId = payload["userId"]?.jsonPrimitive?.content.orEmpty()
                val decision = payload["decision"]?.jsonPrimitive?.content.orEmpty()
                run(apiCall { api.decide(target, userId, DecisionRequest(decision)) }) { tribe.refreshPost(target) }
            }
            OutboxType.MESSAGE -> run(apiCall { api.sendMessage(target, SendMessageRequest(item.clientId, payload["body"]?.jsonPrimitive?.content.orEmpty())) }) {
                chat.applySent(target, it)
            }
            OutboxType.READ_CHAT -> run(apiUnit { api.readChat(target) }) {}
            OutboxType.READ_NOTIFICATIONS -> run(apiUnit { api.readNotifications(ReadNotificationsRequest.serializer().dec(item.payload)) }) {}
            OutboxType.PREFERENCES -> run(apiCall { api.putPreferences(payload) }) { account.applyPreferences(it) }
            OutboxType.PATCH_ME -> run(apiCall { api.patchMe(PatchMeRequest.serializer().dec(item.payload)) }) { account.applyMe(it) }
            OutboxType.REGISTER_DEVICE -> run(apiUnit { api.registerDevice(DeviceRequest.serializer().dec(item.payload)) }) {}
            else -> ExecResult.Fail("unknown_type")
        }.also { r -> if (r is ExecResult.Fail) onPermanentFailure(item, r.reason) }
    }

    private suspend fun createPost(item: OutboxEntity, payload: JsonObject): ExecResult {
        val media = db.media().forOwner(item.clientId)
        if (media.any { it.state == "failed" }) return ExecResult.Fail("upload_failed")
        // Still compressing: prepareUploads schedules the upload (and this post) when they're ready.
        if (media.any { it.state == "preparing" }) return ExecResult.Wait
        if (media.any { it.state != "done" }) {
            Outbox.scheduleUpload(context, item.clientId)
            return ExecResult.Wait
        }
        val req = CreatePostRequest.serializer().dec(payload.toString()).copy(
            media = media.mapNotNull { m -> m.resultJson?.let { Media.serializer().dec(it) } }.ifEmpty { null }
        )
        return when (val r = apiCall { api.createPost(req) }) {
            is ApiResult.Ok -> {
                val body = r.value.body()
                if (r.value.isSuccessful && body != null) {
                    tribe.applyCreated(item.clientId, item.targetId ?: "local:${item.clientId}", body)
                    ExecResult.Done
                } else OutboxPolicy.classify(retrofit2.HttpException(r.value).toErr())
            }
            else -> OutboxPolicy.classify(r)
        }
    }

    private suspend fun <T> run(r: ApiResult<T>, onOk: suspend (T) -> Unit): ExecResult {
        if (r is ApiResult.Ok) onOk(r.value)
        return OutboxPolicy.classify(r)
    }

    private suspend fun onPermanentFailure(item: OutboxEntity, reason: String) {
        when (item.type) {
            OutboxType.CREATE_POST -> tribe.markLocalPostState(item.clientId, LocalState.FAILED)
            OutboxType.COMMENT -> tribe.markCommentFailed(item.clientId)
            OutboxType.MESSAGE -> chat.markFailed(item.clientId)
            OutboxType.JOIN -> tribe.revertJoin(item.targetId.orEmpty(), reason)
        }
        val msg = when (reason) {
            "phone_required" -> { events.emit(AppEvent.NeedsPhone); null }
            "unauthorized" -> { events.emit(AppEvent.NeedsSignIn); null }
            "upload_failed" -> "A photo couldn't be uploaded. Open the post to retry."
            else -> ApiResult.Err(0, reason, null).userMessage()
        }
        if (msg != null && item.type in setOf(OutboxType.CREATE_POST, OutboxType.COMMENT, OutboxType.JOIN, OutboxType.MESSAGE)) events.emit(AppEvent.Message(msg))
    }
}
