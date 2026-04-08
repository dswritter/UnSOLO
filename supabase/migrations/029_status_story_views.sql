-- Who viewed my status (WhatsApp-style metrics)

CREATE TABLE IF NOT EXISTS status_story_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES status_stories(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (story_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_status_story_views_story ON status_story_views (story_id);
CREATE INDEX IF NOT EXISTS idx_status_story_views_viewer ON status_story_views (viewer_id);

ALTER TABLE status_story_views ENABLE ROW LEVEL SECURITY;

-- Viewers record their own views only for stories they are allowed to see
CREATE POLICY "status_story_views_insert_visible" ON status_story_views
  FOR INSERT TO authenticated
  WITH CHECK (
    viewer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM status_stories s
      WHERE s.id = story_id
        AND s.expires_at > NOW()
        AND status_story_visible_to_reader(s.id, auth.uid())
    )
  );

-- Story author can see who viewed their stories
CREATE POLICY "status_story_views_select_author" ON status_story_views
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM status_stories s
      WHERE s.id = story_id AND s.author_id = auth.uid()
    )
  );

-- Viewers can see their own view rows (optional; not required for UI)
CREATE POLICY "status_story_views_select_self" ON status_story_views
  FOR SELECT TO authenticated
  USING (viewer_id = auth.uid());
