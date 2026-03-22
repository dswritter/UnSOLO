-- UnSOLO Seed Data — Indian Destinations & Packages

-- ===================
-- DESTINATIONS
-- ===================
INSERT INTO destinations (name, state, country, slug, image_url, description) VALUES
(
  'Rishikesh', 'Uttarakhand', 'India', 'rishikesh-uttarakhand',
  'https://images.unsplash.com/photo-1584792049753-d5ba72b5e0f7?w=800&q=80',
  'The adventure capital of India, set along the sacred Ganges. White-water rafting, bungee jumping, yoga retreats, and Himalayan treks await.'
),
(
  'Manali', 'Himachal Pradesh', 'India', 'manali-himachal',
  'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=800&q=80',
  'A high-altitude Himalayan resort town surrounded by snow-capped peaks, pine forests, and ancient Buddhist monasteries. Gateway to Spiti and Ladakh.'
),
(
  'Alleppey', 'Kerala', 'India', 'alleppey-kerala',
  'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=800&q=80',
  'The Venice of the East. Navigate a labyrinth of 1,500 km of canals, backwaters, and lakes in traditional kettuvallam houseboats amid swaying coconut palms.'
),
(
  'Goa', 'Goa', 'India', 'goa',
  'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=800&q=80',
  'India''s coastal paradise. From pristine beaches and Portuguese heritage to spice plantations and vibrant nightlife — Goa is the ultimate solo escape.'
),
(
  'Jaisalmer', 'Rajasthan', 'India', 'jaisalmer-rajasthan',
  'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=800&q=80',
  'The Golden City rises from the Thar Desert like a mirage. Ancient havelis, camel safaris, and a 12th-century golden sandstone fort await the brave explorer.'
),
(
  'Leh', 'Ladakh', 'India', 'leh-ladakh',
  'https://images.unsplash.com/photo-1596376989884-d60a7e4fc64e?w=800&q=80',
  'At 3,500 metres, Leh is India''s highest adventure playground. Ancient monasteries, Pangong Lake, magnetic hills, and the world''s highest motorable passes.'
)
ON CONFLICT (slug) DO NOTHING;

-- ===================
-- PACKAGES
-- ===================

-- Uttarakhand packages
INSERT INTO packages (destination_id, title, slug, description, short_description, price_paise, duration_days, max_group_size, difficulty, includes, images, is_featured) VALUES
(
  (SELECT id FROM destinations WHERE slug = 'rishikesh-uttarakhand'),
  'Rishikesh Adventure Camp',
  'rishikesh-adventure-camp',
  'The ultimate solo adventure in the yoga capital of the world! This 4-day camp includes white-water rafting on Grade 3-4 rapids, bungee jumping from a 83-meter platform, a guided trek to Neer Garh Waterfall, and morning yoga sessions by the Ganga. Stay in riverside camps and connect with fellow adventurers from across India.

Itinerary:
Day 1: Arrival, riverside camp setup, evening aarti at Triveni Ghat
Day 2: White-water rafting + cliff jumping
Day 3: Bungee jump + waterfall trek
Day 4: Morning yoga, departure',
  'Rafting, bungee jumping, and yoga in the adventure capital of India.',
  899900,
  4,
  12,
  'challenging',
  ARRAY['Camp accommodation', 'All meals', 'Rafting gear', 'Bungee jump', 'Yoga sessions', 'Guide'],
  ARRAY['https://images.unsplash.com/photo-1545652985-5edd365b12eb?w=800&q=80'],
  true
),
(
  (SELECT id FROM destinations WHERE slug = 'rishikesh-uttarakhand'),
  'Valley of Flowers Trek',
  'valley-of-flowers-trek',
  'Trek through the UNESCO World Heritage Valley of Flowers, a pristine high-altitude Himalayan meadow bursting with hundreds of wild alpine flowers. This 6-day trek takes you through dense forests of rhododendron and oak to emerge in one of India''s most breathtaking landscapes.

Itinerary:
Day 1-2: Govindghat to Ghangaria (13 km)
Day 3: Valley of Flowers exploration
Day 4: Hemkund Sahib (optional)
Day 5-6: Return trek and departure',
  '6-day trek to a UNESCO World Heritage alpine meadow full of wildflowers.',
  1499900,
  6,
  10,
  'moderate',
  ARRAY['Homestay & tents', 'All meals', 'Trek guide', 'Porter support', 'Permits'],
  ARRAY['https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80'],
  false
),

