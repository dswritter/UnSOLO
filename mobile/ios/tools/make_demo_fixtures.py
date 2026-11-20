#!/usr/bin/env python3
"""Generates the demo-mode JSON fixtures in UnSOLO/Resources/Demo/.

The fixtures follow docs/revamp/api-v1.md shapes exactly (camelCase, paise, ISO dates) so the
same files double as decoding tests. Run from anywhere:

    python3 mobile/ios/tools/make_demo_fixtures.py

Images use demo:// URLs that the app renders locally (no photo downloads).
"""
import json
import os
import uuid

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "UnSOLO", "Resources", "Demo")
NS = uuid.UUID("6f1d8a52-3c4b-4e1a-9a77-0e5d1c2b3a40")


def uid(name):
    return str(uuid.uuid5(NS, name))


def ts(day, hh=10, mm=0):
    """day is 'YYYY-MM-DD' → ISO UTC timestamp."""
    return f"{day}T{hh:02d}:{mm:02d}:00.000Z"


def media(theme, seed, w=1600, h=1150):
    return {
        "url": f"demo://photo/{theme}?seed={seed}",
        "thumbUrl": f"demo://photo/{theme}?seed={seed}&thumb=1",
        "lqip": None,
        "width": w,
        "height": h,
    }


# ---------------------------------------------------------------- people
def user(key, name, username, avatar=True, phone=True, idv=False, host=False):
    return {
        "id": uid("user:" + key),
        "username": username,
        "name": name,
        "avatarUrl": (f"demo://logo/{key}" if host else f"demo://avatar/{key}") if avatar else None,
        "isPhoneVerified": phone,
        "isIdVerified": idv,
        "isHost": host,
    }


U = {
    "me": user("me", "Dev Sharma", "devsharma", avatar=False, idv=True, host=True),
    "ananya": user("ananya", "Ananya Singh", "ananyasingh", avatar=False, idv=True),
    "rohan": user("rohan", "Rohan Mehra", "rohanmehra", idv=True),
    "kabir": user("kabir", "Kabir Malhotra", "kabir.m", idv=True),
    "riya": user("riya", "Riya Kapoor", "riyakapoor", idv=True),
    "meher": user("meher", "Meher Kaur", "meherkaur", avatar=False, idv=True),
    "rahul": user("rahul", "Rahul Verma", "rahulv"),
    "neha": user("neha", "Neha Joshi", "nehajoshi", avatar=False),
    "vikram": user("vikram", "Vikram Rao", "vikramr", avatar=False),
    "subodh": user("subodh", "Subodh Negi", "subodhn"),
    "rinku": user("rinku", "Rinku Thakur", "rinku"),
    "priya": user("priya", "Priya Sen", "priyasen", avatar=False),
    "tentit": user("tentit", "Tent It India", "tentitindia", host=True, idv=True),
    "parvati": user("parvati", "Parvati Treks", "parvatitreks", host=True, idv=True),
}
# The demo viewer is "you": phone verified, ID verified and a host so every screen is reachable.

# ---------------------------------------------------------------- trips
def trip(slug, title, place, theme, price, days, nxt, left, total, host="tentit", faces=()):
    return {
        "id": uid("trip:" + slug),
        "slug": slug,
        "title": title,
        "place": {"name": place[0], "slug": place[1], "lat": place[2], "lng": place[3]},
        "image": media(theme, 1),
        "priceFromPaise": price,
        "durationDays": days,
        "nextDeparture": nxt,
        "seatsLeft": left,
        "seatsTotal": total,
        "host": U[host],
        "goingFaces": [U[f] for f in faces],
    }


