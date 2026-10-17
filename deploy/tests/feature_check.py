"""Staging checks for Emix 1.12-1.14: profile styles, the changelog, themes,
usernames and ringtones. Uses the demo accounts from demo_seed.py. Never run
against production."""
import base64, io, json, math, sqlite3, struct, sys, urllib.request, urllib.error, wave

BASE = "https://staging.getemix.com"
creds = json.load(open("/srv/emix/staging/demo-users.json"))


def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


fails = 0
def check(label, cond, detail=""):
    global fails
    print(("PASS " if cond else "FAIL ") + label + (f"  {detail}" if detail and not cond else ""))
    fails += 0 if cond else 1


tok = {}
for name in ("maya", "leo"):
    s, r = call("POST", "/api/auth/login", {"username": name, "password": creds[name]})
    tok[name] = r["token"]

style = {
    "name": {"effect": "animated", "colors": ["#ff3ea5", "#9333ea", "#22a0ff"], "glow": True},
    "nameplate": "neon-pulse", "decoration": "neon-ring", "effect": "sparkles",
    "background": {"preset": "nebula"}, "glass": True, "pronouns": "she/her",
    "links": [{"label": "Portfolio", "url": "maya.example.com"}, {"label": "x", "url": "javascript:alert(1)"}],
    "css": "body{display:none}",
}
s, me = call("PATCH", "/api/users/@me", {"profileStyle": style}, tok["maya"])
ps = (me or {}).get("profileStyle") or {}
check("profile style saves", s == 200, f"{s} {me}")
check("unknown fields and unsafe links are dropped", "css" not in ps and ps.get("links") == [{"label": "Portfolio", "url": "https://maya.example.com/"}], json.dumps(ps))
s, r = call("PATCH", "/api/users/@me", {"profileStyle": {"background": {"image": "../../etc/passwd"}}}, tok["maya"])
check("path-like background image is rejected or dropped", s in (200, 400) and not ((r or {}).get("profileStyle") or {}).get("background"), f"{s} {r}")
s, r = call("PATCH", "/api/users/@me", {"profileStyle": style}, tok["maya"])  # restore the demo look

s, friends = call("GET", "/api/social/friends", None, tok["leo"])
lst = friends if isinstance(friends, list) else (friends or {}).get("friends", [])
maya = next((f for f in lst if f.get("username") == "maya"), None)
check("friends see the style", bool(maya and (maya.get("profileStyle") or {}).get("nameplate") == "neon-pulse"), json.dumps(maya)[:200])

s, info = call("GET", "/api/instance/info")
running = (info or {}).get("version")
s, cl = call("GET", "/api/changelog")
rels = (cl or {}).get("releases", [])
check(f"changelog is public and lists the running version ({running}) first", s == 200 and rels and rels[0]["version"] == running, f"{s} {str(cl)[:200]}")
check("no drafts are served", all(r["status"] == "published" for r in rels))
s, st = call("GET", "/api/changelog/state", None, tok["leo"])
check("state is per account", s == 200 and "acknowledged" in st, f"{s} {st}")
s, bad = call("POST", "/api/changelog/ack", {"version": "99.0.0"}, tok["leo"])
check("unannounced version refused", s == 400, f"{s}")
s, unauth = call("GET", "/api/changelog/state")
check("state needs sign-in", s == 401, f"{s}")
# Themes
theme_data = {"mode": "dark", "colors": {k: "#123456" for k in ("bg","sidebar","chat","elevated","input","border","text","textMuted","textFaint","message","link","accent","accent2","hover","notification")}}
s, r = call("POST", "/api/themes", {"name": "Check theme", "data": {**theme_data, "css": "x"}}, tok["maya"])
check("theme saves without unknown fields", s == 201 and "css" not in r["theme"]["data"], f"{s} {r}")
code, tid = r["theme"]["shareCode"], r["theme"]["id"]
s, r2 = call("GET", f"/api/themes/share/{code}", None, tok["leo"])
check("shared theme opens for another account", s == 200 and r2["theme"]["name"] == "Check theme", f"{s}")
s, g = call("GET", "/api/themes/gallery", None, tok["leo"])
check("private theme is not in the gallery", s == 200 and all(t["id"] != tid for t in g["themes"]))
s, _ = call("PATCH", f"/api/themes/{tid}", {"name": "x"}, tok["leo"])
check("others cannot edit a theme", s == 404, f"{s}")
s, _ = call("GET", "/api/themes/share/abc", None, None)
check("share links need sign-in", s == 401, f"{s}")
call("DELETE", f"/api/themes/{tid}", None, tok["maya"])
# Usernames (1.14). Leo is renamed and put back; the cooldown is cleared
# directly in the staging database so the demo login keeps working.
s, r = call("GET", "/api/users/@me/username/check?username=Maya", None, tok["leo"])
check("username check is case-insensitive", s == 200 and r["reason"] == "taken", f"{s} {r}")
s, r = call("GET", "/api/users/@me/username/check?username=admin", None, tok["leo"])
check("reserved names are refused", r.get("reason") == "reserved", f"{r}")
s, r = call("POST", "/api/users/@me/username", {"username": "leo_check", "password": "wrong"}, tok["leo"])
check("rename needs the password", s == 403, f"{s} {r}")
s, r = call("POST", "/api/users/@me/username", {"username": "Leo_Check", "password": creds["leo"]}, tok["leo"])
check("rename works and returns a new token", s == 200 and r["user"]["username"] == "leo_check" and r["token"], f"{s} {r}")
new_tok = (r or {}).get("token") or tok["leo"]
s, r2 = call("POST", "/api/users/@me/username", {"username": "leo_again", "password": creds["leo"]}, new_tok)
check("second rename within 30 days is refused", s == 429 and r2.get("code") == "username_change_cooldown", f"{s} {r2}")
s, fr = call("GET", "/api/social/friends", None, tok["maya"])
lst = fr if isinstance(fr, list) else (fr or {}).get("friends", [])
check("friends see the new name on the same account", any(f.get("username") == "leo_check" for f in lst))
db = sqlite3.connect("/srv/emix/staging/data/backspace.db")
db.execute("UPDATE users SET username='leo', username_changed_at=NULL WHERE username='leo_check'")
db.commit(); db.close()

