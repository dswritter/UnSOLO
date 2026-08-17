-- chat_room_members only had a composite unique index on (room_id, user_id) —
-- room_id leading, so lookups filtered by user_id alone (Navbar's unread-room
-- list + "has any rooms" check, both `.eq('user_id', ...)`) couldn't use it and
-- fell back to a sequential scan. Those queries run on every signed-in page
-- load, every 120s poll, and every window focus, so this was a real and
-- growing cost specific to signed-in users.

CREATE INDEX IF NOT EXISTS idx_chat_room_members_user ON public.chat_room_members(user_id);