T = {
    "chalo-himachal": trip("chalo-himachal", "Chalo Himachal", ("Manali · Kasol · Bir", "himachal", 32.24, 77.19), "paragliding",
                           1469900, 10, "2026-11-26", 5, 12, faces=("rohan", "subodh", "rahul", "ananya", "kabir")),
    "rishikesh-weekend": trip("rishikesh-weekend", "Rishikesh Weekend", ("Rishikesh", "rishikesh", 30.09, 78.27), "rishikesh",
                              499900, 2, "2026-11-27", 11, 12, faces=("riya",)),
    "rupin-pass-trek": trip("rupin-pass-trek", "Rupin Pass Trek (Alpine Style)", ("Dhaula, Uttarakhand", "rupin", 31.13, 78.08), "rupin",
                            2150000, 7, "2026-11-28", 2, 10, host="parvati", faces=("priya", "kabir", "rohan", "meher")),
    "bhutan-thunder-dragon": trip("bhutan-thunder-dragon", "The land of thunder dragon, Bhutan", ("Paro & Thimphu", "bhutan", 27.43, 89.41), "bhutan",
                                  2850000, 8, "2026-12-05", 0, 12, faces=("kabir", "riya", "subodh", "rahul", "neha")),
    "kasol-kheerganga": trip("kasol-kheerganga", "Kasol – Kheerganga Trek", ("Kasol, Parvati Valley", "kasol", 32.01, 77.31), "kheerganga",
                             499900, 3, "2026-12-11", 6, 14, faces=("rinku", "vikram")),
    "tungnath-chandrashila": trip("tungnath-chandrashila", "Tungnath & Chandrashila", ("Chopta, Uttarakhand", "chopta", 30.49, 79.21), "tungnath",
                                  799900, 4, "2026-12-18", 4, 12, faces=("riya", "rahul", "priya")),
    "spiti-winter-circuit": trip("spiti-winter-circuit", "Spiti Winter Circuit", ("Kaza, Spiti", "spiti", 32.23, 78.07), "spiti",
                                 1899900, 8, "2027-01-09", 7, 10, faces=("ananya",)),
    "valley-of-flowers": trip("valley-of-flowers", "Valley of Flowers & Hemkund", ("Ghangaria, Uttarakhand", "valley-of-flowers", 30.73, 79.6), "valley",
                              1349900, 6, "2027-07-12", 12, 14, host="parvati", faces=("meher",)),
    # stays / activities / rentals share the same row with a different meter
    "parvati-riverside-hostel": trip("parvati-riverside-hostel", "Parvati riverside hostel", ("Kasol", "kasol", 32.01, 77.31), "stay",
                                     89900, 1, "2026-11-21", 3, 8, faces=()),
    "tosh-cliffside-cottage": trip("tosh-cliffside-cottage", "Tosh cliffside cottage", ("Tosh, Parvati Valley", "tosh", 32.02, 77.45), "stay",
                                   149900, 1, "2026-11-21", 2, 4, host="parvati", faces=()),
    "bir-tandem-paragliding": trip("bir-tandem-paragliding", "Tandem paragliding, Bir", ("Bir Billing", "bir", 32.04, 76.72), "paragliding",
                                   300000, 1, "2026-11-28", 6, 10, faces=()),
    "shivpuri-rafting": trip("shivpuri-rafting", "Rafting, Shivpuri to Rishikesh", ("Rishikesh", "rishikesh", 30.13, 78.38), "rishikesh",
                             120000, 1, "2026-11-22", 9, 16, faces=()),
    "manali-himalayan-rental": trip("manali-himalayan-rental", "Royal Enfield Himalayan, Manali", ("Manali", "manali", 32.24, 77.19), "rental",
                                    180000, 1, "2026-11-21", 3, 5, faces=()),
    "kasol-scooty-rental": trip("kasol-scooty-rental", "Scooty rental, Kasol", ("Kasol", "kasol", 32.01, 77.31), "rental",
                                60000, 1, "2026-11-21", 4, 6, host="parvati", faces=()),
}
CATEGORIES = {
    "trips": ["chalo-himachal", "rishikesh-weekend", "rupin-pass-trek", "bhutan-thunder-dragon", "kasol-kheerganga",
              "tungnath-chandrashila", "spiti-winter-circuit", "valley-of-flowers"],
    "stays": ["parvati-riverside-hostel", "tosh-cliffside-cottage"],
    "activities": ["shivpuri-rafting", "bir-tandem-paragliding"],
    "rentals": ["manali-himalayan-rental", "kasol-scooty-rental"],
}


def lite(slug):
    return T[slug]


# ---------------------------------------------------------------- posts
REACT0 = {"wantToGo": 0, "helpful": 0, "love": 0}


def viewer(is_author=False, membership=None, can_join=True, blocked=None, saved=False):
    return {"isAuthor": is_author, "membership": membership, "saved": saved, "canJoin": can_join, "joinBlockedReason": blocked}


def post(key, kind, author, body, created, title=None, place=None, starts=None, ends=None, spots=None, members=1,
         audience="anyone", cost=None, media_list=(), trip_slug=None, poll=None, reactions=None, my=(), comments=0,
         seats=None, v=None, meeting=None, status="live"):
    return {
        "id": uid("post:" + key),
        "kind": kind,
        "author": U[author],
        "title": title,
        "body": body,
        "place": place,
        "startsOn": starts,
        "endsOn": ends,
        "spotsTotal": spots,
        "memberCount": members,
        "audience": audience,
        "estCostText": cost,
        "media": list(media_list),
        "trip": lite(trip_slug) if trip_slug else None,
        "poll": poll,
        "reactions": reactions or dict(REACT0),
        "myReactions": list(my),
        "commentCount": comments,
        "status": status,
        "seats": seats or [],
        "createdAt": created,
        "updatedAt": created,
        "viewer": v or viewer(),
        "meetingPoint": meeting,
    }


def seat(state, who=None):
    return {"state": state, "user": U[who] if who else None}


def place(name, slug, lat, lng):
    return {"name": name, "slug": slug, "lat": lat, "lng": lng}


def opt(key, label, votes):
    return {"id": uid("opt:" + key), "label": label, "votes": votes}


P = {}
P["spiti"] = post("spiti", "plan", "ananya",
                  "HRTC bus Delhi → Shimla → Kaza, homestays in Kaza and Langza, a shared cab to Key and Chicham. "
                  "Looking for 3 easy-going people, not a party trip.",
                  ts("2026-11-20", 6, 30), title="Spiti in January, anyone?", place=place("Kaza, Spiti", "spiti", 32.23, 78.07),
                  starts="2027-01-12", ends="2027-01-18", spots=5, members=2, audience="verified",
                  cost="Est. ₹14,000 each, split among yourselves", reactions={"wantToGo": 31, "helpful": 4, "love": 9},
                  comments=5, seats=[seat("organiser", "ananya"), seat("member", "rohan"), seat("open"), seat("open"), seat("open")])
