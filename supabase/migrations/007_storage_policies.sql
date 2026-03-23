-- ============================================================
-- 007: Storage policies for the 'images' bucket
-- Run this after creating the 'images' bucket in Supabase Dashboard
-- ============================================================

-- Allow anyone to read images (public bucket)
INSERT INTO storage.policies (name, bucket_id, operation, definition)
SELECT 'Public read access', 'images', 'SELECT', '(true)'
WHERE NOT EXISTS (
  SELECT 1 FROM storage.policies WHERE name = 'Public read access' AND bucket_id = 'images'
);

-- Allow authenticated users to upload (admin check done at API level)
INSERT INTO storage.policies (name, bucket_id, operation, definition)
SELECT 'Auth upload', 'images', 'INSERT', '(auth.role() = ''authenticated'')'
WHERE NOT EXISTS (
  SELECT 1 FROM storage.policies WHERE name = 'Auth upload' AND bucket_id = 'images'
);
