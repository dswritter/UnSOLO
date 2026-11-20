package com.unsolo.app.core.db

import android.content.Context
import androidx.room.*
import kotlinx.coroutines.flow.Flow

/*
 * Offline-first cache. Contract objects are stored as JSON blobs (AppJson) next to the few columns
 * we query or sort by, so schema churn on the server does not force Room migrations.
 */

object LocalState {
    const val SYNCED = "synced"
    const val SENDING = "sending"
    const val HELD = "held"
    const val FAILED = "failed"
}

@Entity(tableName = "posts", indices = [Index(value = ["clientId"])])
data class PostEntity(
    @PrimaryKey val id: String,
    val clientId: String?,
    val kind: String,
    val json: String,
    val localState: String = LocalState.SYNCED,
    /** Comma-separated moderation prompts (money, contact_hidden, links_disabled). */
    val prompts: String? = null,
    val sortAt: Long = System.currentTimeMillis(),
)

@Entity(tableName = "feed_entries", primaryKeys = ["feedKey", "position"])
data class FeedEntryEntity(
    val feedKey: String,
    val position: Int,
    /** "post" or "placed_trip". */
    val type: String,
    val refId: String,
    val tripJson: String? = null,
)

@Entity(tableName = "feed_meta")
data class FeedMetaEntity(
    @PrimaryKey val feedKey: String,
    val nextCursor: String?,
    val caughtUp: Boolean,
    val nextDeparturesJson: String,
    val fetchedAt: Long,
)

@Entity(tableName = "comments", indices = [Index("postId")])
data class CommentEntity(
    @PrimaryKey val id: String,
    val postId: String,
    val parentId: String?,
    val clientId: String?,
    val json: String,
    val createdAt: String,
    val localState: String = LocalState.SYNCED,
)

@Entity(tableName = "trips")
data class TripEntity(
    @PrimaryKey val slug: String,
    val liteJson: String,
    val detailJson: String? = null,
    val updatedAt: Long = System.currentTimeMillis(),
)

@Entity(tableName = "explore_entries", primaryKeys = ["listKey", "position"])
data class ExploreEntryEntity(val listKey: String, val position: Int, val slug: String)

@Entity(tableName = "notifications")
data class NotificationEntity(
    @PrimaryKey val id: String,
    val json: String,
    val isRead: Boolean,
    val createdAt: String,
)

@Entity(tableName = "chats")
data class ChatEntity(
    @PrimaryKey val id: String,
    val json: String,
    val sortAt: String,
    val isRequest: Boolean,
    val unread: Int,
)

@Entity(tableName = "messages", indices = [Index("roomId"), Index(value = ["clientId"], unique = true)])
data class MessageEntity(
    /** "s:<serverId>" once confirmed, "c:<clientId>" while pending. */
    @PrimaryKey val key: String,
    val roomId: String,
    val serverId: String?,
    val clientId: String?,
    val json: String,
    val createdAt: String,
    val localState: String = LocalState.SYNCED,
)

object OutboxType {
    const val CREATE_POST = "create_post"
    const val COMMENT = "comment"
    const val REACT = "react"
    const val UNREACT = "unreact"
    const val SAVE = "save"
    const val UNSAVE = "unsave"
    const val JOIN = "join"
    const val WITHDRAW = "withdraw"
    const val DECIDE = "decide"
    const val MESSAGE = "message"
    const val READ_CHAT = "read_chat"
    const val READ_NOTIFICATIONS = "read_notifications"
    const val PREFERENCES = "preferences"
    const val PATCH_ME = "patch_me"
    const val REGISTER_DEVICE = "register_device"
    const val VOTE = "vote"
}

@Entity(tableName = "outbox", indices = [Index(value = ["clientId"], unique = true)])
data class OutboxEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    /** Idempotency key sent to the server as `clientId` (or used locally to de-duplicate). */
    val clientId: String,
    val type: String,
    val targetId: String? = null,
    val payload: String = "{}",
    val attempts: Int = 0,
    val nextAttemptAt: Long = 0,
    val lastError: String? = null,
    /** pending | failed (permanent) */
    val state: String = "pending",
    val createdAt: Long = System.currentTimeMillis(),
)

@Entity(tableName = "pending_media", indices = [Index("ownerClientId")])
data class PendingMediaEntity(
    @PrimaryKey val id: String,
    val ownerClientId: String,
    val position: Int,
    /** Compressed copy in app storage (file path). */
    val localPath: String,
    /** queued | uploading | done | failed */
    val state: String = "queued",
    val progress: Float = 0f,
    val resultJson: String? = null,
    val purpose: String = "post",
)

@Entity(tableName = "events")
data class EventEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val json: String,
    val createdAt: Long = System.currentTimeMillis(),
)

@Entity(tableName = "kv_cache")
data class CacheEntity(@PrimaryKey val key: String, val json: String, val fetchedAt: Long = System.currentTimeMillis())