# Ringtones (1.14): a real upload goes through ffmpeg on the server.
buf = io.BytesIO()
with wave.open(buf, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(22050)
    w.writeframes(b"".join(struct.pack("<h", int(8000 * math.sin(2 * math.pi * 660 * i / 22050))) for i in range(22050 * 2)))
s, up = call("POST", "/api/ringtones", {"name": "Check tone", "data": base64.b64encode(buf.getvalue()).decode()}, tok["maya"])
check("WAV upload is re-encoded", s == 201 and 1500 < up["ringtone"]["durationMs"] < 2500, f"{s} {up}")
rid = (up or {}).get("ringtone", {}).get("id")
s, bad = call("POST", "/api/ringtones", {"name": "x", "data": base64.b64encode(b"<html>" * 20).decode()}, tok["maya"])
check("non-audio upload is refused", s == 400 and bad.get("code") == "ringtone_invalid_audio", f"{s} {bad}")
def audio_status(t):
    req = urllib.request.Request(f"{BASE}/api/ringtones/{rid}/audio", headers={"Authorization": f"Bearer {t}"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r: return r.status, r.headers.get("Content-Type")
    except urllib.error.HTTPError as e: return e.code, None
check("owner can play the upload", audio_status(tok["maya"]) == (200, "audio/ogg"))
check("private upload is hidden from others", audio_status(tok["leo"])[0] == 404)
s, _ = call("PUT", "/api/users/@me/ringtone-settings", {"settings": {"incoming": {"kind": "custom", "id": rid}, "shareEnabled": True}}, tok["maya"])
s, sh = call("GET", f"/api/users/{maya['id']}/shared-ringtone", None, tok["leo"])
check("the private incoming ringtone is never shared", s == 200 and sh["ringtone"] is None, f"{s} {sh}")
call("PUT", "/api/users/@me/ringtone-settings", {"settings": {"shared": {"kind": "custom", "id": rid}, "shareEnabled": True}}, tok["maya"])
s, sh = call("GET", f"/api/users/{maya['id']}/shared-ringtone", None, tok["leo"])
check("a shared ringtone reaches a friend", s == 200 and (sh["ringtone"] or {}).get("id") == rid, f"{s} {sh}")
check("and its audio plays for them", audio_status(tok["leo"])[0] == 200)
s, d = call("DELETE", f"/api/ringtones/{rid}", None, tok["maya"])
check("deleting clears the setting", s == 200 and d["settings"]["shared"] is None, f"{s} {d}")
call("PUT", "/api/users/@me/ringtone-settings", {"settings": {}}, tok["maya"])
print("failures:", fails)
sys.exit(1 if fails else 0)