P["tosh"] = post("tosh", "plan", "me",
                 "Bhuntar by Volvo, then Barshaini. Night one in Tosh, night two at a Kalga homestay. Saturday is a slow day "
                 "for Pulga's forest walk. I approve each request.",
                 ts("2026-11-14", 9), title="Tosh & Kalga weekend", place=place("Tosh, Parvati Valley", "tosh", 32.02, 77.45),
                 starts="2026-12-04", ends="2026-12-06", spots=6, members=4, audience="verified", cost="Est. ₹4,500 each",
                 reactions={"wantToGo": 12, "helpful": 1, "love": 3}, comments=2,
                 seats=[seat("you", "me"), seat("member", "subodh"), seat("member", "priya"), seat("member", "rahul"), seat("open"), seat("open")],
                 v=viewer(is_author=True, membership="approved", can_join=False, blocked="own_plan"),
                 meeting="Majnu ka Tilla bus stand, gate 2 · Thu 3 Dec, 19:30")
P["lodhi"] = post("lodhi", "plan", "kabir",
                  "Easy 5 km walk, then chai at the Lodhi Colony market. First-timers welcome, we keep it relaxed.",
                  ts("2026-11-18", 12), title="Sunrise at Lodhi Garden", place=place("Lodhi Garden, Delhi", "delhi", 28.59, 77.22),
                  starts="2026-11-22", ends="2026-11-22", spots=10, members=9, audience="anyone", cost="Free · bring your own chai money",
                  reactions={"wantToGo": 18, "helpful": 2, "love": 11}, comments=3,
                  seats=[seat("organiser", "kabir"), seat("you", "me"), seat("member", "riya"), seat("member", "rahul"), seat("member", "neha"),
                         seat("member", "priya"), seat("member", "rinku"), seat("member", "vikram"), seat("member", "subodh"), seat("open")],
                  v=viewer(membership="approved", can_join=False), meeting="Gate 1, Lodhi Road · Sun 06:15")
P["flowers"] = post("flowers", "plan", "meher",
                    "Women-only group for the Valley of Flowers in peak bloom. Govindghat → Ghangaria → the valley and Hemkund. "
                    "Two of us so far, both verified.",
                    ts("2026-11-19", 15), title="Valley of Flowers in July, women only", place=place("Ghangaria, Uttarakhand", "valley-of-flowers", 30.73, 79.6),
                    starts="2027-07-10", ends="2027-07-15", spots=4, members=2, audience="women", cost="Est. ₹12–15k each",
                    reactions={"wantToGo": 44, "helpful": 6, "love": 20}, comments=1,
                    seats=[seat("organiser", "meher"), seat("member", "riya"), seat("open"), seat("open")],
                    v=viewer(can_join=False, blocked="women_only"))
P["kheerganga"] = post("kheerganga", "plan", "rinku",
                       "Barshaini to Kheerganga on Saturday, hot springs at the top, back down Sunday. Need 3 more who are okay with a 12 km climb.",
                       ts("2026-11-19", 18), title="Kheerganga on Sat 5 Dec", place=place("Kasol, Parvati Valley", "kasol", 32.01, 77.31),
                       starts="2026-12-05", ends="2026-12-06", spots=6, members=3, audience="anyone", cost="Est. ₹3,000 each",
                       reactions={"wantToGo": 9, "helpful": 0, "love": 2}, comments=0,
                       seats=[seat("organiser", "rinku"), seat("member", "vikram"), seat("member"), seat("open"), seat("open"), seat("open")])

P["volvo"] = post("volvo", "story", "rohan",
                  "We met at Majnu ka Tilla as strangers. By Bir we had a group chat called \"Volvo gang\" and a plan to come back for the "
                  "Billing take-off in March. Sanjay is the pilot to ask for.",
                  ts("2026-10-12", 14), title="10 strangers, one Volvo, and the best paragliding day of my life",
                  place=place("Bir Billing", "bir", 32.04, 76.72), media_list=[media("paragliding", s) for s in (1, 2, 3, 4, 5)],
                  trip_slug="chalo-himachal", reactions={"wantToGo": 58, "helpful": 21, "love": 96}, my=("love",), comments=4)
P["packed"] = post("packed", "story", "meher",
                   "Ten days, one 40 L bag. Thermals and a power bank were gold. The third pair of jeans never left the bag.",
                   ts("2026-09-28", 9), title="What I packed (and didn't need) for 10 days", place=place("Himachal", "himachal", 32.24, 77.19),
                   media_list=[media("kasol", s) for s in (2, 3, 4)], trip_slug="chalo-himachal",
                   reactions={"wantToGo": 12, "helpful": 64, "love": 21}, comments=2)
P["tungnath"] = post("tungnath", "story", "riya",
                     "Chopta at 4am is cold and very dark. Chandrashila at sunrise is worth every step. Go in December for the snow.",
                     ts("2026-11-09", 7), title="Tungnath at sunrise: worth the 4am start", place=place("Chopta, Uttarakhand", "chopta", 30.49, 79.21),
                     media_list=[media("tungnath", s) for s in (1, 2, 3, 4)], trip_slug="tungnath-chandrashila",
                     reactions={"wantToGo": 37, "helpful": 9, "love": 41}, comments=2)
