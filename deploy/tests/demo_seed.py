"""Seed STAGING with demonstration content for product screenshots: five demo
users, a shared space with text and voice channels, a channel conversation and
a direct-message conversation. Idempotent: users are created once (via an admin
invite) and their passwords kept root-only in /srv/emix/staging/demo-users.json;
messages resume after a partial run. Never run against production."""
import json, os, re, secrets, sys, time, urllib.request, urllib.error

BASE = "https://staging.getemix.com"
USERS_FILE = "/srv/emix/staging/demo-users.json"

USERS = [  # username, display name, avatar colour
    ("maya", "Maya Chen", "lavender"),
    ("leo", "Leo Hart", "sky"),
    ("sofia", "Sofia Reyes", "rose"),
    ("jordan", "Jordan Blake", "amber"),
    ("nina", "Nina Patel", "teal"),
]

SPACE = "Studio Nights"
TEXT = [("general", "Hang out, plan, catch up"), ("game-night", "Fridays at 8"), ("art-share", "Drafts, sketches and finals")]
VOICE = ["Lounge", "Stream Room"]

GENERAL = [
    ("sofia", "Morning everyone ☀️ Who's around for game night on Friday?"),
    ("leo", "I'm in. Still thinking about last week's rematch 😅"),
    ("jordan", "Count me in! I'll open the Stream Room around 8."),
    ("nina", "Same here. Could someone pull up the patch notes before we start?"),
    ("maya", "On it. I'll share my screen during the call so we can go through them together."),
    ("leo", "Perfect. Also Maya, the album cover drafts look incredible."),
    ("maya", "Thank you! Final versions go up in #art-share tonight. Honest feedback welcome 🎨"),
    ("sofia", "Can't wait to see them 💜"),
    ("jordan", "Friday at 8 it is. I'll ping everyone ten minutes before."),
]
DM = [
    ("leo", "Thanks again for walking me through the layout last night 🙌"),
    ("maya", "Anytime! Want to jump on a quick call later to review the final colours?"),
    ("leo", "Yes please. 7 works for me, I'll share the mockups on screen."),
    ("maya", "Perfect, talk then 💜"),
]


def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def ok(label, s, r, codes=(200, 201)):
    if s not in codes:
        sys.exit(f"FAIL {label}: {s} {json.dumps(r)[:300]}")


if not os.path.exists(USERS_FILE):
    cred = open("/root/emix-admin-staging.txt").read()
    admin_pw = re.search(r"^Password: (.+)$", cred, re.M).group(1)
    s, r = call("POST", "/api/auth/login", {"username": "hero", "password": admin_pw}); ok("admin login", s, r)
    s, r = call("POST", "/api/admin/invites", {"name": "demo-content", "maxUses": len(USERS), "expiresAt": None}, r["token"])
    ok("admin invite", s, r)
    inv = r.get("invite", r); tok = inv.get("token") or inv.get("code")
    creds = {}
    for name, display, _ in USERS:
        pw = "Pw-" + secrets.token_hex(12)
        s, r = call("POST", "/api/auth/register", {"username": name, "password": pw, "displayName": display, "inviteToken": tok})
        ok(f"register {name}", s, r)
        creds[name] = pw
    fd = os.open(USERS_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.write(fd, json.dumps(creds).encode()); os.close(fd)

creds = json.load(open(USERS_FILE))
u = {}
for name, display, colour in USERS:
    s, r = call("POST", "/api/auth/login", {"username": name, "password": creds[name]}); ok(f"login {name}", s, r)
    u[name] = {"token": r["token"], "id": r["user"]["id"]}
    s, r = call("PATCH", "/api/users/@me", {"displayName": display, "avatarColor": colour}, r["token"]); ok(f"profile {name}", s, r)
T = lambda n: u[n]["token"]

# Friendships with Maya (the screenshot viewer).
for name in ("leo", "sofia", "jordan", "nina"):
    call("POST", "/api/social/requests", {"username": "maya"}, T(name))
s, reqs = call("GET", "/api/social/requests", None, T("maya"))
for q in (reqs if isinstance(reqs, list) else reqs.get("incoming", reqs.get("requests", []))):
    if isinstance(q, dict) and q.get("id"):
        call("PATCH", f"/api/social/requests/{q['id']}", {"status": "accepted"}, T("maya"))

# Space, owned by Jordan.
s, spaces = call("GET", "/api/spaces", None, T("jordan"))
spaces = spaces if isinstance(spaces, list) else spaces.get("spaces", [])
space = next((x for x in spaces if x.get("name") == SPACE), None)
if not space:
    s, space = call("POST", "/api/spaces", {"name": SPACE, "avatarColor": "lavender", "description": "Game nights, art and good company."}, T("jordan"))
    ok("create space", s, space)
    space = space.get("space", space)
sid = space["id"]
s, r = call("POST", f"/api/spaces/{sid}/invite", {}, T("jordan")); ok("space invite", s, r)
for name in ("maya", "leo", "sofia", "nina"):
    call("POST", "/api/spaces/join", {"inviteCode": r["inviteCode"]}, T(name))

s, chans = call("GET", f"/api/spaces/{sid}/channels", None, T("jordan")); ok("channels", s, chans)
chans = chans if isinstance(chans, list) else chans.get("channels", [])
by_name = {(c["name"], c.get("type")): c for c in chans}
for name, topic in TEXT:
    c = next((c for (n, t), c in by_name.items() if n == name and t in ("text", None)), None)
    if not c:
        s, c = call("POST", f"/api/spaces/{sid}/channels", {"name": name, "type": "text", "topic": topic}, T("jordan")); ok(f"channel {name}", s, c)
        c = c.get("channel", c)
    else:
        call("PATCH", f"/api/channels/{c['id']}", {"topic": topic}, T("jordan"))
    by_name[(name, "text")] = c
for name in VOICE:
    if not any(n == name for (n, _) in by_name):
        s, c = call("POST", f"/api/spaces/{sid}/channels", {"name": name, "type": "voice"}, T("jordan")); ok(f"voice {name}", s, c)
# Drop the default voice channel if the space came with one we don't use.
for (n, t), c in list(by_name.items()):
    if t == "voice" and n not in VOICE:
        call("DELETE", f"/api/channels/{c['id']}", None, T("jordan"))

general = by_name[("general", "text")]["id"]
s, msgs = call("GET", f"/api/channels/{general}/messages", None, T("maya"))
msgs = msgs if isinstance(msgs, list) else msgs.get("messages", [])
for name, text in GENERAL[len(msgs):]:  # resumes after a partial run
    time.sleep(2.5)  # stay under the per-user message rate limit
    s, r = call("POST", f"/api/channels/{general}/messages", {"content": text}, T(name)); ok("post", s, r)

s, r = call("POST", "/api/dm", {"userId": u["leo"]["id"]}, T("maya")); ok("dm", s, r)
dm = r.get("id") or r.get("channel", {}).get("id")
s, msgs = call("GET", f"/api/dm/{dm}/messages", None, T("maya"))
msgs = msgs if isinstance(msgs, list) else msgs.get("messages", [])
for name, text in DM[len(msgs):]:
    time.sleep(2.5)
    s, r = call("POST", f"/api/dm/{dm}/messages", {"content": text}, T(name)); ok("dm post", s, r)

json.dump({"space": sid, "general": general, "dm": dm, "ids": {n: v["id"] for n, v in u.items()}}, sys.stdout)
print()
