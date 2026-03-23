-- ============================================================
-- 009: Fix DM function, add user status
-- ============================================================

-- ── Fix ambiguous room_id in DM function ────────────────────
CREATE OR REPLACE FUNCTION get_or_create_dm_room(user_a UUID, user_b UUID)
RETURNS UUID AS $$
DECLARE
  v_room_id UUID;
BEGIN
  -- Look for existing DM room where both are members
  SELECT cr.id INTO v_room_id
  FROM chat_rooms cr
  WHERE cr.type = 'direct'
    AND EXISTS (SELECT 1 FROM chat_room_members crm WHERE crm.room_id = cr.id AND crm.user_id = user_a)
    AND EXISTS (SELECT 1 FROM chat_room_members crm2 WHERE crm2.room_id = cr.id AND crm2.user_id = user_b);

  IF v_room_id IS NOT NULL THEN
    RETURN v_room_id;
  END IF;

  -- Create new DM room
  INSERT INTO chat_rooms (name, type, created_by, is_active)
  VALUES ('Direct Message', 'direct', user_a, true)
  RETURNING id INTO v_room_id;

  -- Add both members
  INSERT INTO chat_room_members (room_id, user_id) VALUES (v_room_id, user_a);
  INSERT INTO chat_room_members (room_id, user_id) VALUES (v_room_id, user_b);

  RETURN v_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── User status system ──────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status_text TEXT DEFAULT 'Still deciding my next trip';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status_visibility TEXT DEFAULT 'public' CHECK (status_visibility IN ('public', 'followers'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS custom_status BOOLEAN DEFAULT false;