P["bhutan"] = post("bhutan", "story", "kabir",
                   "Paro, Thimphu and the climb to Tiger's Nest. The SDF adds up, so we split a guide and a car four ways.",
                   ts("2026-10-30", 11), title="Bhutan on a budget: Paro, Thimphu and Tiger's Nest", place=place("Paro & Thimphu", "bhutan", 27.43, 89.41),
                   media_list=[media("bhutan", s) for s in (1, 2, 3)], trip_slug="bhutan-thunder-dragon",
                   reactions={"wantToGo": 26, "helpful": 15, "love": 30}, comments=1)

P["stay"] = post("stay", "ask", "neha", "Going solo for 4 nights. Want somewhere with a common room and people to walk with, but not a party hostel.",
                 ts("2026-11-20", 4), title="Kasol solo in early December: which stay is better for meeting people?",
                 place=place("Kasol, Parvati Valley", "kasol", 32.01, 77.31),
                 poll={"options": [opt("stay1", "Parvati riverside hostel", 12), opt("stay2", "Tosh cliffside cottage", 7)], "myChoice": None},
                 reactions={"wantToGo": 3, "helpful": 8, "love": 0}, comments=3)
P["guide"] = post("guide", "ask", "vikram", "First time in the Parvati valley in winter. Is the trail obvious and is there anywhere open at the top?",
                  ts("2026-11-17", 16), title="Is Kheerganga doable in December without a guide?",
                  place=place("Kasol, Parvati Valley", "kasol", 32.01, 77.31), reactions={"wantToGo": 1, "helpful": 13, "love": 0},
                  my=("helpful",), comments=2)
P["kaza"] = post("kaza", "ask", "riya", "Planning Spiti in mid-January. What actually runs in winter?",
                 ts("2026-11-16", 13), title="Best way from Delhi to Kaza in January?", place=place("Kaza, Spiti", "spiti", 32.23, 78.07),
                 poll={"options": [opt("kaza1", "HRTC bus via Shimla", 9), opt("kaza2", "Self-drive via Shimla", 2),
                                   opt("kaza3", "Shared taxi from Reckong Peo", 5)], "myChoice": None},
                 reactions={"wantToGo": 2, "helpful": 6, "love": 0}, comments=1)

FEED = ["spiti", "volvo", "stay", "flowers", ("trip", "rupin-pass-trek"), "tungnath", "lodhi", "guide", "bhutan", "kheerganga",
        "kaza", "packed", ("trip", "kasol-kheerganga")]


def feed_items():
    out = []
    for k in FEED:
        if isinstance(k, tuple):
            out.append({"kind": "placed_trip", "trip": lite(k[1])})
        else:
            out.append(P[k])
    return out


# ---------------------------------------------------------------- comments
def comment(key, post_key, author, body, created, parent=None, replies=(), poll_choice=None):
    return {
        "id": uid("comment:" + key),
        "postId": uid("post:" + post_key),
        "parentId": uid("comment:" + parent) if parent else None,
        "author": U[author],
        "body": body,
        "pollChoice": poll_choice,
        "createdAt": created,
        "replies": list(replies),
    }


C = {
    "spiti": [
        comment("s1", "spiti", "rahul", "Is the Kunzum road open in January?", ts("2026-11-20", 7), replies=[
            comment("s1r", "spiti", "ananya", "Kunzum's closed, so we go in via Shimla and Reckong Peo.", ts("2026-11-20", 7, 40), parent="s1")]),
        comment("s2", "spiti", "kabir", "Did this route last winter. Carry cash, the Kaza ATM runs out.", ts("2026-11-20", 8), replies=[
            comment("s2r", "spiti", "ananya", "Noted, thanks Kabir!", ts("2026-11-20", 8, 20), parent="s2")]),
        comment("s3", "spiti", "tentit", "We run a Spiti winter departure on 9 Jan if anyone wants a hosted option alongside.", ts("2026-11-20", 9)),
    ],
    "volvo": [
        comment("v1", "volvo", "ananya", "That Bir landing video! I'm on the 26 Nov batch.", ts("2026-10-12", 18), replies=[
            comment("v1r", "volvo", "rohan", "You'll love it. Ask for Sanjay, best pilot there.", ts("2026-10-12", 19), parent="v1")]),
        comment("v2", "volvo", "riya", "Saving this for March.", ts("2026-10-13", 9)),
        comment("v3", "volvo", "meher", "Volvo gang forever", ts("2026-10-14", 9)),
    ],
    "stay": [
        comment("st1", "stay", "riya", "Riverside. The common room has a fire every night and people plan walks there.", ts("2026-11-20", 5), poll_choice=uid("opt:stay1")),
        comment("st2", "stay", "parvati", "Tosh is quieter in December, lots of cafés shut. Kasol is the better base for meeting people.", ts("2026-11-20", 5, 30)),
    ],
    "guide": [
        comment("g1", "guide", "tentit", "Doable. The trail is clear but icy after 3 pm, so start by 8. Most dhabas at the top shut by mid-December.", ts("2026-11-17", 18), replies=[
            comment("g1r", "guide", "vikram", "Super helpful, thank you!", ts("2026-11-17", 19), parent="g1")]),
    ],
    "tosh": [
        comment("t1", "tosh", "priya", "Can we leave Friday night instead of Thursday?", ts("2026-11-16", 10), replies=[
            comment("t1r", "tosh", "me", "Thursday night bus gets us there for Friday breakfast, so let's keep it.", ts("2026-11-16", 11), parent="t1")]),
    ],
    "tungnath": [
        comment("tu1", "tungnath", "rahul", "Which month has the snow on the trail?", ts("2026-11-09", 12), replies=[
            comment("tu1r", "tungnath", "riya", "Late December to February.", ts("2026-11-09", 13), parent="tu1")]),
    ],
    "lodhi": [
        comment("l1", "lodhi", "neha", "Is there parking near gate 1?", ts("2026-11-18", 14)),
    ],
}