-- Himachal Pradesh packages
(
  (SELECT id FROM destinations WHERE slug = 'manali-himachal'),
  'Spiti Valley Expedition',
  'spiti-valley-expedition',
  'An epic 8-day journey through one of India''s most remote and stunning valleys. Spiti Valley sits at an average altitude of 4,270 metres, home to ancient Buddhist monasteries, dramatic lunar landscapes, and a culture unchanged for centuries. You''ll cross the highest motorable passes in the world and camp under star-filled skies.

Highlights: Key Monastery, Kibber Village, Chandratal Lake (Moon Lake), Kunzum Pass (4,590m)',
  'Epic 8-day journey through remote Himalayan villages and Buddhist monasteries.',
  2299900,
  8,
  8,
  'challenging',
  ARRAY['Guesthouse & camping', 'All meals', 'Inner line permits', '4WD vehicle', 'Guide', 'Oxygen cylinder'],
  ARRAY['https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=800&q=80'],
  true
),
(
  (SELECT id FROM destinations WHERE slug = 'manali-himachal'),
  'Manali Snow Retreat',
  'manali-snow-retreat',
  'A perfect 3-day winter escape to snow-covered Manali. Stay in cozy guesthouses in Old Manali, explore Solang Valley for snow activities like skiing and sledding, visit ancient Hadimba Temple, and sip chai while watching snow fall on the Beas River.

Perfect for first-time solo travelers — easy paced, safe, and social.',
  'Cozy 3-day winter escape with skiing, temples, and mountain views.',
  699900,
  3,
  15,
  'easy',
  ARRAY['Guesthouse', 'Breakfast', 'Snow activity pass', 'Local guide', 'Airport transfer'],
  ARRAY['https://images.unsplash.com/photo-1613395877344-13d4a8e0d49e?w=800&q=80'],
  false
),

-- Kerala packages
(
  (SELECT id FROM destinations WHERE slug = 'alleppey-kerala'),
  'Kerala Backwaters Escape',
  'kerala-backwaters-escape',
  'Float through Kerala''s legendary backwaters on a traditional wooden houseboat (kettuvallam). This 4-day escape takes you through a magical network of canals, lakes, and rivers fringed with coconut palms and rice paddies. Share the boat with fellow solo travelers, enjoy authentic Kerala cuisine cooked fresh onboard, and witness village life at its gentlest pace.',
  'Cruise Kerala''s magical backwaters on a traditional houseboat.',
  1199900,
  4,
  8,
  'easy',
  ARRAY['Houseboat accommodation', 'All meals', 'Village visit', 'Kayaking', 'Cultural show'],
  ARRAY['https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=800&q=80'],
  true
),
(
  (SELECT id FROM destinations WHERE slug = 'alleppey-kerala'),
  'Munnar Tea Trail',
  'munnar-tea-trail',
  'Wander through rolling hills blanketed in green tea estates in Munnar, the tea capital of India. This 3-day trail includes a guided tour of a working tea factory, a sunrise trek to Meesapulimala (South India''s second highest peak), and a tour of Eravikulam National Park to spot the endangered Nilgiri Tahr.',
  '3-day trek through Kerala''s misty tea gardens and hilltop wildlife.',
  899900,
  3,
  12,
  'moderate',
  ARRAY['Plantation stay', 'All meals', 'Tea factory tour', 'Trekking guide', 'National Park entry'],
  ARRAY['https://images.unsplash.com/photo-1513581166391-887a96ddeafd?w=800&q=80'],
  false
),

-- Goa packages
(
  (SELECT id FROM destinations WHERE slug = 'goa'),
  'North Goa Beach Hop',
  'north-goa-beach-hop',
  'Hit all the iconic North Goa beaches in this fun 3-day solo-friendly trip. From the party vibes of Anjuna and Vagator to the serene beauty of Arambol in the north. Learn to surf, explore flea markets, taste the best Goan seafood, and watch spectacular sunsets over the Arabian Sea. Accommodation in a social hostel where you''ll meet fellow travelers instantly.',
  'Surf, flea markets, and beach sunsets across North Goa.',
  599900,
  3,
  16,
  'easy',
  ARRAY['Hostel dorm', 'Breakfast', 'Surfing lesson', 'Scooter rental', 'Beach party'],
  ARRAY['https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=800&q=80'],
  false
),

