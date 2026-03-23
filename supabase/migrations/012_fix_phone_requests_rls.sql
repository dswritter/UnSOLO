-- Fix phone_requests RLS: allow requester to update their own pending requests
-- and delete their own requests

-- Allow requester to also update (for re-requesting after denial)
DROP POLICY IF EXISTS "Target can update phone requests" ON phone_requests;
CREATE POLICY "Update phone requests" ON phone_requests
  FOR UPDATE USING (auth.uid() = target_id OR auth.uid() = requester_id);

-- Allow requester to delete their own request
CREATE POLICY "Requester can delete own requests" ON phone_requests
  FOR DELETE USING (auth.uid() = requester_id);

-- Enable realtime on notifications for instant delivery
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