# ---------------------------------------------------------------- offers and requests
OFFERS = {
    "tosh": [
        {"id": uid("offer:tentit-tosh"), "postId": uid("post:tosh"), "host": U["tentit"], "pricePaise": 549900,
         "includes": ["Volvo Delhi ↔ Bhuntar", "Cab to Barshaini", "2 nights, Kalga homestay", "Trek guide, Saturday kept free"],
         "notes": "We've run Kalga 14 times. Happy to keep your Saturday free for Pulga.", "extraSeats": 0, "state": "pending",
         "expiresAt": ts("2026-11-26"), "packageSlug": None, "payBy": None},
        {"id": uid("offer:parvati-tosh"), "postId": uid("post:tosh"), "host": U["parvati"], "pricePaise": 599900,
         "includes": ["Tempo traveller from Delhi", "2 nights, Tosh guesthouse", "Breakfast and dinner"],
         "notes": "Small group, local guide from Tosh.", "extraSeats": 2, "state": "pending",
         "expiresAt": ts("2026-11-25"), "packageSlug": None, "payBy": None},
    ]
}


def req_user(key, trips, avg, mutuals):
    u = dict(U[key])
    u.update({"tripsCount": trips, "reviewsAvg": avg, "mutuals": mutuals})
    return u


REQUESTS = {
    "tosh": [
        {"user": req_user("kabir", 3, 4.8, 1), "intro": "Hey Dev! Did Kheerganga last year, easy-going, I carry a first-aid kit. Would love to join.",
         "state": "requested", "createdAt": ts("2026-11-20", 6), "expiresAt": ts("2026-11-23", 6)},
        {"user": req_user("neha", 1, None, 2), "intro": "Solo traveller from Pune, second Himachal trip. Okay with the Thursday night bus.",
         "state": "requested", "createdAt": ts("2026-11-20", 7), "expiresAt": ts("2026-11-23", 7)},
    ]
}

# ---------------------------------------------------------------- bookings / my trips
def booking(key, slug, date, total, paid, code, room=None, status="confirmed", prompt=None):
    b = {"id": uid("booking:" + key), "status": status, "travelDate": date, "guests": 1, "totalPaise": total, "paidPaise": paid,
         "balancePaise": total - paid, "confirmationCode": code, "trip": lite(slug), "chatRoomId": uid("room:" + room) if room else None}
    if prompt is not None:
        b["storyPrompt"] = prompt
    return b


MY_TRIPS = {
    "upcoming": [booking("himachal", "chalo-himachal", "2026-11-26", 1469900, 400000, "UNS-7K2Q9", room="himachal")],
    "plans": [P["tosh"], P["lodhi"]],
    "requested": [],
    "past": [
        booking("rishikesh", "rishikesh-weekend", "2026-10-18", 499900, 499900, "UNS-4H8PZ", room="rishikesh", status="completed", prompt=True),
        booking("tungnath", "tungnath-chandrashila", "2026-02-14", 799900, 799900, "UNS-2M6XA", status="completed", prompt=False),
        booking("kheerganga", "kasol-kheerganga", "2025-12-12", 499900, 499900, "UNS-9T3LC", status="completed", prompt=False),
    ],
}

# ---------------------------------------------------------------- trip details
def detail(slug, description, includes, themes, departures, rating, stories=(), planning=None, extra_seats=()):
    t = dict(T[slug])
    total = t["seatsTotal"] or 0
    left = t["seatsLeft"] or 0
    seats = [seat("host", t["host"]["username"] and [k for k, v in U.items() if v["id"] == t["host"]["id"]][0])]
    taken = total - left
    faces = [k for k, v in U.items() if v in t["goingFaces"]]
    for f in faces:
        if len(seats) < taken:
            seats.append(seat("member", f))
    while len(seats) < taken:
        seats.append(seat("member"))
    while len(seats) < total:
        seats.append(seat("open"))
    t.update({
        "description": description,
        "includes": includes,
        "images": [media(th, i + 1) for i, th in enumerate(themes)],
        "departures": [{"date": d, "seatsLeft": l, "seatsTotal": n} for d, l, n in departures],
        "seats": seats,
        "rating": {"avg": rating[0], "count": rating[1]},
        "stories": [P[s] for s in stories],
        "planningCount": planning,
    })
    return t


