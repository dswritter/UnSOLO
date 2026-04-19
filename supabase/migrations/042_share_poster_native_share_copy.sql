-- Native OS share sheet title & message (placeholders: {displayName}, {profileUrl})
INSERT INTO platform_settings (key, value, description) VALUES
  (
    'share_poster_share_title',
    '{displayName} on UnSOLO',
    'System share dialog title. Use {displayName} and {profileUrl} as placeholders.'
  ),
  (
    'share_poster_share_text',
    'See my travel story on UnSOLO — {profileUrl}',
    'System share dialog message. Use {displayName} and {profileUrl} as placeholders.'
  )
ON CONFLICT (key) DO NOTHING;
