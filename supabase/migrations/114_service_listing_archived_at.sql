-- Hosts can delete their own listings; ones with booking history are archived (hidden from the host dashboard) instead.
BEGIN;
ALTER TABLE public.service_listings ADD COLUMN IF NOT EXISTS archived_at timestamptz;
NOTIFY pgrst, 'reload schema';
COMMIT;