DETAILS = {
    "chalo-himachal": detail("chalo-himachal",
                             "Delhi → Manali → Kasol → Bir. Volvo both ways, Solang and Atal Tunnel, riverside camp in Kasol and a paragliding day in Bir.",
                             ["Volvo Delhi ↔ Manali", "9 nights, hostels and camps", "Breakfast and dinner", "Paragliding in Bir", "Trip captain"],
                             ["paragliding", "himachal", "kasol", "camp", "bir", "kheerganga"],
                             [("2026-11-26", 5, 12), ("2026-12-10", 9, 12), ("2026-12-24", 12, 12)], (4.8, 61),
                             stories=("volvo", "packed"), planning=14),
    "rishikesh-weekend": detail("rishikesh-weekend", "Rafting at Shivpuri, a riverside camp, Ganga aarti at Triveni Ghat and a café crawl in Tapovan.",
                                ["AC tempo traveller from Delhi", "1 night riverside camp", "Rafting (16 km)", "Meals at camp"],
                                ["rishikesh", "ganga", "camp"], [("2026-11-27", 11, 12), ("2026-12-04", 12, 12)], (4.7, 132)),
    "rupin-pass-trek": detail("rupin-pass-trek", "A 7-day crossing from Dhaula to Sangla over the 15,250 ft Rupin Pass. Hanging villages, waterfalls and snow fields.",
                              ["Trek leader and support staff", "All meals on trek", "Tents and sleeping bags", "Permits"],
                              ["rupin", "alpine", "camp"], [("2026-11-28", 2, 10)], (4.9, 40)),
    "bhutan-thunder-dragon": detail("bhutan-thunder-dragon", "Paro, Thimphu and Punakha with a guided climb to Tiger's Nest. SDF and permits handled.",
                                    ["Flights from Bagdogra by road", "7 nights, 3-star hotels", "Guide and permits", "Breakfast and dinner"],
                                    ["bhutan", "dzong", "valley"], [("2026-12-05", 0, 12), ("2027-03-14", 8, 12)], (4.8, 28), stories=("bhutan",)),
    "kasol-kheerganga": detail("kasol-kheerganga", "Kasol cafés, the Kheerganga climb with hot springs at the top, and a night under the stars.",
                               ["Volvo Delhi ↔ Bhuntar", "2 nights (camp + guesthouse)", "Trek guide", "Breakfast and dinner"],
                               ["kheerganga", "kasol", "camp"], [("2026-12-11", 6, 14), ("2026-12-18", 14, 14)], (4.6, 210), planning=6),
    "tungnath-chandrashila": detail("tungnath-chandrashila", "Chopta camp, the world's highest Shiva temple at Tungnath and sunrise on Chandrashila.",
                                    ["Tempo traveller from Delhi", "3 nights, Chopta camp", "Trek guide", "All meals"],
                                    ["tungnath", "kedar", "camp"], [("2026-12-18", 4, 12), ("2027-01-08", 12, 12)], (4.8, 95), stories=("tungnath",)),
    "spiti-winter-circuit": detail("spiti-winter-circuit", "Shimla → Kalpa → Kaza in deep winter. Key monastery, Langza, Hikkim post office and frozen streams.",
                                   ["Tempo traveller from Shimla", "7 nights, homestays", "All meals", "Trip captain"],
                                   ["spiti", "alpine", "camp"], [("2027-01-09", 7, 10)], (4.9, 22), planning=14),
    "valley-of-flowers": detail("valley-of-flowers", "Govindghat → Ghangaria → the Valley of Flowers in bloom, and Hemkund Sahib.",
                                ["Tempo traveller from Rishikesh", "5 nights, guesthouses", "Trek guide", "All meals"],
                                ["valley", "flowers", "camp"], [("2027-07-12", 12, 14), ("2027-08-02", 14, 14)], (4.7, 51), planning=3),
}
for s in CATEGORIES["stays"] + CATEGORIES["activities"] + CATEGORIES["rentals"]:
    t = T[s]
    DETAILS[s] = detail(s, f"{t['title']} in {t['place']['name']}. Hosted on UnSOLO, pay on the web checkout.",
                        ["Free cancellation up to 48h", "Host on call"], [t["image"]["url"].split("/")[3].split("?")[0]] * 2,
                        [(t["nextDeparture"], t["seatsLeft"], t["seatsTotal"])], (4.6, 18))

# ---------------------------------------------------------------- notifications
N = [
    {"id": uid("n:join-kabir"), "type": "tribe_join_request", "category": "plans", "title": "Kabir wants to join Tosh & Kalga weekend",
     "body": "3 trips, verified · 1 mutual", "link": f"/tribe/p/{uid('post:tosh')}", "isRead": False, "createdAt": ts("2026-11-20", 7),
     "postId": uid("post:tosh"), "actorId": U["kabir"]["id"]},
    {"id": uid("n:join-neha"), "type": "tribe_join_request", "category": "plans", "title": "Neha wants to join Tosh & Kalga weekend",
     "body": "1 trip, 2 mutual", "link": f"/tribe/p/{uid('post:tosh')}", "isRead": False, "createdAt": ts("2026-11-20", 6, 50),
     "postId": uid("post:tosh"), "actorId": U["neha"]["id"]},
    {"id": uid("n:offer"), "type": "host_offer", "category": "plans", "title": "Tent It India offered to run your plan as a hosted trip",
     "body": "₹5,499 each · stays and transport included · your group stays together", "link": f"/tribe/p/{uid('post:tosh')}",
     "isRead": False, "createdAt": ts("2026-11-20", 5)},
    {"id": uid("n:msg"), "type": "message", "category": "messages", "title": "Rahul: Bro, same bus? I'm seat 3", "body": "Chalo Himachal",
     "link": f"/chat/{uid('room:dm-rahul')}", "isRead": False, "createdAt": ts("2026-11-20", 4)},
    {"id": uid("n:match"), "type": "match", "category": "plans", "title": "3 travellers are planning Kasol on your dates, 1–3 Dec",
     "body": "Matched from plans and stays", "link": "/tribe", "isRead": True, "createdAt": ts("2026-11-19", 18)},
    {"id": uid("n:reply"), "type": "reply", "category": "replies", "title": "Ananya replied to your comment: “Kunzum's closed, so we go in via Shimla…”",
     "body": "Spiti in January", "link": f"/tribe/p/{uid('post:spiti')}", "isRead": True, "createdAt": ts("2026-11-19", 9)},
    {"id": uid("n:trip"), "type": "trip_reminder", "category": "trips", "title": "Chalo Himachal leaves in 6 days",
     "body": "Pickup 18:30 at Majnu ka Tilla. Balance ₹10,699 due Mon 23 Nov.", "link": "/bookings", "isRead": True, "createdAt": ts("2026-11-19", 4)},
    {"id": uid("n:helpful"), "type": "reaction", "category": "replies", "title": "Vikram and 12 others found your answer helpful",
     "body": "Is Kheerganga doable in December without a guide?", "link": f"/tribe/p/{uid('post:guide')}", "isRead": True, "createdAt": ts("2026-11-18", 9)},
]