@Dao
interface PostDao {
    @Query("SELECT * FROM posts WHERE id = :id") fun observe(id: String): Flow<PostEntity?>
    @Query("SELECT * FROM posts WHERE id = :id") suspend fun get(id: String): PostEntity?
    @Query("SELECT * FROM posts WHERE clientId = :clientId LIMIT 1") suspend fun byClientId(clientId: String): PostEntity?
    @Query("SELECT * FROM posts WHERE localState != 'synced' ORDER BY sortAt DESC") fun observeLocal(): Flow<List<PostEntity>>
    @Query("SELECT * FROM posts WHERE id IN (:ids)") suspend fun getMany(ids: List<String>): List<PostEntity>
    @Upsert suspend fun upsert(p: PostEntity)
    @Upsert suspend fun upsertAll(p: List<PostEntity>)
    @Query("DELETE FROM posts WHERE id = :id") suspend fun delete(id: String)
    @Query("DELETE FROM posts WHERE id IN (:ids)") suspend fun deleteMany(ids: List<String>)
}

data class FeedRow(
    val position: Int,
    val type: String,
    val refId: String,
    val tripJson: String?,
    val postJson: String?,
    val localState: String?,
    val prompts: String?,
)

@Dao
interface FeedDao {
    @Query(
        """SELECT f.position AS position, f.type AS type, f.refId AS refId, f.tripJson AS tripJson,
           p.json AS postJson, p.localState AS localState, p.prompts AS prompts
           FROM feed_entries f LEFT JOIN posts p ON p.id = f.refId
           WHERE f.feedKey = :key ORDER BY f.position"""
    )
    fun observe(key: String): Flow<List<FeedRow>>
    @Query("SELECT * FROM feed_meta WHERE feedKey = :key") fun observeMeta(key: String): Flow<FeedMetaEntity?>
    @Query("SELECT * FROM feed_meta WHERE feedKey = :key") suspend fun meta(key: String): FeedMetaEntity?
    @Query("SELECT COALESCE(MAX(position), -1) FROM feed_entries WHERE feedKey = :key") suspend fun maxPosition(key: String): Int
    @Query("DELETE FROM feed_entries WHERE feedKey = :key") suspend fun clear(key: String)
    @Query("DELETE FROM feed_entries WHERE refId IN (:ids)") suspend fun removeRefs(ids: List<String>)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertAll(rows: List<FeedEntryEntity>)
    @Upsert suspend fun upsertMeta(m: FeedMetaEntity)
}

@Dao
interface CommentDao {
    @Query("SELECT * FROM comments WHERE postId = :postId ORDER BY createdAt") fun observe(postId: String): Flow<List<CommentEntity>>
    @Upsert suspend fun upsertAll(c: List<CommentEntity>)
    @Upsert suspend fun upsert(c: CommentEntity)
    @Query("DELETE FROM comments WHERE id = :id") suspend fun delete(id: String)
    @Query("DELETE FROM comments WHERE postId = :postId AND localState = 'synced'") suspend fun clearSynced(postId: String)
    @Query("SELECT * FROM comments WHERE clientId = :clientId LIMIT 1") suspend fun byClientId(clientId: String): CommentEntity?
}

@Dao
interface TripDao {
    @Query("SELECT * FROM trips WHERE slug = :slug") fun observe(slug: String): Flow<TripEntity?>
    @Query("SELECT * FROM trips WHERE slug = :slug") suspend fun get(slug: String): TripEntity?
    @Upsert suspend fun upsert(t: TripEntity)
    @Query(
        """SELECT t.* FROM explore_entries e JOIN trips t ON t.slug = e.slug
           WHERE e.listKey = :key ORDER BY e.position"""
    )
    fun observeList(key: String): Flow<List<TripEntity>>
    @Query("DELETE FROM explore_entries WHERE listKey = :key") suspend fun clearList(key: String)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertEntries(rows: List<ExploreEntryEntity>)
}

@Dao
interface NotificationDao {
    @Query("SELECT * FROM notifications ORDER BY createdAt DESC") fun observe(): Flow<List<NotificationEntity>>
    @Query("SELECT COUNT(*) FROM notifications WHERE isRead = 0") fun observeUnread(): Flow<Int>
    @Upsert suspend fun upsertAll(n: List<NotificationEntity>)
    @Query("DELETE FROM notifications") suspend fun clear()
    @Query("UPDATE notifications SET isRead = 1 WHERE id IN (:ids)") suspend fun markRead(ids: List<String>)
    @Query("UPDATE notifications SET isRead = 1") suspend fun markAllRead()
}

@Dao
interface ChatDao {
    @Query("SELECT * FROM chats ORDER BY sortAt DESC") fun observe(): Flow<List<ChatEntity>>
    @Query("SELECT * FROM chats WHERE id = :id") fun observeOne(id: String): Flow<ChatEntity?>
    @Query("SELECT COALESCE(SUM(unread), 0) FROM chats WHERE isRequest = 0") fun observeUnread(): Flow<Int>
    @Upsert suspend fun upsertAll(c: List<ChatEntity>)
    @Query("DELETE FROM chats") suspend fun clear()
    @Query("UPDATE chats SET unread = 0 WHERE id = :id") suspend fun markRead(id: String)
}

