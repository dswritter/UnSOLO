-- Enable realtime on user_presence for instant online/offline updates
ALTER PUBLICATION supabase_realtime ADD TABLE user_presence;

-- Enable realtime on notifications for instant notification delivery
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