-- Rajasthan packages
(
  (SELECT id FROM destinations WHERE slug = 'jaisalmer-rajasthan'),
  'Jaisalmer Desert Safari',
  'jaisalmer-desert-safari',
  'The most magical experience in Rajasthan — a 3-day desert safari through the golden dunes of the Thar. Ride camels at sunset, sleep under a billion stars in a luxury desert camp, watch traditional Rajasthani folk performers dance by a bonfire, and explore the stunning Jaisalmer Fort that rises from the desert like a golden mirage.

No AC in the desert — just stars, sand, and silence.',
  'Camel safari, desert camps, and stargazing in the Thar Desert.',
  999900,
  3,
  10,
  'moderate',
  ARRAY['Desert camp', 'All meals', 'Camel ride', 'Folk performance', 'Fort guide', '4WD jeep'],
  ARRAY['https://images.unsplash.com/photo-1587474260584-136574528ed5?w=800&q=80'],
  true
),

-- Ladakh packages
(
  (SELECT id FROM destinations WHERE slug = 'leh-ladakh'),
  'Pangong Lake Road Trip',
  'pangong-lake-road-trip',
  'One of India''s most iconic road trips — from Leh to the otherworldly Pangong Tso Lake (4,350m), the shimmering blue lake that changes colors through the day. This 5-day trip includes acclimatization days in Leh, visits to Thiksey and Hemis monasteries, the Khardung La pass (one of the world''s highest motorable passes), and camping beside Pangong Lake.',
  'Epic 5-day road trip from Leh to the legendary Pangong Lake.',
  2499900,
  5,
  8,
  'moderate',
  ARRAY['Guesthouse & camping', 'All meals', 'Inner line permits', '4WD vehicle', 'Driver', 'Oxygen support'],
  ARRAY['https://images.unsplash.com/photo-1626015365107-80c4ad468739?w=800&q=80'],
  true
),
(
  (SELECT id FROM destinations WHERE slug = 'leh-ladakh'),
  'Leh Monastery Circuit',
  'leh-monastery-circuit',
  'Immerse yourself in the ancient Buddhist culture of Ladakh on this 4-day monastery circuit. Visit Thiksey Monastery (resembling the Potala Palace), the 1,000-year-old Lamayuru, the dramatically perched Stakna, and the beautiful murals of Alchi. Stay with local families in traditional homes and wake up to monks chanting at dawn.',
  '4-day deep dive into Ladakh''s ancient Buddhist monasteries.',
  1399900,
  4,
  10,
  'easy',
  ARRAY['Homestay', 'All meals', 'Monastery permits', 'Local guide', 'Airport transfers'],
  ARRAY['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80'],
  false
)
ON CONFLICT (slug) DO NOTHING;

-- ===================
-- COMMUNITY CHAT ROOMS
-- ===================
INSERT INTO chat_rooms (name, type, is_active) VALUES
('Himalayan Trekkers', 'general', true),
('Beach Hoppers India', 'general', true),
('Solo Safety & Tips', 'general', true),
('Budget Travel India', 'general', true),
('Gear & Packing', 'general', true)
ON CONFLICT DO NOTHING;

-- Seed some messages in general rooms
WITH room AS (SELECT id FROM chat_rooms WHERE name = 'Solo Safety & Tips' LIMIT 1)
INSERT INTO messages (room_id, user_id, content, message_type)
SELECT room.id, null, '👋 Welcome to Solo Safety & Tips! Share your safety tips and ask questions here.', 'system'
FROM room
ON CONFLICT DO NOTHING;

WITH room AS (SELECT id FROM chat_rooms WHERE name = 'Himalayan Trekkers' LIMIT 1)
INSERT INTO messages (room_id, user_id, content, message_type)
SELECT room.id, null, '🏔️ Welcome Himalayan Trekkers! Share your trek stories and tips here.', 'system'
FROM room
ON CONFLICT DO NOTHING;

WITH room AS (SELECT id FROM chat_rooms WHERE name = 'Budget Travel India' LIMIT 1)
INSERT INTO messages (room_id, user_id, content, message_type)
SELECT room.id, null, '💰 Welcome Budget Travelers! Share your best money-saving tips for India.', 'system'
FROM room
ON CONFLICT DO NOTHING;