# ---------------------------------------------------------------- chats
def chat(key, typ, name, image, last, at, author, unread, req=False):
    return {"id": uid("room:" + key), "type": typ, "name": name, "image": image,
            "lastMessage": {"body": last, "at": at, "authorName": author} if last else None, "unread": unread, "isRequest": req}


CHATS = [
    chat("dm-rahul", "direct", "Rahul Verma", {"url": "demo://avatar/rahul", "thumbUrl": None, "lqip": None, "width": None, "height": None},
         "Bro, same bus? I'm seat 3", ts("2026-11-20", 4), "Rahul", 2),
    chat("himachal", "trip", "Chalo Himachal", media("paragliding", 1), "I've got a 20k one, will share. Also bringing Uno cards",
         ts("2026-11-19", 13, 14), "You", 12),
    chat("tosh", "general", "Tosh & Kalga weekend · plan", media("kasol", 2), "Thursday night bus it is", ts("2026-11-18", 15), "Priya", 5),
    chat("dm-ananya", "direct", "Ananya Singh", None, "Count me in for Spiti if a spot opens", ts("2026-11-16", 10), "You", 0),
    chat("dm-tentit", "direct", "Tent It India", {"url": "demo://logo/tentit", "thumbUrl": None, "lqip": None, "width": None, "height": None},
         "Pickup is at gate 2, near the Gurudwara", ts("2026-11-14", 12), "Tent It India", 0),
    chat("req-vikram", "direct", "Vikram Rao", None, "Hi! Saw your Tosh plan, is it still open?", ts("2026-11-20", 8), "Vikram", 1, req=True),
    chat("req-neha", "direct", "Neha Joshi", None, "Is the Kalga homestay women-friendly?", ts("2026-11-20", 5), "Neha", 1, req=True),
]


def msg(key, author, body, at, typ="text"):
    return {"id": uid("msg:" + key), "clientId": None, "author": U[author], "body": body, "type": typ, "createdAt": at, "editedAt": None}


MESSAGES = {
    uid("room:himachal"): [
        msg("h0", "tentit", "Tent It India added you to Chalo Himachal", ts("2026-11-12", 9), "system"),
        msg("h1", "tentit", "Welcome everyone! Bus leaves 18:30 sharp from Majnu ka Tilla.", ts("2026-11-19", 11, 32)),
        msg("h2", "ananya", "Who's carrying a power bank? Mine is dead already", ts("2026-11-19", 13, 12)),
        msg("h3", "me", "I've got a 20k one, will share. Also bringing Uno cards", ts("2026-11-19", 13, 14)),
        msg("h4", "rohan", "Day 4 evening in Kasol: café hop in Old Kasol?", ts("2026-11-19", 14)),
    ],
    uid("room:dm-rahul"): [
        msg("r1", "rahul", "Hey! Saw you're on the 26 Nov Himachal batch", ts("2026-11-20", 3, 55)),
        msg("r2", "rahul", "Bro, same bus? I'm seat 3", ts("2026-11-20", 4)),
    ],
    uid("room:tosh"): [
        msg("t1", "me", "Plan chat is open. Meeting point is in the plan.", ts("2026-11-15", 9)),
        msg("t2", "priya", "Thursday night bus it is", ts("2026-11-18", 15)),
    ],
    uid("room:dm-ananya"): [msg("a1", "me", "Count me in for Spiti if a spot opens", ts("2026-11-16", 10))],
    uid("room:dm-tentit"): [msg("tt1", "tentit", "Pickup is at gate 2, near the Gurudwara", ts("2026-11-14", 12))],
    uid("room:req-vikram"): [msg("v1", "vikram", "Hi! Saw your Tosh plan, is it still open?", ts("2026-11-20", 8))],
    uid("room:req-neha"): [msg("n1", "neha", "Is the Kalga homestay women-friendly?", ts("2026-11-20", 5))],
}

# ---------------------------------------------------------------- profiles
def profile(key, bio, city, trips, followers, following, posts, open_plan=None, following_me=False):
    u = dict(U[key])
    u.update({"bio": bio, "homeCity": city, "tripsCount": trips, "followers": followers, "following": following})
    return {"user": u, "posts": [P[p] for p in posts], "openPlan": P[open_plan] if open_plan else None, "isFollowing": following_me}


