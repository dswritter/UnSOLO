-- ============================================================
-- 085: Trip chat rooms — name = trip title, icon = first trip photo
-- ============================================================
-- Existing trip rooms were named "<title> - Trip Chat" and had no image_url.
-- Align them with the trip so the chat group shows the trip title and the
-- trip's first photo as its icon. Going forward this is set at creation.

update public.chat_rooms r
set
  name = coalesce(p.title, r.name),
  image_url = coalesce(r.image_url, (p.images)[1])
from public.packages p
where r.package_id = p.id
  and r.type = 'trip';
