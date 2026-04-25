-- Realtime DELETE payloads need the full row to merge client-side (like message_reactions).
ALTER TABLE public.chat_poll_votes REPLICA IDENTITY FULL;