PROFILES = {
    "devsharma": profile("me", "Weekend trekker, weekday spreadsheet person. Hosting small groups in the Parvati valley.", "Delhi", 6, 41, 58,
                         ["tosh"], open_plan="tosh"),
    "ananyasingh": profile("ananya", "Mountains over beaches. Slow travel, homestays, long bus rides.", "Delhi", 3, 120, 88,
                           ["spiti"], open_plan="spiti", following_me=True),
    "rohanmehra": profile("rohan", "Paragliding, Volvo naps and chai.", "Gurugram", 5, 210, 140, ["volvo"]),
    "kabir.m": profile("kabir", "Delhi mornings, Bhutan dreams.", "Delhi", 3, 64, 70, ["lodhi", "bhutan"], open_plan="lodhi"),
    "riyakapoor": profile("riya", "Sunrise chaser.", "Dehradun", 7, 300, 120, ["tungnath", "kaza"]),
    "meherkaur": profile("meher", "Packing light since 2019.", "Chandigarh", 4, 150, 96, ["flowers", "packed"], open_plan="flowers"),
    "rahulv": profile("rahul", "", "Noida", 2, 22, 30, []),
    "nehajoshi": profile("neha", "Solo, curious, slow.", "Pune", 1, 18, 40, ["stay"]),
    "vikramr": profile("vikram", "", "Bengaluru", 1, 9, 12, ["guide"]),
    "rinku": profile("rinku", "Parvati valley regular.", "Kullu", 8, 77, 50, ["kheerganga"], open_plan="kheerganga"),
    "tentitindia": profile("tentit", "Small-group trips across Himachal since 2024. 14 trips run, replies in ~1h.", "Delhi", 14, 980, 12, []),
    "parvatitreks": profile("parvati", "Local guides from Tosh and Kalga.", "Kasol", 30, 410, 8, []),
}

SUGGESTIONS = {"items": [
    {"type": "trip", "reason": "Leaving soon", "trip": lite("chalo-himachal")},
    {"type": "plan", "reason": "Near you", "post": P["lodhi"]},
    {"type": "plan", "reason": "Open spots", "post": P["spiti"]},
    {"type": "trip", "reason": "Matches your interests", "trip": lite("tungnath-chandrashila")},
    {"type": "plan", "reason": "Women-only plan", "post": P["flowers"]},
]}

ME = {
    "user": dict(U["me"], email="dev@example.com", phone="+919800000000", gender="man", homeCity="Delhi",
                 bio=PROFILES["devsharma"]["user"]["bio"], dateOfBirth="1996-04-12"),
    "role": "user",
    "isStaff": False,
    "preferences": {
        "landingTab": "explore",
        "notify": {"push": {"plans": True, "replies": True, "messages": True, "trips": True, "tags": True, "marketing": False},
                   "email": {"plans": True, "replies": False, "messages": False, "trips": True, "tags": False, "marketing": False},
                   "quietHours": {"from": "22:00", "to": "07:00"}},
        "interests": ["Treks", "Mountains", "Hostels"],
        "suggestByLocation": False, "suggestByGender": False, "shareLocation": False, "dataSaver": False,
    },
    "counts": {"unreadNotifications": 3, "unreadMessages": 20},
}

CONFIG = {
    "flags": {"tribeEnabled": True, "tribePostingEnabled": True, "hostOffersEnabled": True, "pushEnabled": True},
    "minAppVersion": {"android": "1.0.0", "ios": "1.0.0"},
    "supabase": {"url": "https://demo.supabase.co", "anonKey": "demo-anon-key"},
    "upload": {"maxBytes": 2097152, "maxEdge": 2048},
    "support": {"whatsapp": "+910000000000", "email": "support@unsolo.in"},
}

LANDING = {"suggest": "tribe", "visits": {"explore": 4, "tribe": 9, "trips": 2}}


def write(name, obj):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write("\n")


def main():
    os.makedirs(OUT, exist_ok=True)
    write("config.json", CONFIG)
    write("me.json", ME)
    write("explore.json", {c: [lite(s) for s in slugs] for c, slugs in CATEGORIES.items()})
    write("trip-details.json", DETAILS)
    write("feed.json", {"items": feed_items(), "nextCursor": None, "caughtUp": True,
                        "nextDepartures": [lite("chalo-himachal"), lite("rishikesh-weekend"), lite("rupin-pass-trek")]})
    write("comments.json", {uid("post:" + k): v for k, v in C.items()})
    write("offers.json", {uid("post:" + k): v for k, v in OFFERS.items()})
    write("requests.json", {uid("post:" + k): v for k, v in REQUESTS.items()})
    write("my-trips.json", MY_TRIPS)
    write("notifications.json", {"items": N, "nextCursor": None, "unread": sum(1 for n in N if not n["isRead"])})
    write("chats.json", {"items": CHATS, "nextCursor": None})
    write("messages.json", MESSAGES)
    write("users.json", PROFILES)
    write("suggestions.json", SUGGESTIONS)
    write("landing-suggestion.json", LANDING)
    write("ids.json", {"posts": {k: uid("post:" + k) for k in P}, "rooms": {c["name"]: c["id"] for c in CHATS},
                       "users": {k: v["id"] for k, v in U.items()}, "me": U["me"]["id"]})
    print("wrote fixtures to", os.path.normpath(OUT))


if __name__ == "__main__":
    main()