@Dao
interface MessageDao {
    @Query("SELECT * FROM messages WHERE roomId = :roomId ORDER BY createdAt") fun observe(roomId: String): Flow<List<MessageEntity>>
    @Query("SELECT MAX(createdAt) FROM messages WHERE roomId = :roomId AND serverId IS NOT NULL") suspend fun latestServerTime(roomId: String): String?
    @Query("DELETE FROM messages WHERE clientId = :clientId") suspend fun deleteByClientId(clientId: String)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insert(m: MessageEntity)
    @Query("UPDATE messages SET localState = :state WHERE clientId = :clientId") suspend fun setState(clientId: String, state: String)

    /** Swap the pending bubble for the server copy (or insert a new message) without duplicates. */
    @Transaction
    suspend fun upsertServer(rows: List<MessageEntity>) {
        rows.forEach { r -> r.clientId?.let { deleteByClientId(it) }; insert(r) }
    }
}

@Dao
interface OutboxDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun insert(item: OutboxEntity): Long
    @Query("SELECT * FROM outbox WHERE state = 'pending' ORDER BY id") suspend fun pending(): List<OutboxEntity>
    @Query("SELECT * FROM outbox WHERE clientId = :clientId") suspend fun byClientId(clientId: String): OutboxEntity?
    @Query("SELECT COUNT(*) FROM outbox WHERE state = 'pending'") fun observePendingCount(): Flow<Int>
    @Update suspend fun update(item: OutboxEntity)
    @Query("DELETE FROM outbox WHERE id = :id") suspend fun delete(id: Long)
    @Query("DELETE FROM outbox WHERE type = :type AND targetId = :targetId AND state = 'pending'") suspend fun deletePending(type: String, targetId: String)
    @Query("DELETE FROM outbox") suspend fun clear()
}

@Dao
interface MediaDao {
    @Query("SELECT * FROM pending_media WHERE ownerClientId = :owner ORDER BY position") suspend fun forOwner(owner: String): List<PendingMediaEntity>
    @Query("SELECT * FROM pending_media WHERE ownerClientId = :owner ORDER BY position") fun observeOwner(owner: String): Flow<List<PendingMediaEntity>>
    @Query("SELECT * FROM pending_media WHERE state != 'done'") fun observeActive(): Flow<List<PendingMediaEntity>>
    @Upsert suspend fun upsert(m: PendingMediaEntity)
    @Upsert suspend fun upsertAll(m: List<PendingMediaEntity>)
    @Query("UPDATE pending_media SET progress = :progress, state = :state WHERE id = :id") suspend fun progress(id: String, progress: Float, state: String)
    @Query("DELETE FROM pending_media WHERE ownerClientId = :owner") suspend fun deleteOwner(owner: String)
}

@Dao
interface EventDao {
    @Insert suspend fun insert(e: EventEntity)
    @Query("SELECT * FROM events ORDER BY id LIMIT :limit") suspend fun batch(limit: Int): List<EventEntity>
    @Query("DELETE FROM events WHERE id IN (:ids)") suspend fun delete(ids: List<Long>)
    @Query("SELECT COUNT(*) FROM events") suspend fun count(): Int
    @Query("DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT :keep)") suspend fun trim(keep: Int)
}

@Dao
interface CacheDao {
    @Query("SELECT * FROM kv_cache WHERE `key` = :key") fun observe(key: String): Flow<CacheEntity?>
    @Query("SELECT * FROM kv_cache WHERE `key` = :key") suspend fun get(key: String): CacheEntity?
    @Upsert suspend fun put(e: CacheEntity)
    @Query("DELETE FROM kv_cache WHERE `key` = :key") suspend fun delete(key: String)
    @Query("DELETE FROM kv_cache WHERE `key` LIKE :prefix || '%'") suspend fun deletePrefix(prefix: String)
}

@Database(
    entities = [
        PostEntity::class, FeedEntryEntity::class, FeedMetaEntity::class, CommentEntity::class, TripEntity::class,
        ExploreEntryEntity::class, NotificationEntity::class, ChatEntity::class, MessageEntity::class,
        OutboxEntity::class, PendingMediaEntity::class, EventEntity::class, CacheEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun posts(): PostDao
    abstract fun feed(): FeedDao
    abstract fun comments(): CommentDao
    abstract fun trips(): TripDao
    abstract fun notifications(): NotificationDao
    abstract fun chats(): ChatDao
    abstract fun messages(): MessageDao
    abstract fun outbox(): OutboxDao
    abstract fun media(): MediaDao
    abstract fun events(): EventDao
    abstract fun cache(): CacheDao

    companion object {
        fun build(context: Context): AppDatabase =
            Room.databaseBuilder(context, AppDatabase::class.java, "unsolo.db")
                .fallbackToDestructiveMigration()
                .build()
    }
}
